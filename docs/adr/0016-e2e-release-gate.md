# 重要業務のE2Eをリリースゲートにする

## Status

accepted

ADR 0007 の「E2Eを採用しない」「Vitestのみ」の決定を、この範囲で更新する。

## Context

実D1統合テストだけでは、画面操作・API接続・公開後の別ロールの表示や、本番ビルドの配信を通して確認できない。#274で整備したスモークに加え、#275では本番変更前のリリース判断を自動化する。

## Decision

- 単体・実D1統合テストを主役に維持し、多分岐の計算や入力境界はそちらで検証する。
- PlaywrightのフルE2Eは、主要業務のハッピーパスと重大な禁止操作をChromium・モバイルWebKitで検証する。全コード・全組合せの100%カバレッジは求めない。
- PRは開発サーバー上のChromiumスモーク、Releaseは同一checkoutでbuildしたWorker・静的アセットのローカル配信を対象とする。
- Releaseの既存deployジョブ内で、build→フルE2E→本番migration→deployの順を守る。不合格時は本番変更を開始せず、証跡だけを短期保存する。
- 本番データ・外部LINE OAuth・push通知はE2E対象外。認証は専用ダミーJWT、DBは専用ローカルD1を使う。

## Consequences

E2E合格は、対象の重要シナリオが検証環境で成立したことを示す。本番設定、実データ、外部サービス、migrationの新旧コード互換性まで保証しない。既存のmigrationレビュー、デプロイ後health、監視を維持する。

全件の保守コストと実行時間が増えるため、重要な振る舞いを確認する安定したlocatorと、独立した更新データを使う。詳しい調査と出典は `docs/research/275-e2e-release-gate.md` を参照。
