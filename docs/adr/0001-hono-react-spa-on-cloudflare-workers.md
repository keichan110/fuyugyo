# Cloudflare Workers 上で Next.js を離れ Hono + React SPA を単一リポジトリで採用する

## Status

accepted

## Context

現行は Next.js 15 (App Router) を `@opennextjs/cloudflare`（コミュニティ製アダプタ）経由で CF Workers にデプロイしている。アダプタは ISR 非対応・SSR 部分サポート・Middleware 制約があり、CF Workers の V8 isolate モデルと Next.js の Node.js ランタイム設計の根本的ミスマッチを抱える。バージョン追従リスクも継続的に負う。

加えて、本システムは現在**停止中**で、2026 年末に新規稼働する。過去データの保全は不要（消失許容）。最適化対象は「移行の安全性」ではなく**今後の機能開発のしやすさ**。開発者は実質1人。

## Decision

- **API レイヤー**: Next.js API Routes / Server Actions → **Hono**（CF Workers ネイティブ、ミドルウェアチェーン、Hono RPC による型安全クライアント）
- **レンダリング**: App Router SSR → **React SPA（SSR なし）**。認証保護された管理ツールが主体で SEO・リッチプレビュー要件がないため、SSR の利点が活きない。静的アセット配信＋必要時のみ API 呼び出しで CF コストも最小。
- **リポジトリ構成**: Turborepo モノレポ（`apps/server` + `apps/web` 分割）は**採用しない**。1人開発のため、単一リポジトリ・単一ビルドに簡素化し、理解しやすさと開発速度を優先する。

## Consequences

- 共有可能な深いリンク（例: 特定勤務日 URL）は SPA + クライアントルーティングで実現可能。SSR は不要。
- 「リンクのリッチプレビュー(OGP)」だけは将来も SPA では困難だが、要件として存在しない（YAGNI）。
- TanStack Start 等の統合フルスタックフレームワークは魅力的だが成熟途上であり、年末リリースという期限に対して枯れている Hono + Vite SPA を選好した。
