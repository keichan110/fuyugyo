/** 招待トークンから招待リンク（LINEログイン誘導URL）を組み立てる。 */
export function buildInviteUrl(origin: string, token: string): string {
  return `${origin}/api/auth/line/login?invite=${token}&redirect=/`;
}

/** 日本時間で日時の各要素を取り出すフォーマッタ（生成コストを避けるためモジュールで1度だけ作る） */
const JST_DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 日時を日本時間の 'YYYY/MM/DD HH:mm' 形式でフォーマットする。 */
export function formatDateTimeJst(date: Date): string {
  const parts = JST_DATE_TIME_FORMAT.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

/** LINE で共有する文面。残り時間の誤解を避けるため実際の期限（日本時間）を書く。 */
export function buildShareMessage(expiresAt: Date): string {
  return `シフト管理アプリへの招待です。下のリンクから LINE ログインして登録してください。\n有効期限: ${formatDateTimeJst(expiresAt)}（日本時間）`;
}

/** 文面と招待 URL を LINE の共有（送信先選択）画面へ渡す URL を組み立てる。 */
export function buildLineShareUrl(message: string, inviteUrl: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(`${message}\n${inviteUrl}`)}`;
}
