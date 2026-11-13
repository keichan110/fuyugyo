# 本番リリース・デプロイ手順

本番デプロイは `main` へのマージでは走らない。`.github/workflows/release.yml`（Release ワークフロー）を手動実行したときだけデプロイし、成功時に GitHub Release を作成する。マージとデプロイを分けることで、シーズン中（12〜3月）の営業時間帯を避けて本番を切り替えられる。

## リリース手順

1. GitHub モバイルアプリ（または Web）でリポジトリを開く
2. **Actions → Release → Run workflow** を選び、ブランチは `main` のまま実行する
3. `deploy` → `health-check` → `release` の3ジョブがすべて成功したことを確認する
4. Releases に `vYYYY.MM.DD` のリリースが作られ、前回リリース以降の PR が並んでいることを確認する

`main` 以外のブランチを選んで実行した場合、ワークフローは何もせずに終了する。

### タグの形式

- JST の日付で `vYYYY.MM.DD`（例: `v2026.11.12`）
- 同日2回目以降は `vYYYY.MM.DD.2`、`vYYYY.MM.DD.3` と連番を付ける
- 同じタグを Cloudflare の Worker Version にも `--tag` として付けるため、`wrangler versions list` やダッシュボードで GitHub Release と対応付けられる

### リリースノート

`gh release create --generate-notes` で前回リリース以降にマージされた PR を自動で並べる。カテゴリは `.github/release.yml` で PR のラベルごとに分けている（`security` / `db-migration` / `enhancement` / `bug` / `dependencies` / `ci-cd`・`devops` / その他）。1つの PR は上から最初に当てはまるカテゴリにだけ載る。`skip-changelog` ラベルの PR は載らない。

ラベルは `.github/workflows/pr-labels.yml` が自動で付ける。

| ラベル                                                        | 付く条件                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `security` / `enhancement` / `bug` / `dependencies` / `ci-cd` | PR タイトル先頭の Gitmoji（🔒 / ✨ 💄 ⚡️ 等 / 🐛 🚑️ / ⬆️ 📌 等 / 👷 💚 🚀）。手動で種別ラベルを付けた場合はそちらを優先 |
| `db-migration`                                                | `drizzle/` 配下の変更を含む                                                                                             |
| `user-facing`                                                 | PR テンプレートの「利用者の画面・操作が変わる」にチェック                                                               |

**リリース前の確認ポイント**: 「🗃 DB マイグレーションあり」があればロールバックで DB が戻らないことを踏まえて時間帯を選ぶ。`user-facing` の PR が含まれていれば、利用者が少ない時間帯に出す。

### 最初のリリース

手動リリース方式へ切り替えた直後に一度 Release ワークフローを実行し、現在の `main`（＝その時点の本番相当）にタグを付ける。前回リリースが存在しないため、最初のリリースノートには過去の PR がまとめて並ぶ。必要なら GitHub 上で本文を編集してよい。

## ワークフローの処理順

1. `main` の最新をチェックアウトし、リリースタグを採番
2. 依存関係の固定インストール
3. GitHub secrets・variables の検証（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `APP_URL` / `LINE_CHANNEL_ID`）
4. Cloudflare 上に Worker secret（`JWT_SECRET` / `LINE_CHANNEL_SECRET`）が登録済みかを確認
5. production build
6. `wrangler d1 migrations apply fuyugyo --remote`
7. `wrangler deploy --tag <リリースタグ> --message "Release <タグ> (<sha>)"`
8. D1 にアクセスしない `/api/health` による Worker の応答確認
9. 7・8 が成功した場合のみ、タグと GitHub Release を作成（`release` ジョブだけが `contents: write` を持つ）

build が失敗した場合は本番 DB を変更しない。migration が失敗した場合は Worker をデプロイしない。失敗した migration は Wrangler がロールバックし、それ以前に成功した migration は適用されたまま残る（適用済み migration の自動バックアップ・巻き戻しはないため、DB を戻す必要があるときは後述の Time Travel を使う）。deploy が失敗した場合は additive な DB 変更だけが残り、稼働中の旧 Worker はそのまま動作する。デプロイまたはヘルスチェックが失敗した場合、タグとリリースは作られない。公開 health endpoint は攻撃者による D1 リクエストの増幅を避けるため、DB readiness を確認しない。スキーマ適用の成否は migration コマンドの終了コードで判定する。

同時実行は GitHub Actions の `deploy-production` concurrency group で直列化する。タグの採番もこの直列化を前提にしている。

## Worker secret の変更手順

ワークフローは Worker secret を設定しない。`wrangler secret put` は実行するたびに新しい Worker Version を作って即座に本番へデプロイするため、リリースのたびに入れ直すと意図しないタイミングで本番が切り替わり、リリースタグとも対応しなくなる。secret は変更が必要なときだけ手元から設定する。

```bash
# 営業時間外に実行する。現在の本番コードのまま secret だけ差し替えた新バージョンが即デプロイされる
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put LINE_CHANNEL_SECRET

# 確認（値は表示されない）
pnpm exec wrangler secret list
```

- `JWT_SECRET` を変更すると既存のセッションはすべて無効になり、利用者は再ログインが必要になる
- デプロイせずに secret 入りの新バージョンだけを作りたい場合は `wrangler versions secret put <NAME>` を使い、`wrangler versions deploy` で切り替える
- secret を変更した後は、それより前のバージョンへ `wrangler rollback` できなくなる場合がある（後述）
- GitHub 側の secrets `JWT_SECRET` / `LINE_CHANNEL_SECRET` はワークフローから参照しなくなったため削除してよい

## ロールバック手順

Worker のコードは直前（または任意）の Worker Version に戻せる。**D1 のデータ・スキーマは戻らない。**

```bash
# リリースタグ付きのバージョン一覧から戻し先の Version ID を確認する
pnpm exec wrangler versions list

# 指定バージョンへ戻す（ID を省略すると直前のバージョン）
pnpm exec wrangler rollback <VERSION_ID> --message "v2026.11.12 で不具合のため戻す"
```

スマホからは Cloudflare ダッシュボードの **Workers & Pages → fuyugyo → Deployments** でも同じ操作ができる。

- migration は後述の互換性ルールにより旧 Worker からも使えるため、通常は Worker のロールバックだけで復旧できる
- ロールバック先のバージョン作成後に secret を変更・削除していると、Cloudflare がロールバックを拒否する（エラーコード 10220）。その場合は修正版をリリースして前に進める
- ロールバックしても GitHub のタグ・Release はそのまま残る。該当リリースの本文に「ロールバック済み」と追記し、修正後に改めてリリースする
- ロールバック後に Release ワークフローを実行すると `main` の最新が再びデプロイされるので、修正をマージしてから実行する

## migration の互換性ルール

本番 migration は、適用前の Worker と適用後の Worker の両方から利用できなければならない。

- テーブル・列・index の追加は、既存コードの動作を変えない形で行う。
- 新しい NOT NULL 列は、旧 Worker の書き込みを壊さない default を持たせるか nullable で追加する。
- rename、削除、型や意味の変更は単一デプロイで行わない。
- 破壊的変更は expand/contract に分割する。先に新旧両方を扱えるスキーマとコードを配布し、データ移行と旧コード停止を確認した後、別デプロイで旧スキーマを削除する。

このルールにより、migration 完了から Worker デプロイ完了までの間も、Worker をロールバックした後も旧 Worker が動作できる。

## 障害時の判断

- migration 失敗: Workflow を停止したまま SQL を修正する。Worker は旧版のままなので、先に deploy しない。タグ・リリースは作られていない。
- deploy 失敗: additive migration は戻さず、deploy の原因を修正して再実行する。
- deploy 後の health check 失敗: GitHub Actions と Cloudflare のログを確認し、必要なら上記手順で直前の Worker Version にロールバックする。タグ・リリースは作られていない。DB 復元はデータ損失を伴うため、Worker のロールバックだけでは復旧できない場合に限る。
- DB 復元が必要: Cloudflare D1 の Time Travel で任意の時点に復元する。復元はデータベースを上書きし、指定時刻以降の書き込みは失われるため、影響範囲を確認してから実施する。

```bash
# 現在のブックマーク（復元ポイント）を確認
pnpm exec wrangler d1 time-travel info fuyugyo

# 指定時刻（migration 適用直前など）へ復元
pnpm exec wrangler d1 time-travel restore fuyugyo --timestamp=<UNIX秒 または RFC3339>
```

Time Travel の保持期間は Workers Paid プランで 30 日、Free プランで 7 日。

本番への deploy、remote migration、ロールバック、DB 復元は GitHub Actions または権限を持つ運用担当者が行い、開発エージェントからは実行しない。
