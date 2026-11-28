# LINE Messaging API の Webhook

`POST /api/line/webhook` で Webhook を受信する。友だち追加では[個別リッチメニュー](line-rich-menu.md#アプリによる個別割り当て)を割り当て、リッチメニューの「全体の勤務予定」と「直近の勤務予定」には個人トークで返信する。ここでは動作と、検証用の LINE 公式アカウントと検証用の HTTPS Worker で確認する手順を示す。デプロイと秘密情報の登録は担当者が手作業で行う。

## 動作

### 受信

- `x-line-signature` ヘッダーの欠落・不一致は 401、チャネルシークレット未設定は 503。署名が正しくても、本文が JSON でないか最上位の `events` 配列がなければ 400。
- 受け付けた Webhook には空本文の 200 を返す。勤務の取得と返信は応答後にバックグラウンドで実行する。
- 返信対象があるのにアクセストークンが未設定なら 503。
- 個人ユーザーの `follow` イベントは、再配信を含めて処理する。有効かつインストラクター紐付け済みのユーザーに個別リッチメニューを割り当てる。トークへの返信はしない。

### 返信の対象

次のすべてを満たすイベントだけに返信する。

- `type` が `postback`、`source.type` が `user`
- `source.userId`・`webhookEventId`・`replyToken` が空でない
- `deliveryContext.isRedelivery` が `false`（初回配信）
- `postback.data` が対応する操作値と完全に一致する

リッチメニューの操作値は次のとおり。

| メニュー | `postback.data`        | 返信                              |
| -------- | ---------------------- | --------------------------------- |
| 左       | `action=team-schedule` | 全体の勤務予定（今日を含む7日間） |
| 中央     | `action=my-schedule`   | 直近の勤務予定（本人の勤務日）    |
| 右       | `action=announcements` | 未対応（返信しない）              |

通常のメッセージ（テキスト・画像・スタンプ等）、未知の操作値、グループ・複数人トーク、再配信には返信しない。

### 返信を受け取れるユーザー

署名を検証したイベントの `source.userId` をユーザーの LINE ユーザー ID と照合し、有効な MEMBER・MANAGER・ADMIN にだけ返信する。未登録・無効・未知のロールには、勤務を取得せず返信もしない。インストラクターに未紐付けでも返信する（直近の勤務予定は、勤務を取得せず紐付けがないことを知らせる）。

### 返信の内容

#### 共通

- 対象は公開済みで担当者がいる勤務枠。範囲はロールを問わず Web の MEMBER と同じ。備考・連絡先・Web へのリンクは含めない。
- 1日1枚のカードを日付順に送る。カードの小ラベルは返信の種類を示し、トーク一覧の代替テキストには返信の種類・期間・勤務予定のある日数を表示する。
- 勤務枠は、スキー・スノーボードの順、部門内の種別表示順、種別名の順。担当者は資格順・かな順で、本人の名前だけを太字にする。
- カード1枚の JSON は UTF-8 で 7,000 バイト以内（LINE のカルーセルの上限 50 KB に収める）。入りきらない場合は、表示順に「ほかN名」「ほかN勤務枠」で省略する。本人が省略される側にいる場合は表示されない。極端に長い名称は「…」で短縮する。

#### 全体の勤務予定

- 日本時間の今日を含む7日間の勤務枠を、7枚のカードにする。勤務がない日のカードには「この日の勤務予定はありません。」と表示する。7日間すべてに勤務がなければ、テキスト1件で知らせる。

#### 直近の勤務予定

- 日本時間の今日以降で本人が担当する公開済みの勤務枠を、日付と表示順に3枠まで選び、その日付だけをカードにする（最大3枚）。同じ日に複数の枠があれば3枚より少なくなる。今日の枠は終了時刻を過ぎていても含み、未来側の期限はない。
- 選んだ日のカードには、他の担当者だけの枠を含むその日のすべての勤務枠を表示する（上記のサイズ上限は適用する）。
- 対象の勤務がなければ「今後の勤務予定はありません」、インストラクターに未紐付けなら「インストラクター情報が紐付いていないため、勤務予定を確認できません。」のテキスト1件を返す。

### 返信の失敗と重複

- 返信は Reply API だけを使う。失敗しても再試行せず、Push メッセージへの切り替えもしない。利用者はメニューをもう一度押す。
- 失敗は `[line-webhook] reply failed` として、失敗種別（`http_error`・`network_error`・`timeout`・`processing_error`）と HTTP ステータス（取得できた場合）だけを記録する。`processing_error` はユーザーの照合・勤務の取得・返信の組み立てに失敗した場合。タイムアウトは Reply API の呼び出し 1 回につき 5 秒。
- Reply token の有効期間は短いため、取得や送信が遅れると返信は失敗する。
- 同じリクエスト内で `webhookEventId` か Reply token が重複するイベントは、1 回だけ処理する。
- LINE が再配信としてマークしたイベントは返信しないため、初回の返信に失敗した操作は再配信されても返信しない。
- 別々のリクエストで同じ Reply token が並行して届いた場合は重複を除かず、送信の試行が重なる可能性がある。Reply token は一度しか使えないため利用者に二重には届かず、後の送信は `http_error` として記録される。

## 環境変数

| 名前                                  | 登録方法 | 値                                                              |
| ------------------------------------- | -------- | --------------------------------------------------------------- |
| `LINE_MESSAGING_CHANNEL_SECRET`       | Secret   | Messaging API チャネルの「チャネル基本設定」のシークレット      |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Secret   | Messaging API チャネルの「Messaging API設定」のアクセストークン |

Messaging API チャネルと LINE Login チャネルは、同じプロバイダーに別々のチャネルとして作る。LINE ユーザー ID はプロバイダーごとに異なるため、別のプロバイダーでは送信者をユーザーと照合できない。

LINE Login の `LINE_CHANNEL_ID`・`LINE_CHANNEL_SECRET` と、Messaging API の認証情報は流用しない。LINE Login の値を使うと署名検証に失敗する。秘密情報は `wrangler.toml` やリポジトリのファイルに書かない。

検証用のオウム返しは廃止した。`LINE_MESSAGING_ECHO_ENABLED` はアプリが参照しないため、登録が残っていれば削除する。

## 1. 返信内容を確認する

実機の前に、返信の JSON を LINE の検証 API と Flex Message Simulator で確認できる。リポジトリ直下に一時ファイル `line-message-sample.ts` を作る。このファイルはコミットしない。

```ts
import { renderScheduleMessage } from './src/features/line-webhook/schedule-message';

const message = renderScheduleMessage({
  label: '全体の勤務予定',
  dates: ['2026-11-28', '2026-11-29'],
  shifts: [
    {
      date: '2026-11-28',
      department: { code: 'ski', name: 'スキー' },
      shiftType: { id: 'sample', name: '一般レッスン' },
      assignedInstructors: [
        { id: 'a', displayName: '講師 A' },
        { id: 'b', displayName: '講師 B' },
      ],
    },
  ],
  instructorId: 'b',
});
console.log(JSON.stringify({ messages: [message] }, null, 2));
```

```bash
pnpm exec tsx line-message-sample.ts > line-message-sample.json

# トークンは履歴に残らないよう、プロンプトから読み込む
read -rs LINE_TOKEN

# Reply メッセージの検証 API（送信はしない）。問題がなければ HTTP 200
curl -i -X POST https://api.line.me/v2/bot/message/validate/reply \
  -H "Authorization: Bearer $LINE_TOKEN" \
  -H "Content-Type: application/json" \
  --data @line-message-sample.json
```

`line-message-sample.json` の `messages[0].contents` を [Flex Message Simulator](https://developers.line.biz/flex-simulator/) に貼り付け、小ラベル、日付の見出し、部門ラベルの配色、区切り線、本人の太字を確認する。直近の勤務予定は `label` を `直近の勤務予定`、`dates` を本人の勤務がある日だけにする。長い名前や多人数の表示は、サンプルの値を変えて確認する。確認後は 2 つの一時ファイルを削除する。

## 2. 検証用 Worker を用意する

本番の Worker・D1・Cron に影響しないよう、リポジトリの `wrangler.toml` は使わず、検証専用の D1 と設定ファイルを用意する。

```bash
pnpm exec wrangler d1 create fuyugyo-line-verify
```

リポジトリ直下に `wrangler.line-verify.toml` を一時的に作り、`database_id` には作成結果の値を入れる。このファイルはコミットしない。

```toml
name = "fuyugyo-line-verify"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "fuyugyo-line-verify"
database_id = "<作成した D1 の ID>"
migrations_dir = "drizzle"

[observability]
enabled = true
```

この Worker は Webhook の確認専用で、画面やログインは動作しない。以降のコマンドには必ず `--config wrangler.line-verify.toml` を付ける。

```bash
pnpm exec wrangler d1 migrations apply fuyugyo-line-verify --remote --config wrangler.line-verify.toml
pnpm exec wrangler deploy --config wrangler.line-verify.toml
pnpm exec wrangler secret put LINE_MESSAGING_CHANNEL_SECRET --config wrangler.line-verify.toml
pnpm exec wrangler secret put LINE_MESSAGING_CHANNEL_ACCESS_TOKEN --config wrangler.line-verify.toml
```

秘密情報はコマンドの引数にせず、表示されるプロンプトに入力する。

### 確認用のデータ

次の SQL を一時ファイル `line-verify-seed.sql` に保存する。`<自分のユーザー ID>` は、検証用チャネルの LINE Developers コンソールに表示される「あなたのユーザー ID」に置き換える。勤務日は実行日（日本時間）を基準に入る。

```sql
INSERT INTO instructors (id, last_name, first_name) VALUES
  ('verify-self', '検証', '本人'),
  ('verify-other', '検証', '同僚');
INSERT INTO users (id, line_user_id, display_name, instructor_id) VALUES
  ('verify-user', '<自分のユーザー ID>', '検証', 'verify-self');
INSERT INTO shift_types (id, name) VALUES ('verify-type', '一般レッスン');
INSERT INTO department_shift_types (id, department_code, shift_type_id, sort_order) VALUES
  ('verify-ski', 'ski', 'verify-type', 1),
  ('verify-snowboard', 'snowboard', 'verify-type', 1);
INSERT INTO shifts (id, date, department_code, shift_type_id, status) VALUES
  ('verify-today', unixepoch(date('now', '+9 hours')), 'ski', 'verify-type', 'PUBLISHED'),
  ('verify-last', unixepoch(date('now', '+9 hours', '+6 days')), 'snowboard', 'verify-type', 'PUBLISHED'),
  ('verify-draft', unixepoch(date('now', '+9 hours', '+1 day')), 'ski', 'verify-type', 'DRAFT'),
  ('verify-next', unixepoch(date('now', '+9 hours', '+10 days')), 'ski', 'verify-type', 'PUBLISHED');
INSERT INTO shift_assignments (id, shift_id, instructor_id) VALUES
  ('verify-a1', 'verify-today', 'verify-self'),
  ('verify-a2', 'verify-today', 'verify-other'),
  ('verify-a3', 'verify-last', 'verify-other'),
  ('verify-a4', 'verify-draft', 'verify-self'),
  ('verify-a5', 'verify-next', 'verify-self');
```

```bash
pnpm exec wrangler d1 execute fuyugyo-line-verify --remote --file line-verify-seed.sql --config wrangler.line-verify.toml
```

## 3. LINE 公式アカウントを設定する

1. 検証用の公式アカウントで Messaging API を有効にする。本番で利用者がいるアカウントは使わない。
2. LINE Official Account Manager の応答設定で、自動応答（応答メッセージ）を無効にする。有効なままだと、アプリの返信と自動応答が混ざる。あいさつメッセージも無効にすると確認しやすい。
3. LINE Developers コンソールの対象チャネルの「Messaging API設定」で、Webhook URL に `https://<検証用 Worker のホスト名>/api/line/webhook` を登録する。
4. 「検証」を実行し、成功することを確認する。その後「Webhookの利用」を有効にする。
5. [リッチメニューを公開](line-rich-menu.md)し、公式アカウントを友だちに追加する（追加済みならブロックして解除する）。連携済み用のメニューが表示されることを確認する。

検証が失敗する場合は、401 ならチャネルシークレットが対象チャネルのものか、503 なら秘密情報が登録されているかを確認する。

## 4. 個人トークで実機確認する

1. リッチメニュー下段の左を押す。トークに発言が表示されず、7枚のカードが 1 回だけ届くことを確認する。
2. 今日のカードで本人の名前だけが太字になり、下書きの日は勤務予定なし、6日後はスノーボードの勤務が表示されることを確認する。
3. 長い名前が折り返されること、カードを横にスワイプできること、トーク一覧に返信の種類と期間が表示されることを確認する。
4. リッチメニュー下段の中央を押す。トークに送信テキストが表示されず、小ラベルが「直近の勤務予定」のカードが 1 回だけ届くことを確認する。
5. カードは今日と10日後の日付の2枚で、下書きの日と本人の勤務がない6日後は含まれないことを確認する。今日のカードには同僚も表示され、本人の名前だけが太字になること、トーク一覧に返信の種類・期間・勤務予定のある日数が表示されることを確認する。
6. 下段の右、テキスト、スタンプを送り、返信がないことを確認する。上段のタップでは、引き続き LIFF が開くことを確認する。
7. 勤務がない状態を確認する。次のコマンドで下書きに戻して左と中央を押し、それぞれテキストが 1 件届くことを確認する。

   ```bash
   pnpm exec wrangler d1 execute fuyugyo-line-verify --remote --config wrangler.line-verify.toml \
     --command "UPDATE shifts SET status = 'DRAFT'"
   ```

8. 未紐付けの状態を確認する。次のコマンドで紐付けを外して中央を押し、紐付けがないことを知らせるテキストが届くことを確認する（SQL での変更ではリッチメニューは切り替わらない）。

   ```bash
   pnpm exec wrangler d1 execute fuyugyo-line-verify --remote --config wrangler.line-verify.toml \
     --command "UPDATE users SET instructor_id = NULL WHERE id = 'verify-user'"
   ```

9. 返信がない場合は次のコマンドでログを確認してから、もう一度操作する。

   ```bash
   pnpm exec wrangler tail --config wrangler.line-verify.toml
   ```

## 5. 検証後に解除する

1. 「Webhookの利用」を無効にし、検証用 Worker と D1 を削除する。不要になったアクセストークンはコンソールで失効させる。

   ```bash
   pnpm exec wrangler delete --config wrangler.line-verify.toml
   pnpm exec wrangler d1 delete fuyugyo-line-verify --config wrangler.line-verify.toml
   ```

2. `wrangler.line-verify.toml` と `line-verify-seed.sql` を削除する。

参考: [Webhook の署名を検証する](https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/)、[応答メッセージを送る](https://developers.line.biz/ja/reference/messaging-api/#send-reply-message)、[応答メッセージの検証](https://developers.line.biz/ja/reference/messaging-api/#validate-message-objects-of-reply-message)、[Webhook の受信と再配信](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)。
