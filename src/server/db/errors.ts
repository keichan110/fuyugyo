/**
 * D1（SQLite）のエラー判定ユーティリティ。
 * read-then-write のレースを避け DB 制約に寄せる方針（ADR 0006）のため、
 * 制約違反を投げられた側で検出して適切な HTTP ステータスへ変換する。
 */

/**
 * SQLite UNIQUE 制約違反かどうかを判定する。
 * Drizzle/D1 はエラーを `cause` でラップする場合があるため両方を確認する。
 */
export function isUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  if (e.message.includes('UNIQUE constraint failed')) {
    return true;
  }
  if (e.cause instanceof Error && e.cause.message.includes('UNIQUE constraint failed')) {
    return true;
  }
  return false;
}
