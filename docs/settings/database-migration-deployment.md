# 本番リリース・デプロイ手順

本番デプロイは `main` へのマージでは走らない。`.github/workflows/release.yml`（Release ワークフロー）を手動実行し、ドラフト確認・ビルド・フル E2E・承認を済ませてから本番へ反映する。デプロイとヘルスチェックが成功した場合だけ、そのドラフトを正式公開する。

## 初回の GitHub 設定

リポジトリの **Settings → Environments** で `production` を作成し、次を設定する。承認ルールは YAML だけでは設定できない。

- **Required reviewers** に運用担当者を登録する。
- 1人で開始と承認を行う場合、**Prevent self-review** は無効にする。
- **Allow administrators to bypass configured protection rules** を無効にする。
- Deployment branches and tags は `main` のブランチだけを許可する。

ワークフローは準備時と本番操作前に、Required reviewers が登録済みで管理者バイパスが無効なことを検証する。未設定・削除・API の参照失敗では停止し、承認なしで本番へ進まない。本番用の `CLOUDFLARE_API_TOKEN` は `production` の Environment secret に登録し、同名の repository secret と、このリポジトリへ共有されている organization secret は削除・共有解除する。同名の repository secret を残すと、承認前の別ジョブから本番トークンを利用できるため、Environment への追加だけでは隔離にならない。GitHub の secrets は値を読み出せないため、手元のトークンを登録するか Cloudflare で再発行して登録する。トークンは必要な本番 Worker・D1 への最小権限に限定する。

`CLOUDFLARE_ACCOUNT_ID` は認証情報ではないため、既存の repository secret のまま利用できる。`APP_URL`・`LINE_CHANNEL_ID` などの variables と、build で使う Sentry の設定は既存のスコープを維持する。承認前の build へ本番 Cloudflare トークンは渡さず、認証情報と Worker secrets の存在確認は承認後の deploy で行う。このため Cloudflare 側の設定漏れは承認後に検出される。

Required reviewers は public リポジトリなら利用できる。private に戻す場合、Enterprise 以外では利用できないため、事前に承認方式を別の手動ワークフロー等へ変更する。private 化だけで同じ運用を続けない。

参考: [GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[デプロイの承認](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)

## リリース手順

1. **Actions → Release → Run workflow** を選び、ブランチを `main` のまま実行する。
2. `prepare` の実行サマリーに表示されるリリース候補のリンクと完全な SHA を確認する。実行開始時点の SHA が固定され、待機中に main が進んでも変わらない。
3. ドラフトの変更一覧・DB マイグレーション・運用メモを確認し、必要なら本文を編集する。ビルドと E2E はこの確認と並行して進む。
4. `build`・`e2e` 成功後、Actions の **Review deployments → production → Approve and deploy** で承認する。見送る場合は Reject または実行をキャンセルする。
5. `deploy` → `health-check` → `release` の成功を確認する。ドラフトのタイトルと本文を保持したまま正式公開される。GitHub Releases の Publish ボタンは承認に使わない。

`main` 以外で実行した場合は何もせず終了する。同じ最新公開リリースの SHA を再デプロイする場合も、ビルド・E2E・承認は必要。既存タグを再利用し、新しいドラフトの作成や公開は行わない。ただし管理対象の未公開ドラフトが残っている場合は、候補を上書きせず停止する。本番状態とドラフトの意図を確認し、不要な候補を取り下げてから再デプロイする。

### ドラフトの更新

このワークフローが管理する未公開ドラフトは1件だけにする。管理情報は本文末尾の HTML コメントに保存するため、削除・編集しない。

- **同じ SHA**: 既存のドラフトと編集済み本文を保持し、品質チェックを再実行する。
- **別 SHA、デプロイ開始前**: 同じドラフトの対象 SHA と自動生成の変更一覧を更新する。「運用メモ」など自動生成範囲外の記述は保持する。更新した候補の内容確認・品質チェック・承認が改めて必要になる。
- **デプロイ開始後**: 別 SHA への更新を拒否する。本番操作途中の候補を上書きせず、先に同じ SHA で復旧するか、本番状態を確認して候補を取り下げる。

`<!-- release-notes:start -->` と `<!-- release-notes:end -->` の間は、別 SHA に更新すると再生成される。同じ SHA の再実行ではこの範囲も保持する。恒久的な手動補足は「運用メモ」に記載する。

承認待ちを含む全実行は `deploy-production` concurrency group で直列化する。新しく Run workflow しても、待機中の古い実行は自動で置き換わらない。候補を更新したい場合は、先に古い承認待ちを Reject またはキャンセルしてから新しく実行する。古い実行を再実行しても、別実行で更新済みの候補は本番操作前の検証で拒否される。

### タグとリリースノート

- 新規タグは準備時の JST 日付で `vYYYY.MM.DD`。同日2件目以降は `.2`、`.3` と採番する。
- 既存タグと未公開ドラフトのタグの両方を避けて採番する。ドラフト更新時は元のタグを再利用するため、準備日と公開日が異なる場合がある。
- タグはドラフトの公開時に固定 SHA へ作成される。既存タグは動かさず、その SHA が異なる場合は停止する。
- 同じタグを Cloudflare Worker Version にも付け、GitHub Release と対応付ける。
- pre-release は使用しない。成功するまではドラフト、成功後は正式リリースとする。

リリースノートは GitHub の自動生成 API を使い、最新の正式公開リリースから候補 SHA までの変更を列挙する。カテゴリは `.github/release.yml` の PR ラベル設定を使用し、利用者が目にする変更を優先して「機能追加・改善 → バグ修正 → セキュリティ → DB マイグレーション → 依存関係の更新 → CI・運用 → その他」の順に並べる。個々の変更の影響度を自動判定するものではないため、特に影響が大きい変更はドラフトの冒頭に手動で補足する。

| ラベル | 付け方 |
| --- | --- |
| `enhancement` / `bug` / `security` / `ci-cd` | PR 作成時に手動で1つ付ける |
| `db-migration` | `drizzle/` の変更から自動で付く |
| `dependencies` | Renovate が付ける |

1つの PR は上から最初に一致するカテゴリに載り、`skip-changelog` の PR は除外する。最初のリリースでは過去の PR がまとめて並ぶため、必要なら本文を編集する。DB 変更を伴う機能追加・修正は先に一致した機能・修正のカテゴリに載るため、「DB マイグレーションあり」の見出しだけで判断せず、対象 PR の `db-migration` ラベルも確認する。DB 変更がある場合は、DB は通常のロールバックで戻らないことを確認して時間帯を選ぶ。

## ワークフローの処理順

1. `prepare`: 承認設定を検証し、固定 SHA のドラフトを作成・更新する（最新公開版と同じ SHA なら再デプロイ扱い）。
2. `build`: ビルド用の secrets・variables の存在確認、production build、公開成果物の sourcemap 残留チェック、成果物保存。
3. `e2e`: 同じ成果物をローカル Worker・専用 D1 で起動し、Chromium・モバイル WebKit のフル E2E を実行。
4. `deploy`: production の承認後、同じ実行の成果物を取得する。本番認証情報と Worker secrets の存在確認もこのジョブで行う。ドラフトの ID・タグ・SHA・管理情報の実行 ID と承認設定を再検証し、デプロイ開始を記録する。
5. `wrangler d1 migrations apply fuyugyo --remote` → `wrangler deploy`。
6. `health-check`: `/api/health` で応答確認する。D1 へのアクセスは行わない。
7. `release`: ドラフトが同じ候補のままであることを再検証し、本文を再生成せず公開する。

品質チェックは1回だけ。承認後に再ビルド・E2E はせず、検証済みの成果物を使う。成果物は7日間保持する。期限切れならデプロイ前に停止するため、候補の準備からやり直す。

## 失敗時・再実行

準備済みのドラフトは、ビルド・E2E・承認拒否・キャンセル・migration・deploy・health-check の失敗では削除・公開しない。承認前は本番 DB・Worker を変更しない。ただし、build 時の Sentry sourcemap アップロードは実施される場合がある。

- **ビルド・E2E 失敗**: Actions の失敗ステップと `release-playwright-results` artifact（保持3日）を調べる。証跡には認証 Cookie 等を含み得るため、そのまま公開しない。同じ SHA なら失敗ジョブを再実行できる。修正が必要なら main へ反映して新しく実行し、既存ドラフトを更新する。
- **承認拒否・キャンセル**: ドラフトは残る。本番操作開始前なら新しい実行で更新できる。
- **migration・deploy・health-check 失敗**: 本番の状態を確認し、同じ SHA の失敗ジョブを再実行する。deploy を再実行する場合は承認も必要。途中で成功した migration は残る。旧 Worker と新スキーマの互換性が必要。
- **公開処理だけ失敗**: `release` ジョブを再実行する。ビルド・E2E・デプロイを繰り返さず、同じドラフトを公開する。すでに公開できていた場合は公開状態とタグを確認し、再実行せず成功済みとして扱う。
- **開始済みの候補を取り下げる**: 本番状態を確認・必要ならロールバックし、ドラフトの運用メモを記録してからドラフトを手動削除する。その後、新しい実行で修正版の候補を準備する。公開済みのタグは動かさない。

フル E2E をローカルで再現する場合は候補 SHA を checkout し、`pnpm install --frozen-lockfile`、`pnpm exec playwright install chromium webkit`、`pnpm run test:e2e` を実行する。trace は `pnpm exec playwright show-trace <trace.zipのパス>` で確認する。通常リリースで E2E を迂回しない。

候補管理の回帰テストは PR の CI の `pnpm run test:scripts` に含まれる。単独では `node --test .github/scripts/release.test.mjs` で実行できる。GitHub API を差し替えるため本番操作は行わない。

ヘルスチェックは D1 readiness を確認しない。migration の成否はコマンド終了コードで判定し、外部 OAuth や既存データとの互換性は運用確認・監視で補う。

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

- migration 失敗: Workflow を停止したまま SQL を修正する。Worker は旧版のままなので、先に deploy しない。ドラフトは未公開のまま残る。
- deploy 失敗: additive migration は戻さず、deploy の原因を修正して再実行する。
- deploy 後の health check 失敗: GitHub Actions と Cloudflare のログを確認し、必要なら上記手順で直前の Worker Version にロールバックする。ドラフトは未公開のまま残る。DB 復元はデータ損失を伴うため、Worker のロールバックだけでは復旧できない場合に限る。
- DB 復元が必要: Cloudflare D1 の Time Travel で任意の時点に復元する。復元はデータベースを上書きし、指定時刻以降の書き込みは失われるため、影響範囲を確認してから実施する。

```bash
# 現在のブックマーク（復元ポイント）を確認
pnpm exec wrangler d1 time-travel info fuyugyo

# 指定時刻（migration 適用直前など）へ復元
pnpm exec wrangler d1 time-travel restore fuyugyo --timestamp=<UNIX秒 または RFC3339>
```

Time Travel の保持期間は Workers Paid プランで 30 日、Free プランで 7 日。

本番への deploy、remote migration、ロールバック、DB 復元は GitHub Actions または権限を持つ運用担当者が行い、開発エージェントからは実行しない。
