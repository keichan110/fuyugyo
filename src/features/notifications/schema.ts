import { z } from 'zod';

/** 空白だけの文字列を拒否する。値は整形せず、渡された文字列のまま扱う。 */
const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, '空白だけの文字列は指定できません');

/**
 * アプリ内リンクに含められない文字（バックスラッシュ・Unicode の空白・制御文字）。
 * URL パーサーはタブや改行を取り除くため、許すと `/<TAB>/host` が外部を指す `//host` になる。
 */
const FORBIDDEN_APP_PATH_CHARACTERS = /[\\\s\p{Cc}]/u;

/** 同じオリジン内を指すパス（`/` 1つで始まる文字列）か判定する。 */
function isAppPath(value: string): boolean {
  return (
    value.startsWith('/') && !value.startsWith('//') && !FORBIDDEN_APP_PATH_CHARACTERS.test(value)
  );
}

/**
 * 保存する通知1件の入力。件名・本文・リンクは生成元が確定した値をそのまま保存する。
 * `actionUrl` はアプリ内パスだけを受け付け、省略時は null になる。
 * `eventKey` は出来事の識別子で、表示文言からは作らず生成元が指定する。
 */
export const notificationInputSchema = z.object({
  userId: nonBlankStringSchema,
  title: nonBlankStringSchema,
  body: nonBlankStringSchema,
  actionUrl: z
    .string()
    .refine(isAppPath, 'actionUrl はアプリ内のパスを指定してください')
    .nullable()
    .default(null),
  eventKey: nonBlankStringSchema,
});

/** 通知の保存を依頼する側が渡す値。 */
export type NotificationInput = z.input<typeof notificationInputSchema>;

/** 通知一覧で `limit` を省略したときの件数。 */
export const DEFAULT_NOTIFICATION_LIMIT = 20;

/** 通知一覧で1回に取得できる件数の上限。 */
export const MAX_NOTIFICATION_LIMIT = 50;

/** cursor の形（作成日時の epoch 秒と通知 ID を `_` でつないだ文字列）。 */
const NOTIFICATION_CURSOR_PATTERN =
  /^\d{1,10}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 本人の通知一覧のクエリ。既定値はサーバーが補う。
 * `cursor` は前のページの `nextCursor` を渡し、省略すると先頭から返す。
 */
export const notificationListQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'limit は整数で指定してください')
    .transform(Number)
    .pipe(z.number().min(1).max(MAX_NOTIFICATION_LIMIT))
    .optional(),
  cursor: z.string().regex(NOTIFICATION_CURSOR_PATTERN, 'cursor の形式が不正です').optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** 本人に返す通知1件。`readAt` が null の通知は未読。 */
export const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  actionUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

/** 本人の通知一覧レスポンス。`unreadCount` はページ内ではなく本人の未読総数。 */
export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});

/** 既読化レスポンス。`readAt` は初めて既読にした日時。 */
export const notificationReadResponseSchema = z.object({
  id: z.string(),
  readAt: z.iso.datetime(),
});

/** 本人に返す通知1件。 */
export type Notification = z.infer<typeof notificationSchema>;
