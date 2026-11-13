# 旧スタックの資料

移行前の設計・調査資料を履歴として保存する。記載されたコード例・設定・デプロイコマンドは現行環境には適用しない。

- [現行の構成とセットアップ](../../README.md)
- [現行の実装ガイド](../guideline/overview.md)
- [現行のリリース手順](../settings/database-migration-deployment.md)

`db.md` は既存業務テーブル、`design/database-design.md` は認証拡張を中心とした旧設計で、認証テーブル等の記述が重複している。現行スキーマの正本は `src/server/db/schema.ts` と `drizzle/`。
