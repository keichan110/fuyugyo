# Worker の Sentry 通知

Worker の fetch・scheduled を `@sentry/cloudflare` の `withSentry` で監視する。SPA の設定は [sentry-browser.md](./sentry-browser.md) を参照。

## 設定

- `wrangler.toml` の `[vars]` に `SENTRY_DSN` を定義する。値は Worker 用プロジェクト（`fuyugyo-worker`）の DSN を使う。通常の Release ワークフローでデプロイすると Cloudflare Worker の Vars に反映される。
- DSN は公開可能な送信先情報のため、`JWT_REFRESH_INTERVAL` などと同様に設定ファイルで管理する。GitHub Actions Variables や Cloudflare Secret への登録は不要。
- `SENTRY_RELEASE` は Release ワークフローがデプロイ対象のコミット SHA を `wrangler deploy --var` で渡す。SPA と同じ SHA になる。
- DSN が空なら通知を無効にする。ローカルで本番プロジェクトへ通知しないよう、`.dev.vars` に `SENTRY_DSN=""` を設定する。ローカルでも通知を試す場合は検証用プロジェクトの DSN に置き換える。
- テストでは `vitest.config.ts` のバインディングで `SENTRY_DSN` を空に上書きし、本番への通知を無効にする。

すでに Cloudflare に同名の Secret を登録済みの場合は、Vars と競合するためリリース作業時に削除してからデプロイする。SDK の送信に `SENTRY_AUTH_TOKEN` は不要。ソースマップのアップロードに使う `SENTRY_AUTH_TOKEN` は引き続き GitHub Actions Secrets で管理する。

## 通知対象

- 中央 `onError` で捕捉した通常の例外と 500 以上の `HTTPException`。4xx・リダイレクトは通知しない。レスポンス形式は変更しない。
- LINE の token・profile API の非 2xx。エンドポイントと HTTP ステータスだけを付ける。token API の 400 `invalid_grant` は使用済み・期限切れ認証コードとして除外し、他の認証設定エラーや 5xx は通知する。
- 天気取得の失敗と、失敗ログの D1 保存エラー。HTTP ステータスが得られた場合はタグに付ける。
- ハンドラ外へ伝播する例外は SDK のラッパーが捕捉する。Cron は処理完了後に通知を flush する。

## 送信データ

SDK v11 の `dataCollection` でユーザー情報・Cookie・HTTP ヘッダ・本文・URL クエリの自動収集を無効化する（旧 SDK の `sendDefaultPii: false` に相当）。さらに送信直前に request と breadcrumbs を削除し、OAuth コード・招待トークン・JWT がそれらを通じて送信されることを防ぐ。認証後に設定する user は内部 ID のみ。LINE のエラー本文、プロフィール、アクセストークンは通知に付けない。トレース・Replay・ログ転送は有効化しない。

## メール通知

Sentry の Worker 用プロジェクトで Issue Alert を作成し、以下を設定する。

1. トリガーは **新しい issue が作成されたとき** と **解決済み issue が再発したとき** のいずれかに一致する条件にする。
2. アクションは担当者または担当チームへのメール通知にする。受信先アカウントのメール通知設定も確認する。
3. 既定の頻度・件数ベースの通知ルールがあれば見直し、今回の方針と重複する通知を止める。

この設定はリポジトリの変更だけでは反映されない。Sentry 管理画面での作業が必要。

## 本番確認

DSN 登録とリリース後、機密情報を含まないテスト例外を一時的な検証環境で発生させ、イベントの release がデプロイ SHA と一致すること、request・breadcrumbs・個人情報がないこと、新規・再発のメールが届くことを確認する。恒久的な公開テストエンドポイントは設置しない。

## 死活監視（Uptime Monitor）

Sentry 管理画面での設定が必要。Worker 用プロジェクト（`fuyugyo-worker`）で以下を設定する。

1. **Monitors** から **Uptime Monitor** を作成する。自動作成された監視がある場合は先に確認し、重複して追加せず対象 URL を変更する。
2. URL は実際に利用者がアクセスする本番のオリジンに `/api/health` を付ける。`wrangler.toml` の `APP_URL` はローカル向けのため、その値を流用しない。
3. Method は `GET`、Interval は `5 minutes`、Timeout は `10 seconds`、Failure Tolerance は `3`、Recovery Tolerance は `1` にする。認証ヘッダや Cookie は不要。正常時の HTTP 200 を確認する。
4. downtime の issue に一致する Alert を作成し、担当者・担当チームへメールを送るアクションを設定する。受信先のメール通知設定も確認する。

`/api/health` は既存のまま D1 にアクセスしない。ここでは Worker の応答を確認し、D1 の異常はユーザー操作・天気取得のエラー通知で検知する。

## 天気取得の定期実行監視（Cron Monitor）

`scheduled` が `captureCheckIn` で開始時に `in_progress`、完了時に `ok` または `error` を送る。同じチェックイン ID で開始と完了を紐付ける。監視は最初のチェックインで作成され、以後もコードから設定を更新する。

| 項目                              | 値                                                  |
| --------------------------------- | --------------------------------------------------- |
| Monitor slug                      | `weather-fetch`                                     |
| Schedule                          | `ScheduledController.cron`（現在は `23 */3 * * *`） |
| Timezone                          | `Etc/UTC`                                           |
| Check-in margin（開始の許容遅延） | 5分                                                 |
| Max runtime（完了までの制限）     | 5分                                                 |
| Failure issue threshold           | 1回                                                 |
| Recovery threshold                | 1回                                                 |

Cloudflare から渡された cron 式を使うため、`wrangler.toml` のスケジュール変更は、リリース後最初のチェックインで同じ監視に反映される。変更後は Sentry 側の次回実行予定も確認する。

HTTP 200・304 と、地点未登録・Expires 前による取得不要は `ok`。通信・レスポンス解析・D1 の読み書きの失敗は `error` とする。失敗ログの保存にも失敗した場合も `error` を維持する。開始が届かなければ missed、開始後に完了が届かなければ最大実行時間超過として検知する。

管理画面では以下を設定・確認する。

1. リリース後の次の Cron 実行を待ち、Worker 用プロジェクトで `weather-fetch` が作成され、上表の設定とチェックインが表示されることを確認する。別の slug で重複作成しない。
2. Issue Alert の条件を `monitor.slug equals weather-fetch` にし、新規・再発の issue で担当者・担当チームへメールを送る。既存の Issue Alert がこの監視も通知する場合は重複させない。
3. 初回の正常実行で `in_progress` → `ok` を確認する。ローカルの DSN が空の場合と自動テストでは送信しない。

### 障害・未実行時の通知確認

本番を停止したり本番 Cron を無効化したりせず、検証用 Worker・Sentry プロジェクトで確認する。検証用 Monitor も契約の枠を消費するため、追加作成前に利用枠を確認する。

- Uptime: 検証用の監視先を失敗する URL にして、連続失敗後の issue とメールを確認する。正常な `/api/health` に戻し、回復も確認する。
- Cron 失敗: 検証用 Worker で天気 API の取得を失敗させ、`error` のチェックイン・issue・メールを確認する。
- Cron 未実行: 監視が一度正常にチェックインした後、検証用 Worker のトリガーを止める。次回予定時刻から5分を過ぎて missed とメールを確認する。
- Cron 中断: 検証環境から開始だけを送り、5分を超えた時点で失敗の issue とメールを確認する。

確認後は検証用設定を戻し、不要な監視を削除する。本番での監視登録・通知先設定・受信確認はリポジトリの変更だけでは完了しない。

参考: [Sentry Cloudflare ラッパー](https://docs.sentry.io/platforms/javascript/guides/cloudflare/install/wrangler/)、[データ収集設定](https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#dataCollection)、[Cloudflare の Cron 監視](https://docs.sentry.io/platforms/javascript/guides/cloudflare/crons/)、[Uptime Monitor の設定と通知](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/)。
