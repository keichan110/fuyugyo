# Workers 上でシフト自動割当（最適化）を回す際の実行制約調査

## 調査目的

シフト自動割当（インストラクター × シフト枠の最適配置提案）を実装するにあたり、計算を Cloudflare Workers（サーバー）側で回せるか、あるいはブラウザ（クライアント）側で回すべきかを判断するための一次情報を集める。GitHub issue #177（親 issue #173、issue #178 をブロック中）の解決材料とする。

## 調査日

2026-07-14

## 前提

- 現在の Cloudflare プランは Free。ただし Workers Paid（月額 $5〜）への移行は選択肢として残っている。
- `wrangler.toml` は本調査では権限上読めていない。**現行の `limits.cpu_ms` 等の設定値は未確認**。以下は公式ドキュメント上の仕様・デフォルト値の説明であり、本リポジトリの実際の設定を保証するものではない。
- 想定規模: インストラクター数十名（20〜50）× 1か月分のシフト枠（数十〜100枠）。割当変数（インストラクター × 枠 の 0/1 変数）はおおよそ数千オーダー。
- 自動割当は「提案 → 人間が採用」のワークフローであり、同期的な即時応答よりも結果の質・説明可能性が優先される。数秒〜数十秒の待ち時間は許容範囲と想定する。

## 結論（要約）

- **Free プランのまま Workers 上で MIP/LP ソルバーを直接解くのは現実的ではない。** Free プランの CPU 時間上限は HTTP リクエストあたり **10ms** しかなく（[Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)）、貪欲法程度の軽い処理ならともかく、汎用ソルバーのシンプレックス法・分枝限定法を数千変数規模で走らせるには全く足りない。
- 例外として **Durable Objects は Free プランでもデフォルトで 30 秒（設定により最大 5 分）の CPU 時間を持つ**、と Durable Objects の公式 Limits ページに明記されている（[Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)）。これが事実であれば「重い計算だけ Durable Object に逃がす」という回避策が Free プランでも機能する可能性があるが、通常の Workers Free の 10ms 上限と整合しない驚くべき数値であり、**小規模プロトタイプで実測検証してから採用すべき**（本調査ではドキュメント上の記載の域を出ない）。
- **想定規模（変数 数千、うち相当数が 0/1 変数）は、調査した純 JS/Wasm ソルバーの「安全に速く解ける」と各プロジェクトが公言する範囲の上限〜やや超**に位置する。実測ベンチマークは存在するが、いずれも「数千変数のうち相当数が整数/バイナリ」という当該ユースケースそのものの計測ではないため、求解時間は一次情報からは**確定できず「不明」**とせざるを得ない。
- **クライアント（ブラウザ）側で解く選択肢が、この規模・この用途（提案→人間採用、即時性より質重視）には最も現実的。** CPU 時間の上限が事実上なく（ユーザーの端末リソース次第）、Web Worker でメインスレッドを塞がずに解け、既存 UI が月単位で候補者データを既に取得・保持するアーキテクチャとも整合する。
- **Paid プランへの移行は「保険」として安価**（月額 $5 に 3,000万 CPU ミリ秒が含まれる）だが、この用途だけのために今すぐ上げる必然性は薄い。まずクライアント側実装で試し、性能・UX上の問題が出た場合の Plan B として温存するのが妥当。

---

## 1. Cloudflare Workers の実行制約

### 1.1 CPU 時間と実時間（wall clock）の違い

Cloudflare の公式定義:

> "CPU time measures how long the CPU spends executing your Worker code. Waiting on network requests (such as fetch() calls, KV reads, or database queries) does not count toward CPU time."
> "Duration measures wall-clock time from start to end of a Worker invocation."

出典: [Limits · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/limits/)

つまり **I/O 待ち（fetch・KV・D1 クエリなど）は CPU 時間に計上されない**。ソルバーの計算（ループ・数値演算）だけが CPU 時間としてカウントされる。

HTTP トリガーの Worker には実時間（Duration）の**ハード上限がない**、とも明記されている。

> "There is no hard limit on duration for HTTP-triggered Workers. As long as the client remains connected, the Worker can continue processing, making subrequests, and streaming a response body."

出典: 同上（[Limits](https://developers.cloudflare.com/workers/platform/limits/)）

つまり Free プランでも「時間をかけて計算する」こと自体は理論上禁止されていない。禁止されているのは「**CPU を 10ms 以上専有すること**」である。ここが「実時間なら長くても良いが CPU 時間はダメ」という Workers の CPU 課金モデルの核心であり、ソルバーのような CPU バウンドな処理には最も厳しく効いてくる。

### 1.2 CPU 時間の上限値（Free / Paid）

| 項目                          | Free      | Paid（デフォルト） | Paid（`limits.cpu_ms` で引き上げ可能な上限） |
| ----------------------------- | --------- | ------------------ | -------------------------------------------- |
| CPU time per HTTP request     | **10 ms** | 30 秒              | **300,000 ms（5分）**                        |
| Cron Trigger（1時間未満間隔） | 10 ms     | 30 秒              | 同上                                         |

出典: [Limits · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/limits/)

`limits.cpu_ms` は `wrangler.toml`（または `wrangler.jsonc`）の `[limits]` セクションで指定する設定項目で、Wrangler の設定リファレンスに以下のように記載されている。

```toml
[limits]
cpu_ms = 100
```

> "Limits are only supported for the Standard Usage Model"

出典: [Configuration · Wrangler docs](https://developers.cloudflare.com/workers/wrangler/configuration/)

「Standard Usage Model」は Bundled/Unbound を統合した現行の課金モデルで、**Workers Paid プランのユーザーが利用できる**（[Pricing · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/pricing/) の記述、および検索で確認した Cloudflare の説明）。したがって `limits.cpu_ms` による引き上げは実質 **Paid プラン専用**であり、Free プランの 10ms を `wrangler.toml` の設定だけで引き上げることはできないと考えられる。

なお、設定値を超過した場合について:

> "Each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs over the configured limit"

出典: [Configuration · Wrangler docs](https://developers.cloudflare.com/workers/wrangler/configuration/)

（軽度・単発の超過には多少の猶予があるが、恒常的な超過は許容されない、という趣旨）

### 1.3 メモリ・スクリプトサイズ・起動時間

| 項目                                     | Free         | Paid                                     |
| ---------------------------------------- | ------------ | ---------------------------------------- |
| メモリ（isolate あたり）                 | 128 MB       | 128 MB（共通）                           |
| スクリプトサイズ（gzip 後）              | 3 MB         | 10 MB                                    |
| スクリプトサイズ（圧縮前）               | 64 MB        | 64 MB（共通）                            |
| Startup time（グローバルスコープの実行） | 1 秒（共通） | 1 秒（共通）                             |
| Subrequests（1 invocation あたり）       | 50           | 10,000（最大 1,000万まで引き上げ申請可） |

出典: [Limits · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/limits/)

WebAssembly についての明記:

> "Each isolate can consume up to 128 MB of memory, including the JavaScript heap and WebAssembly allocations."

出典: 同上。**Wasm のメモリ確保も 128MB の isolate メモリ制限に含まれる**。またスクリプトサイズについても Wasm バイナリはバンドルに含まれる限り gzip 後サイズの制限（Free 3MB）にカウントされると考えられる（このページにはスクリプトサイズと Wasm の関係を明示する記述はなく、この点は**未確認**）。

Startup time の制限も見逃せない。

> "A Worker must parse and execute its global scope (top-level code outside of handlers) within 1 second." 超過するとデプロイ自体がエラーコード `10021` で拒否される。

出典: 同上。Wasm モジュールをトップレベルでインスタンス化する実装パターン（後述 2.3）を取る場合、Wasm バイナリが大きいと **この 1 秒のデプロイ時起動制限に抵触するリスク**がある。これは一次情報からは確認できておらず、**プロトタイプでの実測が必要**（未確認）。

### 1.4 Free プランで CPU 制限を超えたときの挙動

> Error 1102: "Worker exceeded resource limits"

出典: [Error 1102 · Cloudflare Support docs](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/)、[Errors and exceptions · Cloudflare Workers docs](https://developers.cloudflare.com/workers/observability/errors/)

CPU 時間制限（10ms）またはメモリ制限（128MB）を超えると、クライアントには Error 1102 のエラーページが返る。Worker コード内で `try/catch` により捕捉して処理を継続できるかどうかは、公式ドキュメントに明記が見当たらず**未確認**。実行が強制終了される（レスポンスを返せない）挙動として説明されている。

### 1.5 長い計算を分割する手段（Free プランでの可否）

| 手段                         | Free プランで利用可否                                                       | CPU 時間の上限（Free）                                                                                      | 備考                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Objects              | 利用可（**SQLite ストレージバックエンドのみ**、KVバックエンドは Paid 限定） | 表記上は Free/Paid共通で「デフォルト30秒、最大5分まで設定可能」                                             | [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)                                                       |
| Queues                       | 利用可（日次 10,000 operations、Paid は月次 100万）                         | Consumer の実行時間は 15 分（wall clock）、CPU 時間は通常の Worker 実行と同じ制限がベースになると考えられる | [Queues Limits](https://developers.cloudflare.com/queues/platform/limits/)、[Pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Workflows                    | 利用可（Free と Paid の両方で提供）                                         | **ステップあたり CPU 時間 10 ms（Free）** / 30秒〜5分（Paid）                                               | [Workflows Limits](https://developers.cloudflare.com/workflows/reference/limits/)、[Workflows](https://developers.cloudflare.com/workflows/)       |
| `scheduled`（Cron Triggers） | 利用可（プラン限定の記載なし）                                              | 10 ms（Free、通常の HTTP リクエストと同じ）                                                                 | [Limits](https://developers.cloudflare.com/workers/platform/limits/)                                                                               |

出典は各行に記載。重要な点を 2 つ:

1. **Durable Objects の CPU 時間上限（30秒デフォルト）は、Limits ページの表で Free/Paid の区分がなく記載されている**。通常の Workers（fetch ハンドラ）が Free で 10ms に制限されるのとは対照的に、Durable Objects のリクエストは（記載通りであれば）Free プランでもデフォルト 30 秒の CPU 時間を持つ。これが実際に Free プランで機能するかどうかは強く確認する価値がある（一次情報の記載を超える検証は本調査のスコープ外）。
2. **Workflows は Free プランでもステップあたり CPU 時間が 10ms** と、通常の Workers の Free 上限と同じ値に設定されている（[Workflows Limits](https://developers.cloudflare.com/workflows/reference/limits/)）。つまり Workflows でステップに分割しても、**各ステップの計算量自体が 10ms を超えられない**点は変わらない。Workflows は「長時間・リトライ可能なオーケストレーション」の仕組みであって、「1回あたりの CPU 予算を増やす」仕組みではない。長い計算を分割する目的には**Durable Objects の方が有望**（CPU 予算そのものが大きい可能性があるため）。

---

## 2. ソルバー・アルゴリズムの選択肢

### 2.1 貪欲法 + 局所探索（自前実装・依存ゼロ）

外部ライブラリなしで、以下のような手順で実装できる:

1. 制約充足を優先する貪欲法で初期解を構築（資格・可用性・連続勤務制限などのハード制約を満たす割当を順に埋める）。
2. 2-opt・Or-opt 的な近傍探索や焼きなまし法で目的関数（負荷の均等化・希望シフトの充足度など）を局所改善する。

**メリット**: 依存ゼロなのでバンドルサイズ・Wasm 読み込みの問題が一切ない。計算量を自分でコントロールできるため、CPU 時間予算に合わせて反復回数を打ち切る「Anytime アルゴリズム」化がしやすく、Workers の CPU 時間制限（Free 10ms でも）に収めることを狙いやすい。

**デメリット**: 最適性の保証がない（局所最適に留まる）。実装・チューニングコストが LP/MIP ソルバーへの委譲より高い。「なぜこの割当なのか」の説明可能性は設計次第（制約違反のログや目的関数の内訳を出せば担保できる）。

これはライブラリではないため外部の一次情報での裏付けは不要（設計上の一般的な特性）。

### 2.2 LP/MIP ソルバー比較

| ライブラリ                                                                | 最新バージョン | 最終公開日 | 実装                 | ライセンス                      | 依存関係    | unpacked size |
| ------------------------------------------------------------------------- | -------------- | ---------- | -------------------- | ------------------------------- | ----------- | ------------- |
| [YALPS](https://github.com/Ivordir/YALPS)                                 | 0.6.4          | 2025-12-24 | 純 JS/TS             | MIT                             | `heap` のみ | 約240 KB      |
| [javascript-lp-solver (jsLPSolver)](https://github.com/JWally/jsLPSolver) | 1.0.3          | 2026-01-24 | 純 JS/TS             | Unlicense（パブリックドメイン） | なし        | 約2.37 MB     |
| [glpk.js](https://github.com/jvail/glpk.js)                               | 5.0.0          | 2025-12-23 | Wasm（GLPK を移植）  | **GPL-3.0**                     | `pako`      | 約2.62 MB     |
| [highs-js（npm名: `highs`）](https://github.com/lovasoa/highs-js)         | 1.14.2         | 2026-05-28 | Wasm（HiGHS を移植） | MIT                             | なし        | 約3.17 MB     |

出典: 各パッケージの npm registry（`registry.npmjs.org/{package}`）の最新バージョンメタデータ、および各 GitHub リポジトリの README。

**メンテ状況**: 4 つとも 2025年末〜2026年前半に最新リリースがあり、いずれも活発に保守されている（"stale" なライブラリはない）。YALPS の README には "バグ修正とセキュリティ更新は継続、新機能は未計画" という枯れた安定運用フェーズである旨の記載がある。

**Node 固有 API 依存 / 動作環境**:

- YALPS・jsLPSolver: 純 JS/TS。jsLPSolver の README は "Zero Dependencies: Pure JavaScript/TypeScript" 、"ノード環境、ブラウザ、ウェブワーカーで動作" と明記（[jsLPSolver README](https://github.com/JWally/jsLPSolver)）。`fs` や `worker_threads` 等の Node 専用 API への依存は README 上見当たらず、**Cloudflare Workers / ブラウザどちらでも動作可能と考えられる**。
- glpk.js・highs-js: いずれも Emscripten でコンパイルされた Wasm + JS グルーコード。glpk.js の README には "JavaScript/WebAssembly port of GLPK" と明記（[glpk.js](https://github.com/jvail/glpk.js)）。highs-js は npm の説明文に "built by compiling a high-performance C++ solver ... to WebAssembly" とある（[highs on npm registry](https://www.npmjs.com/package/highs)）。ブラウザ向けデモページ（[HiGHS-js linear programming](https://lovasoa.github.io/highs-js/)）が存在することからブラウザでの動作は確認できるが、**Cloudflare Workers ランタイム（workerd）上での動作実績は一次情報からは確認できず未確認**。

**Workers での Wasm 読み込み方法**: 本プロジェクトは `@cloudflare/vite-plugin` を使っている（ADR 0001）。同プラグインの公式リファレンスには次の記載がある。

```ts
import wasm from './example.wasm';

const instance = await WebAssembly.instantiate(wasm);
```

> `.wasm`, `.wasm?module` は "WebAssembly.Module として自動的にインポート可能"

出典: [Non-JavaScript modules · Cloudflare Workers Vite plugin docs](https://developers.cloudflare.com/workers/vite-plugin/reference/non-javascript-modules/)

また Workers ランタイム自体も `import mod from "./simple.wasm"` という ES6 import 構文をサポートし、Wrangler は `.wasm` を自動的にバンドルする（[WebAssembly in JavaScript · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/)）。ただし同ページには **`WebAssembly.instantiateStreaming()` は Workers でサポートされない**という制約もあり、通常の `instantiate()` を使う必要がある（[Non-JavaScript modules](https://developers.cloudflare.com/workers/vite-plugin/reference/non-javascript-modules/)）。

一方 highs-js の README（npm 上の説明）には「`node_modules/highs/build/highs.wasm` から Wasm ファイルを取得する」「デフォルトでは JS ファイルと同じパスから読み込む」という記述があり、**動的にファイルパスから fetch するデフォルトの読み込み方式**を前提にしている可能性がある。これは Vite の `import ... from "*.wasm"` によるビルド時バンドルとは異なる統合パターンであり、Workers で使うには追加のアダプタ（`locateFile` 等のカスタマイズ）が必要になる可能性がある。この統合の実際の可否は**未確認**であり、採用する場合は小さなプロトタイプでの検証が必要。

**ライセンス上の注意**: glpk.js は **GPL-3.0**。コードベースへの組み込み方によってはコピーレフト条項の影響を検討する必要がある（本調査は法的判断を行わない。採用時は別途確認が必要）。

### 2.3 想定規模（変数 数千・うち相当数が 0/1、制約 数百〜数千）での現実的な求解時間

YALPS の README には、YALPS・glpk.js・jsLPSolver の 3 者を同一環境（README記載のベンチマークスクリプト、30回実行の平均）で比較したベンチマーク結果が掲載されている（出典: [YALPS README](https://github.com/Ivordir/YALPS)）。抜粋（単位 ms、括弧内は制約数/変数数/整数変数数）:

| 問題                                | 制約/変数/整数変数             | YALPS           | glpk.js          | jsLPSolver |
| ----------------------------------- | ------------------------------ | --------------- | ---------------- | ---------- |
| Monster 2 (MIP)                     | 888 / 924 / 112                | 48.6            | 107.9            | 162.3      |
| Large Farm MIP                      | 35 / 100 / 100（全変数が整数） | 29.1            | **5.3**（最速）  | 54.0       |
| Vendor Selection                    | 1641 / 1640 / 40               | 266.3           | **52.9**（最速） | 354.0      |
| Monster Problem（LP・整数変数なし） | 600 / 552 / 0                  | **1.4**（最速） | 2.8              | 5.3        |

（jsLPSolver 自身の README にも独自環境でのベンチマークがあるが、テストマシン・条件が異なるため上記 YALPS 側の同一条件比較の方が横比較の信頼性が高い。jsLPSolver 単独ベンチマークでは Vendor Selection 相当の "1640変数/1641制約/40整数変数" で 656ms、という数値もある（[jsLPSolver README](https://github.com/JWally/jsLPSolver)）が、CPU・実行環境が異なるため直接比較はできない。)

highs-js（Wasm 版 HiGHS）については、README・npm ページに定量的なベンチマーク数値は見当たらず、**不明**。ただし HiGHS は業界的に高性能な MIP ソルバーとして知られており（本調査で一次情報として確認できたのは「University of Edinburgh が開発した高性能ソルバー」という npm 上の説明のみ）、これは伝聞であり数値的な裏付けは**未確認**。

**この想定規模への当てはめ**: 上記ベンチマークで最も大きい問題は変数 1640・整数変数 40（Vendor Selection）または変数 924・整数変数 112（Monster 2）であり、いずれも「整数変数」の比率は全体の数%〜十数%に留まる。一方、本ユースケースの割当変数（インストラクター×枠 の 0/1 変数）は**数千個すべてがバイナリ変数**になる可能性が高い。YALPS の README 自身が「整数変数は数百個程度まで」を推奨範囲としており（[YALPS README](https://github.com/Ivordir/YALPS)）、**数千個のバイナリ変数を持つ問題は、調査した純 JS ソルバー（YALPS・jsLPSolver）が想定する安全範囲を超える可能性が高い**。この規模・この変数構成（大量の 0/1 変数）での実測ベンチマークは一次情報からは見つからず、求解時間は**「不明」**と明記する。Wasm 実装（glpk.js・highs-js）の方が大規模 MIP に強い可能性が高いが、これも定量的な裏付けは同様に確認できていない。

---

## 3. サーバー（Workers）で解く vs クライアント（ブラウザ）で解く

| 観点                           | Workers（サーバー）                                                                                                                                        | ブラウザ（クライアント）                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU 時間の上限                 | Free: 10ms/req。Paid: デフォルト30秒、最大5分（`limits.cpu_ms`、Paid限定と考えられる）。[出典](https://developers.cloudflare.com/workers/platform/limits/) | 事実上なし（ユーザー端末の性能・ブラウザのタブ休止ポリシー次第）                                                                                                                                                                                                                                                                                                                                                                                                   |
| バンドルサイズの制約           | Free: gzip後 3MB、Paid: 10MB。この中に Wasm ソルバーを含める必要がある。[出典](https://developers.cloudflare.com/workers/platform/limits/)                 | クライアントバンドルにも当然サイズは影響するが、Workers ほど厳格な単一ファイル gzip 上限があるわけではなく、コード分割（dynamic import）で「割当計算画面でだけ読み込む」ようにできる                                                                                                                                                                                                                                                                               |
| UX（待ち時間表示・キャンセル） | サーバー側で長時間ブロックするとリクエストがタイムアウトする懸念があり、進捗表示・キャンセルの実装は複雑（ポーリング or WebSocket/SSE が必要）             | メインスレッドをブロックしなければ（後述 Web Worker）、プログレス表示・キャンセルボタンが素直に実装できる                                                                                                                                                                                                                                                                                                                                                          |
| データ転送量                   | 候補者・可用性・既存割当は元々 D1 にあり、サーバー内で完結できるため追加転送は不要                                                                         | インストラクター一覧・資格・可用性・既存割当を月単位でクライアントへ送る必要がある。ただし既存 UI（`monthlyAssignmentCellSchema` による月次まとめ upsert、`shiftEditDataSchema` の `availableInstructors` 等）は既に同種のデータをクライアントに送る設計になっており、規模（数十名 × 資格・状態程度のフィールド）を考えると数十〜百数十 KB オーダーで、追加コストは小さいと見込まれる（[src/features/shifts/schema.ts](../../src/features/shifts/schema.ts) 参照） |
| 説明可能性・結果の質           | 同じアルゴリズムなら差はない                                                                                                                               | 同左                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

出典はCloudflare公式ドキュメント（表内に記載）。データ転送量の見積もりは本リポジトリのスキーマ定義（一次情報＝自プロジェクトのソースコード）に基づく推測であり、実測値ではない。

### Web Worker（ブラウザ側）

ブラウザのメインスレッドをブロックせずに重い計算を回すには、標準 Web Worker（`new Worker(...)`）でソルバーを別スレッド実行するのが定石。これは Cloudflare Workers とは無関係のブラウザ標準 API（MDN: Web Workers API）であり、Vite は `new Worker(new URL("./worker.ts", import.meta.url))` のような構文で Worker のバンドルをサポートする（Vite 公式ドキュメントの一般的な機能。本調査では Cloudflare 固有ドキュメントの確認を主眼としたため、Vite 側の Worker 機能の一次情報での再確認は行っていない＝未確認）。

これにより「計算中も UI 操作を継続でき、キャンセルボタンを即座に効かせられる」「メインスレッドの応答性を保ったまま数秒〜数十秒のソルバー実行を許容できる」という、CPU 時間の絶対的上限がある Workers 側では得づらい UX が実現しやすい。

---

## 4. 推奨

**結論: 現行の Free プランを維持したまま、シフト自動割当の計算はクライアント（ブラウザ、Web Worker 上）で解くことを推奨する。**

理由:

1. **Free プランの Workers CPU 時間上限（10ms/リクエスト）は、数千変数規模の LP/MIP ソルバーは疎か、多少の反復を要する自前ヒューリスティックにも実質的に不足**しており、サーバー側で完結させるには Paid プラン（`limits.cpu_ms` の引き上げ）が事実上必須になる。
2. 一方、この機能の性質（「提案 → 人間が採用」、リアルタイム性より結果の質・説明可能性が重要）は、**数秒〜数十秒の計算時間をクライアント側で許容できる用途と一致**する。
3. 既存 UI（`ShiftManager.tsx` ほか `src/features/shifts/`）は既に月単位でステージして一括保存する SPA であり、割当候補データ（インストラクター一覧・資格・可用性・既存割当）を月単位でクライアントへ持ってくる設計と自然に噛み合う。追加のサーバー往復（進捗ポーリング等）が不要になる分、実装もむしろ単純化する。
4. Web Worker でメインスレッドをブロックしなければ、進捗表示・キャンセルといった UX 上の要件も無理なく実装できる。

**ソルバーの選び方**: まずは依存ゼロの貪欲法+局所探索を軽量な基盤として検討しつつ、最適性をより重視するなら MIT ライセンスで純 JS の **YALPS** を軽量な入口として試す（バンドルサイズが最小・依存が `heap` のみ）。ただし本調査で確認した通り、この規模（数千個のバイナリ変数）は YALPS 自身が推奨する安全範囲を超える可能性があるため、**プロトタイプ段階で実データに近いサイズの問題を実際に解かせて求解時間を実測する**ことを強く推奨する。純 JS 勢で速度・規模が不足する場合は、Wasm 実装の **highs-js**（MIT、活発にメンテ）を次の選択肢とする。glpk.js は GPL-3.0 のライセンス条件を精査したうえで採否を判断すべき。

**Paid プランへの移行について**: 現時点でこの機能単体のために Paid へ上げる必然性は薄いと判断する。理由は、クライアント側実装であれば Free プランの制約を回避できるため。ただし将来的に「サーバー側で自動的にバッチ実行して通知する」等のユースケースが生まれた場合や、クライアント実装で性能・端末互換性の問題（低スペック端末での待ち時間過大等）が顕在化した場合の Plan B として、Workers Paid（月額 $5、3,000万 CPU ミリ秒込み。[出典](https://developers.cloudflare.com/workers/platform/pricing/)）+ Durable Objects への計算オフロードを検討する余地を残す。Durable Objects の CPU 時間上限（ドキュメント上は Free でもデフォルト30秒）が実際に Free プランで機能するかどうかは、本調査で解消できなかった重要な未確認事項であり、**サーバー側で解く方針を採る場合は最優先で実測検証すべき**。

---

## 参考: 未確認・要検証事項の一覧

- 本リポジトリの `wrangler.toml` の現行 `limits.cpu_ms` 設定値（権限上未確認）。
- Wasm バイナリの gzip 後サイズがスクリプトサイズ制限（Free 3MB）にどうカウントされるかの明示的な記述。
- 大きな Wasm バイナリをトップレベルでインスタンス化した場合に Startup time（1秒）制限に抵触するか。
- Worker 内で CPU 時間超過（Error 1102）を `try/catch` で捕捉できるか。
- Durable Objects の CPU 時間上限（デフォルト30秒）が Free プランで実際に有効かどうかの実測。
- highs-js・glpk.js が Cloudflare Workers ランタイム（workerd）上で実際に動作するかどうかの実機検証（README・デモはブラウザでの動作を示すのみ）。
- 数千個のバイナリ変数を持つ割当問題（本ユースケースの実データに近い形）での各ソルバーの実測求解時間。
