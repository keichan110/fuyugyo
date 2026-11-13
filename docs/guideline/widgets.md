# 複数機能を組み合わせる UI

独立した widgets ディレクトリは設けていない。ナビゲーションやページレイアウトは `src/routes/components/`、複数画面で使う汎用 UI は `src/components/`、機能固有 UI は `src/features/<name>/components/` に配置する。

データの取得・更新は feature の `queries.ts` にまとめ、表示コンポーネントの責務に合わせてフックまたは Props を使う。
