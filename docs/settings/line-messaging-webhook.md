# LINE Messaging API の Webhook 検証

`POST /api/line/webhook` で Webhook を受信し、検証モードでは個人トークのテキストをそのまま返信（オウム返し）する。ここでは検証用の LINE 公式アカウントと検証用の HTTPS Worker で実機確認する手順を示す。デプロイと秘密情報の登録は担当者が手作業で行う。

## 動作

- `x-line-signature` ヘッダーの欠落・不一致は 401、チャネルシークレット未設定は 503。署名が正しくても、本文が JSON でないか最上位の `events` 配列がなければ 400。
- 受け付けた Webhook には空本文の 200 を返す。返信は応答後にバックグラウンドで実行し、失敗しても再試行しない。
- 返信するのは `LINE_MESSAGING_ECHO_ENABLED` が文字列 `true` の場合の、個人トークのテキストメッセージだけ。グループ・複数人トーク、テキスト以外、LINE が再配信としてマークしたイベントは読み飛ばす。
- 返信対象があるのにアクセストークンが未設定なら 503。

## 環境変数

| 名前                                  | 登録方法 | 値                                                              |
| ------------------------------------- | -------- | --------------------------------------------------------------- |
| `LINE_MESSAGING_CHANNEL_SECRET`       | Secret   | Messaging API チャネルの「チャネル基本設定」のシークレット      |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Secret   | Messaging API チャネルの「Messaging API設定」のアクセストークン |
| `LINE_MESSAGING_ECHO_ENABLED`         | Vars     | 検証中だけ `true`。それ以外は未設定                             |

LINE Login の `LINE_CHANNEL_ID`・`LINE_CHANNEL_SECRET` とは別のチャネルの認証情報を使う。LINE Login の値を流用すると署名検証に失敗する。秘密情報は `wrangler.toml` やリポジトリのファイルに書かない。

## 1. 検証用 Worker を用意する

本番の Worker・D1・Cron に影響しないよう、リポジトリの `wrangler.toml` は使わず、検証専用の設定ファイル `wrangler.line-verify.toml` をリポジトリ直下に一時的に作る。Webhook は D1 を使わないため、バインディングは定義しない。このファイルはコミットしない。

```toml
name = "fuyugyo-line-verify"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[observability]
enabled = true
```

この Worker は Webhook の確認専用で、画面や他の API は動作しない。以降のコマンドには必ず `--config wrangler.line-verify.toml` を付ける。

```bash
pnpm exec wrangler deploy --config wrangler.line-verify.toml
pnpm exec wrangler secret put LINE_MESSAGING_CHANNEL_SECRET --config wrangler.line-verify.toml
pnpm exec wrangler secret put LINE_MESSAGING_CHANNEL_ACCESS_TOKEN --config wrangler.line-verify.toml
```

秘密情報はコマンドの引数にせず、表示されるプロンプトに入力する。

## 2. LINE 公式アカウントを設定する

1. 検証用の公式アカウントで Messaging API を有効にする。本番で利用者がいるアカウントは使わない。
2. LINE Official Account Manager の応答設定で、自動応答（応答メッセージ）を無効にする。あいさつメッセージもオウム返しと紛れないよう無効にする。
3. LINE Developers コンソールの対象チャネルの「Messaging API設定」で、Webhook URL に `https://<検証用 Worker のホスト名>/api/line/webhook` を登録する。
4. 「検証」を実行し、成功することを確認する。その後「Webhookの利用」を有効にする。

検証が失敗する場合は、401 ならチャネルシークレットが対象チャネルのものか、503 なら秘密情報が登録されているかを確認する。

## 3. 個人トークで実機確認する

1. オウム返しを有効にして再デプロイする。

   ```bash
   pnpm exec wrangler deploy --config wrangler.line-verify.toml --var LINE_MESSAGING_ECHO_ENABLED:true
   ```

2. 検証用の公式アカウントを友だちに追加し、個人トークでテキストを送る。改行や絵文字を含む文字列が、そのまま 1 回だけ返ることを確認する。
3. スタンプや画像を送り、返信がないことを確認する。
4. 返信がない場合は次のコマンドでログを確認してから、もう一度テキストを送る。

   ```bash
   pnpm exec wrangler tail --config wrangler.line-verify.toml
   ```

返信の失敗は `[line-webhook] reply failed` として、失敗種別（`http_error`・`network_error`・`timeout`）と HTTP ステータス（取得できた場合）だけを記録する。タイムアウトは 1 回の返信につき 5 秒。

## 4. 検証後に解除する

1. `--var` を付けずに再デプロイし、`LINE_MESSAGING_ECHO_ENABLED` を解除する。

   ```bash
   pnpm exec wrangler deploy --config wrangler.line-verify.toml
   ```

2. 個人トークにテキストを送り、返信がないことを確認する。
3. 検証を終える場合は「Webhookの利用」を無効にし、検証用 Worker を削除する。不要になったアクセストークンはコンソールで失効させる。

   ```bash
   pnpm exec wrangler delete --config wrangler.line-verify.toml
   ```

4. `wrangler.line-verify.toml` を削除する。

参考: [Webhook の署名を検証する](https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/)、[応答メッセージを送る](https://developers.line.biz/ja/reference/messaging-api/#send-reply-message)、[Webhook の受信と再配信](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)。
