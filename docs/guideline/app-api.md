# Hono API

- `src/features/<name>/api.ts` に Hono ルートを実装し、`src/index.ts` にマウントする。GET に加え POST/PATCH/DELETE 等もここで扱う。
- `createDb(c.env.DB)` で Drizzle クライアントを生成し、バインディングは `src/server/types.ts` の `Env` を使う。
- 認証は `requireAuth`、権限は `requireRole` 等の既存ミドルウェアを利用する。入力は Zod スキーマで検証する。
- 成功時は `c.json(data, status)` で生データと HTTP ステータスを返す。失敗は `HTTPException` を投げ、中央の `onError` で整形する（ADR 0005）。
- RPC の型推論を維持するため、既存の `certificationsRoute` のように Hono のメソッドチェーンで定義する。
- 複数書き込みの原子性が必要な場合は D1 の制約を踏まえ `db.batch()` を利用する（ADR 0006）。

実例: `src/features/certifications/api.ts`。API のテストは `test/` の実 D1 統合テストを参照。
