# 機能の配置

`src/features/<name>/` に機能単位で共置する。必要なファイルのみ作り、共通化は実際の利用に合わせて行う。

```text
api.ts       Hono ルート・DB 操作（サーバー専用）
schema.ts    Zod スキーマ・入出力の型（双方で共有）
queries.ts   TanStack Query の取得・更新フック（クライアント専用）
components/  機能固有の React UI
```

クライアントから `api.ts` や `src/server/` の値を import しない。型のみの参照は `import type` を使う。API 呼び出しは `src/lib/rpc.ts` の `client` を使用する。

新しい機能では既存の `src/features/certifications/` を参考に、[API](./app-api.md) と [データ取得](./fetch-data.md) を実装する。

ドメインの型や Zod スキーマは所有する feature の `schema.ts` に共置し、他機能から必要に応じて参照する（例: `src/features/departments/`）。DB の正本は `src/server/db/schema.ts` とし、ブラウザの入出力型は共有スキーマから定義する。
