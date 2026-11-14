# ブラウザのエラー監視

Issue #270 の React SPA 向け設定。Worker の監視は #269 で導入する。

## GitHub Actions の設定

リポジトリの Actions Variables に以下を登録する。

| 名前              | 値                                       |
| ----------------- | ---------------------------------------- |
| `VITE_SENTRY_DSN` | ブラウザ用プロジェクトの DSN（公開可能） |
| `SENTRY_ORG`      | Sentry の組織 slug                       |
| `SENTRY_PROJECT`  | Sentry のプロジェクト slug               |

リポジトリの **Settings → Secrets and variables → Actions → Secrets** に以下を登録する。

| 名前                | 値・用途                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN` | Sentry の認証トークン。ビルド時のソースマップのアップロードとリリース作成に使用する |

トークンは Sentry の組織設定にある **Auth Tokens** から発行する。発行先は [Sentry 公式の設定手順](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/#configuration)を参照する。個人用トークンを使う場合は **Project: Read & Write** と **Release: Admin** の権限が必要。

`SENTRY_AUTH_TOKEN` はビルド専用の秘密情報であり、公開可能な DSN とは用途が異なる。Actions Variables やブラウザ用環境変数には登録せず、`VITE_` 接頭辞も付けない。Release ワークフローが設定の検証とビルド時に使用する。Worker の実行環境では使わないため、Worker の secret 登録は不要。

Release ワークフローが実際にチェックアウトしたコミット SHA を `VITE_SENTRY_RELEASE` として渡す。[Worker 側](./sentry-worker.md)にも同じ SHA を `SENTRY_RELEASE` として渡す。

DSN が未設定なら SDK の初期化を行わず、通常どおり動作する。DSN が設定された本番ビルドではアップロード設定も必須とし、不足時はワークフローを停止する。

ソースマップはトークンがあるクライアントビルドだけで hidden として生成し、Sentry プラグインでアップロード後に `dist/client/**/*.map` を削除する。Worker ビルドにはこの生成設定と Sentry プラグインを適用しない。公開アセットに `.map` が残る場合はデプロイを停止する。

## ローカルでの確認

ブラウザ用の DSN を設定する場合は `.env.local` に `VITE_SENTRY_DSN` を記載する。未設定が既定。アップロード用トークンはローカル開発には不要。

通知対象は Router が捕捉した描画・読み込みエラーと、SDK が自動収集する未処理例外・Promise rejection。Session Replay とトレースは有効にしない。

通信断による fetch の既知の TypeError、AbortError、status を持つ 4xx 例外、ResizeObserver の既知の警告、拡張機能のみのスタックを除外する。HTTP 4xx レスポンス自体を Sentry のイベントには変換しない。認証ガードが使う本人確認クエリはステータスを保持して投げ直すため、4xx を除外し、5xx は通知する。他の取得処理が通常の Error に変換した場合はステータスが失われるため、この判定では除外できない。

## 本番設定後の受け入れ確認

1. 検証環境で一時的な描画エラーを発生させ、エラー画面と再読み込みボタンが表示されることを確認する。
2. Sentry にイベントが届き、release がデプロイ SHA と一致し、元の TSX の位置が読めることを確認する。
3. 未処理例外・Promise rejection の通知と、オフライン fetch・AbortError の除外を確認する。
4. 公開アセットに `.map` がなく、DSN 未設定のビルドも起動することを確認する。

参考: [Sentry の Vite 設定](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/)、[イベントのフィルタリング](https://docs.sentry.io/platforms/javascript/guides/react/configuration/filtering/)。
