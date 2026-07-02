# テストは Vitest + 実 D1 統合テストを主役にし、E2E と重いモックは採用しない

## Status

accepted

## Context

現行テストは34ファイルあるが全て重いモック（Prisma, NextResponse, NextRequest, auth）で、「モックの振る舞いをテストしているだけ」で実動作の保証が弱い。新アーキは Hono RPC + Drizzle + Zod により型安全性が大幅に上がるため、型で防げるものはテストで書かない。開発者は1人で、最優先は開発速度。依存は増やさない方針。

## Decision

- **テストランナーは Vitest のみ**。
- **統合テストを主役にする**: Hono ルートを Miniflare（`@cloudflare/vitest-pool-workers`）上の**実 D1（ローカル SQLite）**に対して検証する。ID 採番（`crypto.randomUUID()`）含め本番と同じ振る舞いを検証。**Prisma/NextResponse モックは全廃**。
- **ユニットテストはロジックが濃い所に集中**: シフト集計・週/月計算・日付/祝日ユーティリティ・Zod 境界など純粋関数。
- **E2E（Playwright）は採用しない**。壊れやすく遅く、1人開発・依存最小化方針に見合わない。
- 型で保証されるもの（RPC の引数/レスポンス型、Drizzle のクエリ型）はテストを書かない。

## Consequences

- 「モックの振る舞いをテスト」問題が構造的に解消される。
- 認証フローやシフト表示の通し確認は手動 + 統合テストで担保し、自動 E2E は持たない。必要になれば後日追加を検討する。
