import { z } from 'zod';

/**
 * Webhook 本文の最上位の形。
 * 個々のイベントは未対応の種類が混在するため、ここでは中身を検証しない。
 */
export const lineWebhookBodySchema = z.object({
  events: z.array(z.unknown()),
});

/**
 * オウム返しの対象となるイベント。
 * 個人トークの空でないテキストで、LINE が再配信としてマークしていないものだけが一致する。
 */
export const lineEchoEventSchema = z.object({
  type: z.literal('message'),
  webhookEventId: z.string().min(1),
  replyToken: z.string().min(1),
  deliveryContext: z.object({ isRedelivery: z.literal(false) }),
  source: z.object({ type: z.literal('user') }),
  message: z.object({ type: z.literal('text'), text: z.string().min(1) }),
});

/** オウム返しの対象イベント */
export type LineEchoEvent = z.infer<typeof lineEchoEventSchema>;
