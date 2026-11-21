/**
 * 実 D1 に委譲しつつ、指定した batch の直前に一度だけ別の書き込みを割り込ませるテスト用ラッパー。
 *
 * 「事前確認の後・書き込み batch の前」に他リクエストが先に書き込んだ状況を決定論的に作る。
 * prepare / exec 等は実 D1 へそのまま委譲し、SQL 文字列の細部・呼び出し回数・時間待ちには依存しない。
 * 複数の HTTP リクエストを真に同時実行するものではなく、1 本の割り込みを確実に挟むための検証手段である。
 */
export type D1Interruption = {
  /** ルートへ渡すラッパー（`env.DB` の代わり） */
  db: D1Database;
  /** 割り込みを実行した回数。各テストで 1 回だけ実行されたことを確認する */
  interruptCount: () => number;
};

/**
 * `batch` の直前に一度だけ `interrupt` を実行する D1 ラッパーを作る。
 *
 * @param db - 委譲先の実 D1（`env.DB`）
 * @param interrupt - batch 直前に一度だけ実行する別書き込み（実 D1 へ書き込む）
 */
export function interruptBeforeBatch(
  db: D1Database,
  interrupt: () => Promise<void>,
): D1Interruption {
  let count = 0;
  const wrapped: D1Database = {
    prepare: (query) => db.prepare(query),
    batch: async (statements) => {
      if (count === 0) {
        count += 1;
        await interrupt();
      }
      return await db.batch(statements);
    },
    exec: (query) => db.exec(query),
    withSession: (constraintOrBookmark) => db.withSession(constraintOrBookmark),
    dump: () => db.dump(),
  };
  return { db: wrapped, interruptCount: () => count };
}
