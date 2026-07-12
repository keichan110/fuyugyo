# ShiftType を部門横断の共有カタログとし、部門別の可用性・表示順を junction テーブルで持つ

## Status

accepted

## Context

`shift_types` は当初、部門に紐づかないグローバルなマスタとして実装した（`id`/`name`/`is_active`）。`shifts` は `department_code` と `shift_type_id` を独立に持ち、シフト作成フォームは**部門に関係なく全アクティブ種別**を提示していた（`shifts/api.ts` の form endpoint）。結果、スキー・スノーボードいずれの部門でも同じ種別集合が選べ、「その部門では使わない種別」を絞り込めなかった。

運用要件として次の3点が挙がった:

- **部門ごとに使える種別を絞りたい**（部門に不要な種別は選択できないように）
- **部門ごとに表示順を設定したい**（優先度の高い種別を先頭に）
- **既存データを破壊せず移行したい**

論点は「ShiftType と Department の関係をどうモデル化するか」だった。`Certification` は「ちょうど1つの Department に属する」（CONTEXT.md）ため、対称的に ShiftType にも `department_code` を持たせる案（所有モデル）が自然にも見える。しかし実データの種別（終日／午前／午後）は時間帯を表す**部門中立な概念**で、スキーの「午前」とスノーボードの「午前」は同じ意味である。所有モデルにすると共有中の種別を部門ごとに複製することになり、「同一概念が別レコードで重複する」二重管理を生む。

## Decision

**ShiftType は部門横断の共有カタログのまま据え置き、「どの部門がどの種別を、どの順で使えるか」を新テーブル `department_shift_types`（Department × ShiftType の junction）で表す。**

- `department_shift_types`: `id` / `department_code`(text) / `shift_type_id`(FK→`shift_types`, `onDelete: cascade`) / `sort_order`(integer) / timestamps。`unique(department_code, shift_type_id)`、index on `department_code`。
- **`sort_order` は junction＝部門ごと**に持つ。同一種別がスキーで1番・スノーボードで3番、が表現できる。
- **可用性の唯一の真実は junction**。`POST /shifts` は (departmentCode, shiftTypeId) が junction に無ければ 400 で拒否する（アプリ層 Zod で担保、ADR 0011 踏襲）。
- 部門コードには DB の FK も CHECK も置かない（ADR 0011 と一貫。`department_code` は固定語彙の text）。
- **無効化は2階層**:
  - グローバル `shift_types.is_active`（カタログ無効化）＝ 全部門で一括して新規登録ピッカーおよび新規画面の「追加」候補から隠す。junction 行は保持し可逆。
  - 部門別の除外（junction 行のハード削除）＝ 1部門だけ外す。無条件で許可し、警告・ブロックは設けない。
  - どちらも**既存 Shift の表示・データには影響しない**（シフト閲覧 `fetchShiftView` は junction・`is_active` を見ず種別を innerJoin するため）。

### 画面ごとの可視性ルール

| 画面                               | 種別の見せ方                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| shifts（閲覧）                     | junction・`is_active` に関わらず全 Shift を表示（既存データ保護）                                                                                |
| shifts/manage（グリッド）          | 行 = junction 可用 かつ `is_active=true` の種別のみ。可用性から外れた種別の既存 Shift は編集不可（閲覧は shifts で）                             |
| department-shift-types（新規画面） | 部門タブ＋並べ替えリスト。その部門の junction 行は `is_active` に関わらず全表示・除外/並べ替え可。「＋追加」カタログは `is_active=true` のみ提示 |
| shift-types（既存カタログ）        | 種別の作成/改名/`is_active` 切替。各行にその種別を可用にしている部門バッジを表示し、`is_active=false` 判断の指標とする                           |

## Considered Options

- **所有モデル（`shift_types.department_code`, 1種別=1部門）**: `Certification` と対称で中間テーブル不要、部門フィルタも自明。しかし部門中立な種別（午前/午後/終日）を部門ごとに複製する必要があり、同一概念の重複と二重管理を生むため却下。
- **UI フィルタのみ（junction は表示絞り込み専用）**: 実装は軽いが、API を直接叩けば不整合な (部門, 種別) の Shift を作れる。可用性を「真実」にできないため却下。
- **除外/無効化時に参照有無でブロック**: 誤操作防止にはなるが、DB/UI レベルでのブロックは ADR 0011 の「整合性はアプリ層のゲートで担保」思想と非対称。既存 Shift は表示・保持され続けデータは失われない（可逆）ため、ブロックは不要と判断し却下。

## Consequences

- **移行は完全に追加的（additive）**。既存テーブル・列を一切変更/削除せず、`department_shift_types` を新規作成し **{ski, snowboard} × 全 `shift_types`** のクロス積でバックフィルする（`sort_order` は部門ごとに `name` 順で採番）。これにより移行直後は現行挙動（全部門が全種別を選べる）を完全に保持し、既存 Shift の孤児化も起きない。移行後に管理者が不要な組を間引く。
- Drizzle 生成 SQL はバックフィル INSERT を含まないため**手補正**する（部門コードはテーブルが無いため SQL 内に literal 列挙）。本番 remote への適用はレビュー後に手動で行う（Claude は実行しない）。ADR 0011 と同じ運用。
- **可用性から外れた (部門, 種別) の既存 Shift は shifts/manage で編集できなくなる**（閲覧は shifts で可能）。割り当てを直す場合は一旦その種別を部門へ再追加する。これは意図的な割り切り。
- 新規画面は feature slice `src/features/department-shift-types/`、ルート `/department-shift-types`、設定メニュー「マスタ管理」に「部門別シフト種別」を追加（MANAGER 以上）。junction テーブルは `src/server/db/schema.ts`。
- API 形状は raw JSON + Hono RPC（ADR 0005）、書き込みは Drizzle D1 batch（ADR 0006）、テストは実 D1 統合テスト（ADR 0007）を踏襲する。
