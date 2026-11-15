# #275 リリースゲートとしてのフルE2E：実装前調査

調査日: 2026-11-15。ローカル調査対象: `c9a0a20b4bd35a79ec98322cea1142ac4a72c5f8`。設定・実装・本番環境は変更していない。テストの実行結果ではなく、ソースと公式一次資料の静的調査である。

## 結論と要件の読み方

[Issue #275](https://github.com/keichan110/fuyugyo/issues/275) の「フルE2E」は、重要業務フロー・ロール別権限・否定系を網羅する意味であり、全コードの100%カバレッジとは書かれていない。LINE OAuth自体、本番環境へのE2E、push通知、リッチメニュー、定期実行はスコープ外。実登録を行わず招待リンク発行までを検証する。

推奨は、既存の単体・実D1統合テストを主役として維持し、重要なUI→API→D1→再取得の接続をChromiumとモバイルWebKitで確認すること。Releaseの同じcheckout内でbuild後、remote migration前にフルE2Eを置く。E2E失敗時に本番変更を開始しないことは構造で保証できるが、E2E成功によるデプロイ成功・本番の全機能正常は保証できない。

Issueの必須条件は「同じコミット」であって「ビルド成果物そのものをE2E対象にすること」までは明記されていない。production buildのローカル検証は追加推奨として区別する。

## 公式資料から得られる判断

### E2E100%コードカバレッジを目標にしない

Googleはカバレッジを未検証領域を探す材料として扱う。行を通しても、期待結果の正しさや必要な振る舞いを確認したことにはならない。E2Eの行・分岐100%をリリース条件にする根拠にはならない。[Google: Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html?hl=el)

Googleのテストピラミッドは高コストのE2Eへの過度な依存を避け、狭いテストと統合テストに役割を分ける。70/20/10はチームごとに調整する出発点であり、当リポジトリに件数比率を強制するものではない。[Google: Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html?hl=uk_UA)

**当案件への提案**: 「重要シナリオ一覧の各項目に検証が対応しているか」を受入基準とし、リスク（権限逸脱、希望消失、誤公開、既存データ破損）から優先する。カバレッジ数値を追加する場合も、未検証ロジックの発見に使い、ブラウザに全分岐を通させない。

### Playwrightの実践と認証

公式はユーザーから見える振る舞い、独立したテスト、安定したlocator、自動待機するassertion、制御できるデータを推奨する。第三者サービスの実稼働に依存させず、必要な境界を制御する。[Playwright best practices](https://playwright.dev/docs/best-practices)

認証状態はstorageStateで再利用できるが、ファイルは機密情報として扱う。サーバー状態を更新するテストでアカウントを共有して並列実行すると干渉する。[Playwright authentication](https://playwright.dev/docs/auth)

**当案件への提案**: 既存のローカル固定JWT方式を維持する。本番ログイン用の抜け道は追加しない。外部OAuthの動作を認証済みstorageStateで検証したとは扱わない。更新系の重要フローでは自社APIをモックせず、ローカルD1まで通す。既存のAPI応答差し替えによるUI試験は補助として残せるが、永続化や認可の証拠と区別する。

webServerは任意コマンドを起動できる。公式ではport指定は非推奨でurl指定を案内し、起動待機のHTTP応答には401/403等も含める。起動判定と業務readinessは別の検証である。[Playwright webServer](https://playwright.dev/docs/test-webserver)

### Workers・D1のローカル検証と本番との差

Workersのテストはローカルworkerdとbindingを利用できるが、ホストされた本番環境と同一ではない。現行公式はVitestに加え、production Worker buildを検証する統合harnessも案内する。[Workers testing](https://developers.cloudflare.com/workers/testing/)、[Vitest test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)

Cloudflare Vite pluginは`vite preview`でビルド成果物をWorkers runtime上で動かせる。したがってこの構成では、単に静的ファイルだけを配るpreviewとは異なる。[Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)、[React SPA + API tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)

**当案件への提案**: 新しいharnessや依存への移行を#275の前提にしない。既存バージョン（Vite plugin 1.42.3 / vitest-pool-workers 0.16.20）を基準にpreviewのD1・環境設定の共有を小さく検証する。最新ドキュメントのAPI名をそのまま既存実装へ持ち込まない。

## 現状の確認と差分

以下のパスはこのリポジトリ内の一次資料。

| 項目 | 現状と根拠 | #275で必要な差分 |
| --- | --- | --- |
| PRゲート | `.github/workflows/quality-check.yml`: Vitest、開発seed確認、Chromium smoke、build。E2Eはbuildより前 | PRはsmokeを維持。Releaseではタグ絞り込みなしのフルを実行 |
| Release | `.github/workflows/release.yml`: main checkout→SHA/タグ決定→依存導入→secret名確認→build→公開map残留確認→remote migration→deploy。E2EもVitestも再実行しない | 同じdeployジョブのbuild後・remote migration前にフルE2E。別checkoutやmainの再取得を挟まない |
| ブラウザ | `playwright.config.ts`: Pixel 7のChromiumのみ | モバイルWebKit projectを追加。PR smokeが意図せず両ブラウザへ広がらない選択を明示 |
| 実行制御 | workers=1、fullyParallel=false、retries=0、reuseExistingServer=false、localhost限定 | 共有D1の安全性は維持。ブラウザproject間のデータ干渉も分離 |
| seedと認証 | `e2e/prepare.ts`, `seed.ts`, `global-setup.ts`, `fixtures/users.ts`: 専用永続化先を削除しSQL migration、固定ID投入、3ロール+inactiveのJWTを生成 | 業務フローに必要な希望・未連携・別部門等を決定的に追加。実行順に依存しない更新データを用意 |
| 現行smoke | `e2e/smoke/`: 未認証リダイレクト/401、ADMIN/MEMBERのホーム、シフト閲覧、ADMINの下書き割当保存とreload、ロール別モバイルnav | 公開までの通し、希望保存、招待発行、inactive、直接API認可を追加 |
| フルのみの既存テスト | `e2e/smoke/mobile-navigation.e2e.ts`には@smokeなしのPC/狭幅、未保存移動防止、未連携表示等も存在 | ディレクトリ名だけで全件smokeと誤認しない。フルコマンドはこれらも実行する |
| 補助UI試験 | 同ファイルにはauth/me・連携・agenda応答の差し替えあり | 実D1を通した業務フローと区別し、既存補助試験を二重計上しない |
| 時刻 | `e2e/fixtures/test.ts`: ブラウザだけ2026-01-15固定。サーバー時計は実時刻 | 希望申告の過去日判定はサーバー基準。固定2026年1月の新規申告は調査日時には過去となり得る |
| 障害証跡 | Playwrightはtrace retain-on-failure、失敗時screenshot。PRでartifact7日保存 | Releaseにも失敗時upload。失敗を握り潰さず、本番操作をskip |
| 制限時間 | deployジョブ10分 | Issue目安20分を起点に、browser install・2 project・build込みの実測で調整 |
| health | deploy後の別ジョブで`APP_URL/api/health`の200を最大10回確認 | 既存確認を維持。本文・timeout・通信失敗の扱いは別途改善案 |
| 設計文書 | `docs/adr/0007-testing-vitest-real-d1-no-e2e.md`はE2E非採用をacceptedと記録 | 実装時に後続ADR等で限定的E2E採用と整合させる。実装の現状をADRの旧記述で否定しない |

現在の`pnpm run test:e2e`は既にprepare→タグ絞り込みなしのPlaywrightを実行する。1コマンドの入口を作り直す必要はなく、対象シナリオとブラウザが不足している。

## テスト層の分担

| 層 | 担当するリスク | 既存一次資料・追加方針 |
| --- | --- | --- |
| 単体 | 割当ルール、候補/競合、人数、日付/JST境界、公開計画、未保存状態などの多分岐 | `test/auto-assign-solver.test.ts`, `assignment-conflicts.test.ts`, `publication-plan.test.ts`, `availability-editor.test.ts`等。境界値をここで厚くする |
| 実D1統合 | Hono認証/認可、SQL、constraint/trigger、batch原子性、公開競合、データmigration、本人限定更新 | `vitest.config.ts`と`test/apply-migrations.ts`で生成SQLをローカルD1に適用。`auth`, `users`, `invitations`, `availabilities`, `shifts`, `shift-publication`, `shift-staffing-requirements`のintegrationテストを維持 |
| E2E | ブラウザ操作、role別表示、request/responseとUI接続、保存とreload、公開後の別role閲覧、ブラウザ差 | ローカルWorker+専用D1。全API入力の組み合わせやsolver全探索は繰り返さない |
| リリース後の運用確認 | 配信経路、実binding/secret設定、デプロイされた版、監視 | 現行healthとCloudflareログ。全業務シナリオを本番で書き込むE2Eは追加しない |

「実D1」はこの文書ではMiniflare/workerd上のD1 APIとローカルSQLiteを指す。本番D1の遅延、負荷、権限、データ量まで再現した意味ではない。

## 優先テストケースと受入条件

P0は#275の必須ゲート候補。P1はリスクに応じて追加する推奨で、Issue本文にない機能の拡張を必須扱いしない。

| 優先度 | シナリオ | 具体的な受入条件 | 現状との差・下位層 |
| --- | --- | --- | --- |
| P0 | MEMBERの管理操作拒否 | 管理導線が表示されず、管理URLの直接入力で編集できない。対応する書込APIが403で、値も変わらない | navは一部既存。直接URL・書込・非更新確認を追加。認可全endpointの組合せは統合層 |
| P0 | MANAGERの境界 | シフト管理・招待発行等の許可操作が成功。ADMIN専用のユーザーロール変更・無効化はUIで利用不能かつAPI403 | `test/users.integration.test.ts`と`invitations.integration.test.ts`では既存。E2Eに代表経路を追加 |
| P0 | ADMIN専用操作 | ADMINが隔離した対象ユーザーを更新でき、reload後も反映。MANAGER/MEMBERは同じ操作が拒否される | ユーザーseedを他シナリオの主体と共有して無効化しない |
| P0 | inactiveと未認証 | inactive storageStateで保護API403。未認証は保護画面からloginへ、保護API401。許可されない要求で書込みを残さない | inactive seedはあるが対応E2Eなし。401既存 |
| P0 | 認証前にDBへ到達しない | 未認証の保護APIに対し、DB bindingを触ると例外になる統合fixture等でも401を返す。403/401だけをDB未到達の証拠にしない | HTTP越しのE2Eだけでは内部アクセス回数を観測できない。専用本番endpointを作らず統合試験で補完 |
| P0 | 作成→割当→下書き保存→公開→閲覧 | UIで空の対象枠に割当を追加し保存。reloadで保持。公開前はMEMBERから見えず、公開後は別contextのMEMBERのシフト表/勤務予定に反映 | 現行は既存seed下書きへの割当保存のみ。新規枠生成と公開接続が不足 |
| P0 | 勤務可否申告 | MEMBERが未割当の将来日を変更し、保存後reloadでも保持。管理側の希望表示に反映。公開済み本人配置日は変更不能 | 既存UI試験は未保存/破棄中心。永続化・管理側との接続を追加 |
| P0 | 招待リンク発行 | MANAGERまたはADMINが発行し、表示リンクを取得。未認証contextで検証/案内が表示される。MEMBER発行は403 | 実登録・LINE画面操作はしない。期限切れ/失効の全境界は統合層 |
| P1 | 公開失敗と一括整合性 | 勤務不可の配置を含む公開は拒否され、他対象も部分公開しない。UIで理由を表示する | `test/shift-publication.integration.test.ts`に原子性/DB guard試験あり。UIの代表1例を追加 |
| P1 | 古い画面からの保存 | 独立contextの片方が更新後、もう片方の古い保存を拒否し、先行更新を消さない | 同統合テストのrevision/削除再作成競合を維持し、UI復帰を検証 |
| P1 | ログアウト・期限切れ | ログアウトで保護画面/APIが利用不能になり、期限切れ時にlogin導線へ戻る | `test/auth.integration.test.ts`でJWT更新/絶対期限/失効等は既存。全時間境界はE2Eで繰り返さない |

権限の期待値はナビゲーションだけで決めず、各`src/features/**/api.ts`のrequireRoleと既存統合試験に照合する。MANAGERは招待発行可能であり、ADMIN限定と誤って定義しない。

新規作成の期待値は現在の公開/必要人数仕様で決める。古い`docs/adr/0010-shift-implicit-lifecycle.md`の「0人なら必ず消える」を一律に採用しない。現行`test/shift-staffing-requirements.integration.test.ts`では必要人数のあるShiftは全員を外しても残り、`test/shift-publication.integration.test.ts`では0人枠も公開可能である。

### データと時刻の受入条件

- ブラウザcontext分離だけではD1は分離されない。project別の固定ID/対象日/ユーザーか、各project/シナリオ前の安全な再初期化を採用し、Chromiumの書込みがWebKitの前提を変えない。
- 現行prepareはコマンド冒頭に1度だけDBを初期化する。workers=1でもテスト順依存は防げない。失敗後に単独で再実行しても成立するようにする。
- 勤務可否はサーバーの「現在」以降の日付を用意する。ブラウザ時計だけを固定して将来日と判定させない。注入可能なテスト時刻か実行基準日からの決定的な将来日を選び、月境界・JSTを揃える。選択方式は実装時に決める。
- storageState/JWTをコミット・artifactに含めない。traceの内容も踏まえてartifactを短期保持する。Sentry等への送信は現行と同様に無効化し、制御外の外部アクセスを業務フロー成功の前提にしない。

## production buildとdev server

### 最小のIssue準拠案

既存の`pnpm run test:e2e`をbuild後に実行する案はIssueの明記要件を満たしやすい。同じcheckoutのソースをdev serverで検証するため、ビルド成功と主要フローの動作を別々に確認できる。ただし生成chunkの読み込み、production条件分岐、配信設定が実際に動いた証拠にはならない。

### 推奨する追加検証

Releaseではproduction buildを`vite preview`でローカル起動し、Worker/API/assetの接続を確認する。単にwebServer.commandを書き換えるだけで成立すると仮定せず、次を検証する。

1. previewは`server.port`とは別にポートを明示し、5180とlocalhost制限を維持する。使用中サーバーを再利用しない。
2. prepareでmigration/seedした専用D1をpreviewが実際に参照することを、保存→再取得で確かめる。公開asset、deep linkのSPA fallback、`/api/*`のWorker経由も確認する。
3. Vite pluginはbuild時の生成Worker設定をpreview/deployが自動検出する。`CLOUDFLARE_ENV`はdev/build時に選択され、preview/deploy時の指定だけでは切り替わらない。現行webServer.envをpreviewへ移すだけでは不十分。[環境選択](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)、[生成設定の検出](https://developers.cloudflare.com/workers/vite-plugin/reference/migrating-from-wrangler-dev/)
4. E2E向けbuildを別に作る場合、dummy JWT・ローカルAPP_URL・E2E用bindingの生成設定を本番deployが拾わないよう成果物と生成設定の参照先を隔離する。本番用buildをE2E用buildで上書きしてそのままdeployしない。
5. 「同じSHAのproduction相当buildを検証」と「デプロイする同一成果物を検証」を区別する。Sentry設定や公開環境変数が違えば同一成果物ではない。再buildする設計はその限界を明記する。

このpreview対応は#275の明記範囲を越える追加設計になり得る。まず必須シナリオとゲートを完成させ、成果物の分離を確認できる場合に採用する。調査段階ではpreviewの実起動、D1共有、生成設定の実物照合は未実施。

## Releaseゲートの受入条件

1. 既存deployジョブで、checkout→SHA/タグ決定→build→フルE2E→remote migration→deployの順を守る。公開map残留確認もmigration前に維持する。
2. ChromiumとモバイルWebKitの対象全件が成功したときだけ本番操作を開始する。PRは引き続きChromium smoke。`--grep @smoke`をReleaseに誤用しない。
3. E2E/prepare/browser起動の失敗で非ゼロ終了し、migration・deployをskipする。`continue-on-error`や成功扱いのfallbackを入れない。キャンセル/timeoutでも後段へ進まない。
4. 後段のhealth-check/releaseは既存needs依存を維持する。失敗証跡のuploadだけは実行し、uploadの条件を本番操作へ流用しない。
5. ローカルの既存1コマンドでフルを再現できる。ubuntu-latestに必要なChromium/WebKit本体とOS依存を入れ、キャッシュhit時も依存導入を省略しない。キャッシュはOS・Playwright versionを含める。
6. Release全体のtimeoutを実測し、Issueの目安20分から調整する。trace/screenshot/reportのartifactは短期保持し、本番secretや認証stateを収集しない。
7. 故意にE2Eを失敗させた隔離環境で、migration/deploy/release作成の後段が実行されないことを確認する。本番を使った失敗実験はしない。workflow構造の確認だけで「本番無変更を実証済み」と記録しない。
8. 運用文書に失敗時のartifact確認、同じSHAでのローカル再現、修正後再実行を記載する。E2Eをskipしての通常リリースを案内しない。

補足: Issueの「E2E失敗時に本番・D1・GitHub Releaseが変化しない」はこのworkflowが変更操作を開始しないという意味。本番利用者の通常書込みや他経路の運用操作まで停止する保証ではない。現在のsecret確認は一覧の読取りであり、タグ決定もこの段階ではタグ作成をしない。build時のSentry sourcemap uploadはあり得るので、「全外部サービス無変更」とは言い換えない。

## migration互換性と保証の限界

現行の順序ではmigration後も旧Workerが新スキーマへアクセスする時間がある。deploy失敗時にもその状態が残る。`docs/settings/database-migration-deployment.md`の新旧両Worker互換ルールは必須であり、E2Eで代替できない。

D1 migrations applyは、失敗したmigrationを戻す一方、それ以前に成功したmigrationは残す。複数migration全体が一括で元に戻るわけではない。[D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)

受入条件の追加推奨:

- 空DBへ全migrationを適用する試験に加え、前回リリース相当のスキーマ+合成既存データへ新migrationを適用し、ID・割当・公開状態・外部キー・データを維持する。
- 新スキーマに対する旧コードの読取/書込と、新コードの読取/書込を検証する。nullable/defaultのない必須列追加、rename/drop、triggerによる旧書込拒否は個別レビューする。
- 破壊的変更はexpand/contractで分割する。各段階と部分適用後の状態も旧コードが利用できることを確認する。データ量による時間/制限はローカル少量fixtureでは保証しない。
- 既存`test/shift-publication-migration.test.ts`は特定migrationのSQLを別名テーブルへ適用し既存行保持を検証している。良い先例だが、実履歴全体・旧アプリ互換性を網羅した試験ではない。

Worker rollbackとDB復元は別操作。Cloudflareはbinding変更等でrollbackを制限する場合がある。DBをTime Travelで戻す際には復元時点以降の書込みへの影響を判断する。E2E合格をrollback可能性の保証にしない。[Workers rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)、[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

## 本番healthの意味と改善案

現行`src/features/health/api.ts`はstatus/timestampを返すだけで、`test/health.integration.test.ts`はDBアクセスがあれば例外となるfixtureで「D1非依存」を明示的に検証する。ReleaseはHTTP200のみを確認する。これは意図したliveness確認であり、DB readinessや全業務正常の確認ではない。

現行healthを維持した上での追加推奨:

- curlに接続/全体timeoutを設定し、通信エラーも想定した上限付きretryにする。現行はcurl失敗時の非ゼロ終了により、shellの終了設定次第でループ継続前に失敗し得る。
- 200に加えてJSONの`status=ok`を確認する。必要なら公開可能なrelease SHAを応答と照合し、旧版が200を返しただけの誤判定を避ける。現行timestampだけでは版を識別できない。
- DB readinessが必要なら公開healthへ無条件SQLを足さず、認証/制限した運用経路や監視、migration終了結果で補完する。現在のDB非依存方針を変更する提案は別途判断する。
- health失敗ではGitHub Releaseを作らない既存動作を維持する。ただしdeployやDB変更は既に済んでおり、自動的に元へ戻るわけではない。Cloudflareログ/Sentryと照合し、既存運用手順に沿ってrollbackまたは修正版を選ぶ。

本番secretの値・外部OAuth設定、DNS/TLS、実D1 binding、Cloudflare制限、実データ、ネットワーク障害はローカルE2Eの合格からは保証できない。secret一覧は名前の存在確認であり値の妥当性確認ではない。本番E2Eを追加せずとも、デプロイ後の限定的なhealthと監視を残す必要がある。

## 実装前に決める事項

- 必須: P0の具体的な対象API/画面、Chromium/WebKit間のDB分離、サーバー日付とfixtureの整合、DB未到達の統合試験での観測方法。
- 推奨追加: dev方式で#275を先に満たすか、生成設定を隔離したproduction previewも今回扱うか。後者を選ぶなら同一SHA/同一成果物の保証範囲を明記する。
- 別途改善: health本文/版確認・curlの堅牢化、旧Worker互換migration試験、ADR更新。これらを既存実装済みと扱わない。
