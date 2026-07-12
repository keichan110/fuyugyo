# Tailwind CSS / shadcn/ui を廃止し Mantine v9 に全面移行する

## Status

accepted

## Context

migration-hono ブランチで Next.js → Hono + React SPA への移行が完了したが、UIレイヤーは walking skeleton 状態で、ナビゲーション（ヘッダー）が未移植のままデプロイされた（#157, #158）。旧 Next.js 版のヘッダー・メニュー体系は新スタックに未移植であり、ここでUI全体を一新する機会が生まれた。

既存のスタイリングは Tailwind CSS v4 + shadcn/ui（button.tsx のみ）+ lucide-react だが、shadcn/ui はプリミティブ1つしか導入しておらず、コンポーネントライブラリとして機能していなかった。

## Decision

**Mantine v9 をUIフレームワークとして採用し、Tailwind CSS / shadcn/ui を完全に削除する。** 併用はしない。

- スタイリングは Mantine のシステム（CSS Modules + PostCSS）に統一する
- ブランドカラーはブルー系、ライトモード固定（ダークモード対応は将来）
- AppShell によるレイアウト、ロールベースのナビゲーション（一般ユーザー: シンプルなヘッダー、管理者: 管理メニュー追加）

Tailwind との併用は検討したが、2つのスタイリングシステムの共存はバンドルサイズ・スタイル一貫性・開発者認知負荷の観点でデメリットが上回ると判断した。shadcn/ui は button.tsx 1ファイルのみで移行コストが実質ゼロ。

## Consequences

- 全既存UIコンポーネントの書き直しが必要になるが、現時点で画面数が少なく（10画面未満）走り切れる規模。
- Mantine はコンポーネント・hooks・フォーム・日付等を統合提供するため、個別ライブラリの選定・統合コストが削減される。
- Mantine への依存度が高くなるが、1人開発で素早く整ったUIを構築する利点が勝る。
