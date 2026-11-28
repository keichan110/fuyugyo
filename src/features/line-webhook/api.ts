/**
 * LINE Messaging API の Webhook。
 * LINE Login とは別チャネルの認証情報を使い、受信は Webhook 署名で認証する。
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { createDb, type Database } from '@/server/db/client';
import type { LineMessage } from '@/server/line/message';
import { sendLineReply } from '@/server/line/reply';
import { findLineReplyUser, type LineReplyUser } from '@/server/line/reply-user';
import { assignInstructorRichMenu } from '@/server/line/rich-menu';
import type { Env } from '@/server/types';

import { buildAnnouncementsMessage } from './announcements/api';
import { buildMyScheduleMessage } from './my-schedule/api';
import {
  lineFollowEventSchema,
  lineReplyEventSchema,
  lineWebhookBodySchema,
  type LineReplyAction,
  type LineReplyEvent,
} from './schema';
import { buildTeamScheduleMessage } from './team-schedule/api';

/** 操作値ごとの返信内容の組み立て。操作値を追加すると、ここの定義漏れが型エラーになる */
const REPLY_BUILDERS: Record<
  LineReplyAction,
  (db: Database, user: LineReplyUser) => Promise<LineMessage>
> = {
  'action=team-schedule': buildTeamScheduleMessage,
  'action=my-schedule': buildMyScheduleMessage,
  'action=announcements': buildAnnouncementsMessage,
};

/**
 * 受信したバイト列に対する署名（HMAC-SHA256 の Base64 表現）を検証する。
 * Base64 として解釈できない署名は不一致として扱う。
 */
async function verifySignature(
  channelSecret: string,
  signature: string,
  body: ArrayBuffer,
): Promise<boolean> {
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, body);
}

/** 本文を解析してイベント一覧を取り出す。形式が不正なら 400 を投げる。 */
function parseEvents(body: ArrayBuffer): unknown[] {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body));
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON' });
  }
  const parsed = lineWebhookBodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid webhook body' });
  }
  return parsed.data.events;
}

/**
 * 返信対象のイベントを抽出する。
 * 同一リクエスト内で `webhookEventId` か Reply token が重複するイベントは、最初の1件だけを残す。
 */
function selectReplyEvents(events: unknown[]): LineReplyEvent[] {
  const eventIds = new Set<string>();
  const replyTokens = new Set<string>();
  const targets: LineReplyEvent[] = [];
  for (const event of events) {
    const parsed = lineReplyEventSchema.safeParse(event);
    if (!parsed.success) continue;
    const { webhookEventId, replyToken } = parsed.data;
    if (!eventIds.has(webhookEventId) && !replyTokens.has(replyToken)) targets.push(parsed.data);
    eventIds.add(webhookEventId);
    replyTokens.add(replyToken);
  }
  return targets;
}

/** 友だち追加したユーザーの ID を、同一リクエスト内の重複を除いて抽出する。 */
function selectFollowerIds(events: unknown[]): string[] {
  const userIds = new Set<string>();
  for (const event of events) {
    const parsed = lineFollowEventSchema.safeParse(event);
    if (parsed.success) userIds.add(parsed.data.source.userId);
  }
  return [...userIds];
}

/**
 * 送信者を認可してから返信内容を組み立てて返信する。許可されていないユーザーには返信しない。
 * 例外は D1 のクエリ引数（LINE ユーザー ID）を含み得るため、固定の失敗種別だけを記録する。
 */
async function respond(env: Env, accessToken: string, event: LineReplyEvent): Promise<void> {
  try {
    const db = createDb(env.DB);
    const user = await findLineReplyUser(db, event.source.userId);
    if (!user) return;
    const message = await REPLY_BUILDERS[event.postback.data](db, user);
    await sendLineReply(accessToken, event.replyToken, [message]);
  } catch {
    console.error('[line-webhook] reply failed', { kind: 'processing_error' });
  }
}

/**
 * LINE Messaging API の Webhook の Hono ルート。
 * 署名を検証した受信に空本文の 200 を返す。友だち追加では対象ユーザーに個別リッチメニューを
 * 割り当て、リッチメニューの操作には個人トークで返信する。
 */
export const lineWebhookRoute = new Hono<{ Bindings: Env }>()
  /** Webhook を受信する（認証は `x-line-signature` ヘッダーの署名） */
  .post('/', async (c) => {
    const signature = c.req.header('x-line-signature');
    if (!signature) {
      throw new HTTPException(401, { message: 'Invalid signature' });
    }
    const channelSecret = c.env.LINE_MESSAGING_CHANNEL_SECRET;
    if (!channelSecret) {
      throw new HTTPException(503, { message: 'LINE webhook is not configured' });
    }
    // 署名は受信したバイト列そのものが対象のため、解析前の本文で検証する
    const body = await c.req.arrayBuffer();
    if (!(await verifySignature(channelSecret, signature, body))) {
      throw new HTTPException(401, { message: 'Invalid signature' });
    }

    const events = parseEvents(body);
    const followerIds = selectFollowerIds(events);
    if (followerIds.length > 0) {
      // 友だち追加前の紐付けをここで反映する
      c.executionCtx.waitUntil(
        Promise.all(followerIds.map((userId) => assignInstructorRichMenu(c.env, userId))),
      );
    }
    const targets = selectReplyEvents(events);
    if (targets.length === 0) return c.body(null, 200);

    const accessToken = c.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      throw new HTTPException(503, { message: 'LINE reply is not configured' });
    }
    // LINE への応答を返信内容の取得と Reply API の完了待ちにしない
    c.executionCtx.waitUntil(
      Promise.all(targets.map((event) => respond(c.env, accessToken, event))),
    );
    return c.body(null, 200);
  });
