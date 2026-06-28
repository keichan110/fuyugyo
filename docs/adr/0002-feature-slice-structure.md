# フィーチャースライスを唯一の構成単位とする

## Status

accepted

## Context

現行は Next.js のコロケーション規約を踏襲しているが、リアーキに伴い構造の考え方を再構築する。開発者は1人で、最優先事項は開発スピードと認知負荷の最小化。単一リポジトリ・Hono API + React SPA 構成（[ADR 0001](./0001-hono-react-spa-on-cloudflare-workers.md)）を前提とする。

## Decision

**フィーチャースライスを第一の構成単位とする。** レイヤー（server/client）は二次的な区別とし、機能で縦割りする。

```
src/
  index.ts              # Worker エントリ: Hono に各 feature の API を mount + アセット配信
  main.tsx              # SPA エントリ: TanStack Router 起動
  routes/               # TanStack Router の配線のみ（薄い）。features/ の Page を import するだけ
  features/<name>/
    api.ts              # Hono ルート（サーバー専用。index.ts からのみ import）
    schema.ts           # Zod（サーバー/クライアント共有・isomorphic）
    queries.ts          # TanStack Query フック（クライアント）
    components/          # React（クライアント）
  server/               # 横断サーバー: db（Drizzle）, middleware（認証・Rate Limit）, env
  components/ui/         # shadcn/ui プリミティブ（global）
  lib/                  # client/server 共有の汎用ユーティリティ
```

- 1機能のサーバーコードは `api.ts` に集約し、クライアントは `import type { AppType }` のみで RPC 型を取得する。
- global/shared に置くのは本当に横断的なものだけ（UI プリミティブ、認証ミドルウェア、DB クライアント）。

## Consequences

- Vite クライアントビルドと Worker サーバービルドは別グラフのため、`api.ts` は値 import されない限りクライアントに混入しない。
- 混入防止は **ESLint `no-restricted-imports`** で機械的に強制する（`components/`・`queries.ts` から `api.ts` の値 import を禁止、type import は許可）。`*.server.ts` 命名規約は採らない。
- ルーティングは TanStack Router のファイルベースを使い、`routes/` は配線のみ、ページ実体は `features/` に置く。
