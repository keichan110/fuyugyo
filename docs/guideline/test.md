# テスト

`pnpm run test` で Vitest を実行する。API 統合テストは `@cloudflare/vitest-pool-workers` と実 D1 を使い、マイグレーションを適用したローカル DB で検証する。個別実行は `pnpm run test -- test/<対象>.test.ts`。

- `test/` に既存テストと共通ヘルパーを配置する。
- API は正常系に加え、入力エラー・未認証・権限不足・対象不在などを確認する。
- DB や認証の振る舞いを大量のモックで置き換えず、実際の境界で検証する。
- 計算・集計等のロジックは、意味のある境界値を単体テストする。

テスト方針は ADR 0007 を参照。現行設定の正本は `vitest.config.ts` と `package.json`。
