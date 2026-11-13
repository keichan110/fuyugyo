# 実装ガイド

Vite + React SPA を Cloudflare Workers の静的アセットとして配信し、同一 Worker の Hono API を Hono RPC + TanStack Query で呼び出す。UI は Mantine と共通ラッパーを使用する。

- [ページと認証](./app.md): TanStack Router
- [API](./app-api.md): Hono + Drizzle
- [機能の配置](./features.md): API・スキーマ・クエリ・UI の共置
- [データ取得と更新](./fetch-data.md): Hono RPC + TanStack Query
- [共有コード](./shared.md): 共通 UI とユーティリティ
- [テスト](./test.md): Vitest + 実 D1

ディレクトリを増やす前に既存の配置を確認する。サーバーの認証・認可が権限判定の正本で、画面のガードだけに依存しない。設計判断の経緯は `docs/adr/`、旧資料は `docs/legacy/` に保存している。
