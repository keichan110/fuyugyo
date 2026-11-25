import type { BatchItem } from 'drizzle-orm/batch';
import { z } from 'zod';

import type { Database } from '@/server/db/client';
import { notifications } from '@/server/db/schema';

import { notificationInputSchema, type NotificationInput } from './schema';

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
