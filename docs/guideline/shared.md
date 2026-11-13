# 共通 UI とユーティリティ

- `src/components/`: `AppButton`、`AppTable` 等の Mantine ラッパーと共通 UI。新しい UI は既存ラッパーを確認してから追加する。
- `src/lib/`: RPC クライアント、QueryClient、テーマ等の共通基盤。
- `src/server/`: DB・認証・ミドルウェア等のサーバー専用コード。
- アイコンは `@tabler/icons-react`、スタイリングは Mantine と CSS Modules を利用する。

特定機能だけで使うコードはその機能に共置する。ブラウザとサーバーの境界を守り、サーバー専用モジュールを共通 UI から値 import しない。
