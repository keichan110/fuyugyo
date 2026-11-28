/**
 * LINE Messaging API の Webhook。
 * LINE Login とは別チャネルの認証情報を使い、受信は Webhook 署名で認証する。
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { assignInstructorRichMenu } from '@/server/line/rich-menu';
import type { Env } from '@/server/types';

import {
  lineEchoEventSchema,
  lineFollowEventSchema,
  lineWebhookBodySchema,
  type LineEchoEvent,
} from './schema';

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const REPLY_TIMEOUT_MS = 5000;

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

/** 返信対象のイベントを、同一リクエスト内の `webhookEventId` の重複を除いて抽出する。 */
function selectEchoEvents(events: unknown[]): LineEchoEvent[] {
  const targets = new Map<string, LineEchoEvent>();
  for (const event of events) {
    const parsed = lineEchoEventSchema.safeParse(event);
    if (parsed.success) targets.set(parsed.data.webhookEventId, parsed.data);
  }
  return [...targets.values()];
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
 * 受信したテキストをそのまま返信する。失敗しても例外は投げず、再試行もしない。
 * ログには秘密情報や本文が混入しないよう、固定の失敗種別と HTTP ステータスだけを残す。
 */
async function sendReply(accessToken: string, event: LineEchoEvent): Promise<void> {
  const signal = AbortSignal.timeout(REPLY_TIMEOUT_MS);
  try {
    const response = await fetch(REPLY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: event.message.text }],
      }),
      signal,
    });
    if (!response.ok) {
      console.error('[line-webhook] reply failed', {
        kind: 'http_error',
        status: response.status,
      });
    }
    // 応答本文は使わないため破棄する。破棄の失敗は返信の成否に影響しない。
    await response.body?.cancel().catch(() => undefined);
  } catch {
    console.error('[line-webhook] reply failed', {
      kind: signal.aborted ? 'timeout' : 'network_error',
    });
  }
}

/**
 * LINE Messaging API の Webhook の Hono ルート。
 * 署名を検証した受信に空本文の 200 を返す。友だち追加では対象ユーザーに個別リッチメニューを
 * 割り当て、検証モードではテキストをオウム返しする。
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
      // 友だち追加前の紐付けをここで反映する。オウム返しの設定には依存しない
      c.executionCtx.waitUntil(
        Promise.all(followerIds.map((userId) => assignInstructorRichMenu(c.env, userId))),
      );
    }
    if (c.env.LINE_MESSAGING_ECHO_ENABLED !== 'true') return c.body(null, 200);

    const targets = selectEchoEvents(events);
    if (targets.length === 0) return c.body(null, 200);

    const accessToken = c.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      throw new HTTPException(503, { message: 'LINE reply is not configured' });
    }
    // LINE への応答を Reply API の完了待ちにしない
    c.executionCtx.waitUntil(Promise.all(targets.map((event) => sendReply(accessToken, event))));
    return c.body(null, 200);
  });
