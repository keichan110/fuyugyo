import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';

import { createDb, type Database } from '@/server/db/client';
import { notifications } from '@/server/db/schema';
import { requireAuth, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import {
  DEFAULT_NOTIFICATION_LIMIT,
  notificationInputSchema,
  notificationListQuerySchema,
  type NotificationInput,
} from './schema';

/**
 * 通知を保存する INSERT を組み立てる（サーバー専用）。ここでは実行しないため、
 * 呼び出し元が業務更新の操作と同じ `db.batch` に並べ、まとめて確定させる。
 *
 * 同じユーザー・同じ `eventKey` の通知が保存済みなら何もせず、件名・本文・リンク・
 * 作成日時・既読日時を上書きしない。宛先が存在しないなど、重複以外の失敗は batch 全体を失敗させる。
 *
 * @param db - Drizzle クライアント
 * @param inputs - 保存する通知（宛先ユーザーごとに1件）
 * @returns 通知1件につき1つの INSERT。`inputs` が空なら空配列
 * @throws {z.ZodError} 1件でも入力が不正な場合（INSERT を組み立てる前に投げる）
 */
export function buildNotificationInserts(
  db: Database,
  inputs: readonly NotificationInput[],
): BatchItem<'sqlite'>[] {
  // D1 の1文あたりの変数上限に達しないよう、複数行 INSERT にせず1通知を1文にする
  return z
    .array(notificationInputSchema)
    .parse(inputs)
    .map((values) =>
      db
        .insert(notifications)
        .values(values)
        .onConflictDoNothing({ target: [notifications.userId, notifications.eventKey] }),
    );
}

/** 一覧の並び順（作成日時・ID の降順）上の位置 */
type NotificationPosition = { createdAt: Date; id: string };

/** 通知一覧の読み取り条件 */
export type NotificationListOptions = {
  /** 返す件数の上限 */
  limit: number;
  /** 未読の通知だけを返すか */
  unreadOnly: boolean;
  /** この位置より後（古い側）の通知を返す。省略すると先頭から返す */
  after?: NotificationPosition | undefined;
};

/** 本人の通知の一覧と未読総数を読むクエリを組み立てる。呼び出し元が1つの batch で実行する。 */
function buildNotificationListQueries(
  db: Database,
  userId: string,
  { limit, unreadOnly, after }: NotificationListOptions,
) {
  const owned = eq(notifications.userId, userId);
  const unread = isNull(notifications.readAt);
  // 作成日時が同じ通知は ID の順で続きを判定し、ページの境目で欠落・重複させない
  const afterPosition =
    after &&
    or(
      lt(notifications.createdAt, after.createdAt),
      and(eq(notifications.createdAt, after.createdAt), lt(notifications.id, after.id)),
    );
  return {
    owned,
    list: db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        actionUrl: notifications.actionUrl,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(and(owned, unreadOnly ? unread : undefined, afterPosition))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      // 次のページの有無を判定するため、1件多く読む
      .limit(limit + 1),
    unreadTotal: db.select({ value: count() }).from(notifications).where(and(owned, unread)),
  };
}

/** `buildNotificationListQueries` の結果を、上限件数の一覧と未読総数にする。 */
function toNotificationList<Item>(items: Item[], totals: { value: number }[], limit: number) {
  return {
    items: items.slice(0, limit),
    hasNext: items.length > limit,
    unreadCount: totals[0]?.value ?? 0,
  };
}

/**
 * 本人の通知を新しい順（作成日時・ID の降順）に読み、未読の総数を添える（サーバー専用）。
 * 読み取りだけを行い、既読状態は変えない。
 *
 * @param db - Drizzle クライアント
 * @param userId - 通知の宛先ユーザー ID。認証済みの本人の値を渡す
 * @param options - 件数の上限、未読だけにするか、続きを読む位置
 * @returns 上限件数までの通知、続きの有無、ページや条件によらない本人の未読総数
 */
export async function listNotifications(
  db: Database,
  userId: string,
  options: NotificationListOptions,
) {
  const { list, unreadTotal } = buildNotificationListQueries(db, userId, options);
  // 一覧と未読総数が同じ時点の値になるよう、1つの batch で読む
  const [items, totals] = await db.batch([list, unreadTotal]);
  return toNotificationList(items, totals, options.limit);
}

/**
 * 本人の未読通知を新しい順に読み、未読の総数と通知の有無を添える（サーバー専用）。
 * 未読が0件のときに、通知がないのか既読だけなのかを区別するために使う。
 *
 * @param db - Drizzle クライアント
 * @param userId - 通知の宛先ユーザー ID。認証済みの本人の値を渡す
 * @param limit - 返す件数の上限
 * @returns 上限件数までの未読通知、本人の未読総数、既読を含む本人の通知があるか
 */
export async function listUnreadNotifications(db: Database, userId: string, limit: number) {
  const { owned, list, unreadTotal } = buildNotificationListQueries(db, userId, {
    limit,
    unreadOnly: true,
  });
  // 一覧・未読総数・有無が同じ時点の値になるよう、1つの batch で読む
  const [items, totals, existing] = await db.batch([
    list,
    unreadTotal,
    db.select({ id: notifications.id }).from(notifications).where(owned).limit(1),
  ]);
  return { ...toNotificationList(items, totals, limit), hasAny: existing.length > 0 };
}

/** 一覧の並び順上の位置を cursor 文字列にする。 */
function encodeCursor(position: NotificationPosition): string {
  return `${Math.floor(position.createdAt.getTime() / 1000)}_${position.id}`;
}

/** 形式を検証済みの cursor 文字列を、並び順上の位置に戻す。 */
function decodeCursor(cursor: string): NotificationPosition {
  const separator = cursor.indexOf('_');
  return {
    createdAt: new Date(Number(cursor.slice(0, separator)) * 1000),
    id: cursor.slice(separator + 1),
  };
}

/**
 * ログイン中のユーザー本人の通知を、一覧・既読化する Hono ルート。
 * 通知はサーバー内の業務処理だけが作るため、作成の API は持たない。
 */
export const notificationsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
  /** 本人の通知を新しい順に1ページ分と、未読の総数を返す。 */
  .get(
    '/me',
    requireAuth,
    validator('query', (value, c) => {
      const parsed = notificationListQuerySchema.safeParse(value);
      if (!parsed.success) return c.json({ message: parsed.error.message }, 400);
      return parsed.data;
    }),
    async (c) => {
      const {
        limit = DEFAULT_NOTIFICATION_LIMIT,
        cursor,
        unreadOnly = false,
      } = c.req.valid('query');
      const { items, hasNext, unreadCount } = await listNotifications(
        createDb(c.env.DB),
        c.get('user').userId,
        { limit, unreadOnly, after: cursor === undefined ? undefined : decodeCursor(cursor) },
      );

      const last = items.at(-1);
      return c.json({
        items,
        nextCursor: hasNext && last ? encodeCursor(last) : null,
        unreadCount,
      });
    },
  )
  /** 本人の通知を既読にする。既読済みでも成功し、初めて既読にした日時を保つ。 */
  .put('/:id/read', requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const [updated] = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, unixepoch())` })
      .where(
        and(
          eq(notifications.id, c.req.param('id')),
          eq(notifications.userId, c.get('user').userId),
        ),
      )
      .returning({ id: notifications.id, readAt: notifications.readAt });
    // 他人の通知は存在を知らせないため、存在しない ID と同じ応答にする
    if (!updated) throw new HTTPException(404, { message: 'Notification not found' });
    return c.json(updated);
  });
