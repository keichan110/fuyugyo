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
