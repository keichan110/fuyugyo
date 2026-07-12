# Department をテーブルからコード側の固定分類語彙へ移し、shifts/certifications は department_code を持つ

## Status

accepted

## Context

Department（部門）は当初、管理者が運用中に自由に CRUD できる開いた集合として `departments` テーブルで実装した（`id`/`code`/`name`/`description`/`isActive`）。狙いは「部門が増えてもプログラム改修が要らない」柔軟性だった。

しかし実態として、スキースクールの部門はスキー／スノーボードの2つで固定され、増減は極めて稀。CONTEXT.md でも Department は「小さく安定した固定分類語彙」と定義している。「コード変更なしで部門を追加できる」柔軟性は使いどころが乏しく、むしろ次の負債を生んでいた:

- **識別性の欠如**: 部門がテキスト（`name`）でしか表現されず、シフト一覧等でスキー／スノーボードを一目で区別できない。色・アイコンで識別性を上げたいが、それを DB の可変値として持つと「色を選ぶ UI」「色重複バリデーション」「未設定フォールバック」まで抱え込み、数個の語彙に対して過剰。
- **投機的一般化**: 開集合前提のフォーム・バリデーション・`code` フリーテキストが、実際には固定の語彙に対して残っていた。

色・アイコン・ラベルという「部門の視覚的アイデンティティ」を DB に持つか、コード側に持つかが論点になり、それは「Department が可変エンティティか固定語彙か」というモデリングの問いに帰着した。

## Decision

**Department を「コード側の固定分類語彙」としてモデル化し、`departments` テーブルを廃止する。**

- コード側に `DepartmentCode = 'ski' | 'snowboard'`（`z.enum`）を定義し、これを唯一の真実とする。ラベル・色（Mantine トークン）・アイコン（Tabler）は `DepartmentCode` をキーにした**全域マップ**（`Record<DepartmentCode, ...>`）で持つ。部門を足すと TypeScript がマップの穴埋めを型で強制するため、「部門を足したのに色を付け忘れる」がコンパイルエラーになる。
- `shifts` / `certifications` は FK の `department_id` をやめ、`department_code`（text）を直接保持する。既存の生データは `departments.code`（実値 `ski` / `snowboard`）からバックフィルする。
- **整合性はアプリ層（Hono API 境界の `z.enum`）のみで担保し、DB の FK も CHECK 制約も置かない。** これにより「部門追加＝コード変更のみ・マイグレーション不要」という柔軟性を、投機的な DB 可変性ではなく型安全な形で得る。
- 視覚表現の設計: Department は最上位の分類色となり、それに属する Certification は所属部門の色を継承する。Instructor は単一部門を持たない（資格経由で複数部門にまたがる）ため、部門色では塗らず department ニュートラルとする。
- 廃止に伴い `departments` の API・queries・CRUD UI・`/departments` ルートも削除する。

段階的に、(1) コード側語彙・視覚アイデンティティの導入と表示差し替え（DB 不変）→ (2) 書き込み経路の code 化・`department_id`→`department_code` 移行・テーブル/API 削除、の順で 2 コミットに分ける。

## Considered Options

- **enum 制約テーブル + CRUD 維持**: `code` を enum 制約しつつテーブルと CRUD を残す。変更は最小だが、開集合の behavior と DB 可変性が中途半端に残る。却下。
- **固定シードテーブル（テーブル・FK を残す）**: DB の FK 整合性を維持でき移行不要だが、「DB の部門行」と「コードの enum」を永続的に同期し続ける**二重の真実**が残る。当初「足枷」と呼んだものが名を変えて残るため却下。
- **DB CHECK 制約で整合性を担保**: FK 喪失の穴を CHECK(`department_code IN (...)`) で埋める案。DB レベルの厳格さは得られるが、部門追加のたびに SQLite のテーブル再構築マイグレーションが必要になり、本決定の柔軟性の狙いと相反する。全書き込みが Zod 検証済み API 経由である本アプリでは、失う整合性は理論上のものと判断し却下。

## Consequences

- **`department_code` は DB レベルではただの text**であり、実在値の保証は Hono API の `z.enum` に一元化される。生 SQL 等の API 外経路には保証が及ばない点は意図的。将来「なぜ FK も CHECK も無いのか」と疑問に思う読者のために本 ADR を残す。
- **部門の追加/無効化はコード変更＋デプロイを伴う**（enum 値とマップ 1 箇所の追加）。日々の運用操作ではなく稀な意図的変更、という Department の性質（CONTEXT.md）と一致する。`isActive` によるソフト無効化は廃止。将来「一時的に部門を隠す」要件が出たら、DB ではなくコード側マップに `hidden` フラグを足して対応する（YAGNI）。
- **本番ライブデータへの移行が必要**。`department_id`→`department_code` は「新カラム追加 → `departments.code` からバックフィル → `department_id` 列を落としテーブル再構築 → `departments` 削除」の順序を保証する必要がある（順序を誤ると値が消える）。Drizzle 生成 SQL はバックフィル UPDATE を含まないため手補正する。本番 remote への適用はレビュー後に手動で行う（Claude は実行しない）。
- API 形状は raw JSON + Hono RPC（ADR 0005）、書き込みは Drizzle D1 batch（ADR 0006）を踏襲。テストは実 D1 統合テスト（ADR 0007）で、`department_code` ベースの読み書きを境界検証する。既存フィクスチャの `code: 'snow'` は本番実値の `snowboard` へ揃える。
