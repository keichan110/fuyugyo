# ドメインの共有

独立した entities ディレクトリは設けていない。ドメインの型や Zod スキーマは `src/features/<name>/schema.ts` に共置し、必要な機能から参照する。例: 部門の共有定義は `src/features/departments/`。

DB の正本は `src/server/db/schema.ts`。ブラウザで必要な入出力型は共有スキーマから定義し、サーバーコードへの値の依存を避ける。
