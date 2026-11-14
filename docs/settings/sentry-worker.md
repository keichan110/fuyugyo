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

参考: [Sentry Cloudflare ラッパー](https://docs.sentry.io/platforms/javascript/guides/cloudflare/install/wrangler/)、[データ収集設定](https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#dataCollection)。
