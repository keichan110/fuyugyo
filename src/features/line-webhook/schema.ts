import { z } from 'zod';

/**
 * Webhook 本文の最上位の形。
 * 個々のイベントは未対応の種類が混在するため、ここでは中身を検証しない。
 */
export const lineWebhookBodySchema = z.object({
  events: z.array(z.unknown()),
});

/**
 * 返信に対応するリッチメニューの操作値（`postback.data`）。完全一致だけを受け付ける。
 * 公開済みのメニューとの契約のため、値は `scripts/line-rich-menu/definitions.ts` と合わせる。
 */
export const lineReplyActionSchema = z.enum([
  'action=team-schedule',
  'action=my-schedule',
  'action=announcements',
]);

/** 返信に対応する操作値 */
export type LineReplyAction = z.infer<typeof lineReplyActionSchema>;

/**
 * 返信の対象となるイベント。
 * 個人トークの対応済みの操作で、LINE が再配信としてマークしていないものだけが一致する。
 */
export const lineReplyEventSchema = z.object({
  type: z.literal('postback'),
  webhookEventId: z.string().min(1),
  replyToken: z.string().min(1),
  deliveryContext: z.object({ isRedelivery: z.literal(false) }),
  source: z.object({ type: z.literal('user'), userId: z.string().min(1) }),
  postback: z.object({ data: lineReplyActionSchema }),
});

/** 返信の対象イベント */
export type LineReplyEvent = z.infer<typeof lineReplyEventSchema>;

/**
 * 個人ユーザーの友だち追加（ブロック解除を含む）イベント。
 * 割り当ては何度適用しても同じ結果になるため、再配信かどうかは問わない。
 */
export const lineFollowEventSchema = z.object({
  type: z.literal('follow'),
  source: z.object({ type: z.literal('user'), userId: z.string().min(1) }),
});
