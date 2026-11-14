# 週次メンテナンス

`Weekly Maintenance` は毎週月曜 9:00（日本時間）と `workflow_dispatch` で実行する。GitHub の混雑で開始が遅れることがある。main 以外を指定した手動実行ではジョブをスキップする。

## 本番依存の監査

`pnpm audit --prod --audit-level=high` で、lockfile に記録された本番依存を監査する。high 以上があれば audit ジョブが失敗する。GitHub Actions の通知設定に応じて失敗通知を受け取る。

依存のインストールや `audit --fix` は実行しない。通常の更新は Renovate に任せ、監査では修正版がない場合や更新が失敗している場合などの取りこぼしを確認する。脆弱性の公開で無関係な PR が止まらないよう、PR の必須チェックには audit を含めない。

## 未リリース変更の確認

audit とは独立したジョブで実行するため、監査に失敗しても未リリースの通知は更新される。

最新の公開 Release のタグをコミットに解決し、main との差分に含まれる PR を一覧にした「未リリースの変更があります」という issue を作成・更新する。管理用マーカーを持つ GitHub Actions 作成の issue だけを対象にする。

- リリースに main が追いついた後の次回実行で、管理用 issue を閉じる。
- 再び未リリース変更が生じたら、同じ issue を再オープンする。
- 初回リリース前は main の全コミットを未リリースとして扱う。
- PR に紐づかないコミットも件数と差分リンクで知らせる。PR は重複を除き、最大100件を表示する。
- Release の履歴が main と分岐している場合や API の取得失敗時は、issue を誤って更新・クローズせずジョブを失敗させる。

Release ワークフローはデプロイとヘルスチェック成功後に Release を作成するため、そのタグを本番反映済みの基準にする。判定対象はジョブ開始時に checkout した main であり、実行中に進んだ変更は次回実行で検知する。手動で作成・変更した Release は、本番反映の記録として正しいことを別途確認する。

## 導入後の確認

Issue #266 の初回通常更新と既知の脆弱性の解消を確認してから、この変更をマージする。

マージ後、Actions の `Weekly Maintenance` から `Run workflow` を実行する。監査の終了状態、未リリース PR の一覧、既存 issue の更新を確認する。Release 後に再実行し、issue が閉じることも確認する。本番デプロイは Release ワークフローで手動実行する。

PR の `quality-check` は lint・format・test・build を実行し、build 内で型チェックも行う。ジョブ名は main のブランチ保護と同じ `quality-check` を維持する。React Doctor の main push はスコア推移の記録用として残す。

未リリース検知のローカル検証:

```bash
node --test scripts/check-unreleased-changes.test.mjs
```
