# ページとレイアウト

- `src/routes/` に TanStack Router のファイルルートを配置する。`src/routeTree.gen.ts` は自動生成のため編集しない。
- `src/main.tsx` で MantineProvider・QueryClientProvider・RouterProvider を設定する。
- ページ固有のレイアウトは `src/routes/components/`、機能 UI は `src/features/<name>/components/` に共置する。
- 保護ページは既存ルートの `beforeLoad` と `ensureAuthenticated` を参考に実装する（例: `src/routes/certifications.tsx`）。権限が必要な操作は API 側でも必ず検証する。
- ローディング・エラー・空状態を表示し、入力や URL の値は対応するスキーマで検証する。
