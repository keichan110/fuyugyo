# ORM を Drizzle にし、原子性は db.batch + DB 制約で担保、ID は crypto.randomUUID を使う

## Status

accepted

## Context

本システムは停止中で過去データの保全は不要（[ADR 0001](./0001-hono-react-spa-on-cloudflare-workers.md)）。そのため Prisma を温存する移行リスク回避の動機が消え、CF Workers ネイティブ基盤として最適な ORM を最初から選べる。

D1 はインタラクティブトランザクション（`BEGIN`...アプリロジック...`COMMIT`）をサポートしない。これは ORM に依存しない D1 固有の制約であり、Prisma を続けても解決しない。現行はシフト本体と複数アサインの作成が原子的でない。

## Decision

- **ORM は Drizzle** に確定。D1 ファーストクラスサポート、軽量（cold start 有利）、double-await 不要、リクエスト毎の PrismaClient 生成オーバーヘッドなし。Prisma は破棄。
- **原子性は `db.batch([...])`** で担保する。複数行を原子的に書く操作（シフト + 複数アサイン）はバッチで囲む。インタラクティブ Tx は使わない（D1 非対応を受容）。
- **read-then-write のレースは DB 制約に寄せる**。既存のユニーク制約（例: `(date, department_id, shift_type_id)`）と `ON CONFLICT` ハンドリングで原子性を確保し、アプリ側の事前チェックに依存しない。
- **ID は `crypto.randomUUID()`**（Workers 組込み）を使う。cuid は廃止し、依存を増やさない。

## Consequences

- 依存ライブラリを最小化する方針（無駄な依存を増やさない）と整合。
- Prisma スキーマは Drizzle スキーマ定義に書き換える。データは作り直すため移行スクリプトは不要。
