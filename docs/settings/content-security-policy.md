# SPA の CSP 確認手順

`public/_headers` の CSP は、まず `Content-Security-Policy-Report-Only` で導入する。Report-Only は違反をブロックしない。主要画面での確認が終わるまでは強制適用に変更しない。

## リソースの根拠

- スクリプトと CSS は Vite の同一オリジンのビルド成果物を使用する。
- Mantine の動的スタイルとインラインスタイルを許可するため `style-src` に `'unsafe-inline'` を含める。
- アバターは LINE プロフィールの `pictureUrl` を表示する。画像には同一オリジン・data URL と `https://profile.line-scdn.net` を許可する案とする。本番データの画像ホストは未確認。
- ブラウザの API 呼び出しは同一オリジン。天気 API への外部通信は Worker の `src/server/weather-fetcher.ts` が実行する。
- LINE 認証はページ遷移で行い、外部スクリプトや iframe を埋め込まない。

## 強制適用前の確認

ビルド済み SPA を配信する検証環境で、HTML レスポンスに Report-Only ヘッダが付くことと、ブラウザのコンソールに CSP 違反がないことを確認する。Vite の開発モードは本番とリソース構成が異なるため、これだけで完了としない。

- ログインと LINE 認証後の遷移
- ダッシュボード
- シフト管理のカレンダー・編集・印刷
- ユーザー一覧・詳細とアカウントメニューのアバター
- 天気表示

LINE アバターが実際に取得するホストを Network パネルで確認し、必要なホストだけを許可する。`/assets/` のハッシュ付きアセットには長期キャッシュが付き、HTML には付かないことも確認する。

確認結果を記録したうえで `Content-Security-Policy` へ切り替える。

## 検証結果

2026-11-18（JST）に、[#281 を含む本番リリース](https://github.com/keichan110/fuyugyo/actions/runs/44283210721)の公開レスポンスを確認した。以下のヘッダは [PR #338](https://github.com/keichan110/fuyugyo/pull/338) の適用前に取得した。PR の適用後は HTML が参照するエントリが Zod の初期化用スクリプトに変わるため、配信後に新しいエントリのキャッシュも確認する。

| 対象 | 確認結果 |
| --- | --- |
| `/` と `/login` の HTML | HTTP 200。 `Content-Security-Policy-Report-Only` が付与され、`Cache-Control` は `public, max-age=0, must-revalidate` |
| HTML から参照されるハッシュ付き JavaScript | HTTP 200。 `Cache-Control` は `public,max-age=31536000,immutable` |

ローカルのビルド済み SPA では、ダッシュボードなどの画面で Zod の動的コード生成による `script-src` 違反を再現した。SPA 起動時に Zod の JIT を無効化し、`script-src 'self'` のまま利用できるよう修正した。修正後の CSP 違反の確認範囲は、ビルド版（`E2E_BUILT=1`）のダッシュボード初期表示に限る。Chromium と WebKit の両方で違反が発生しないことを確認した。

確認時のリリースでは、ブラウザ版 Sentry の `VITE_SENTRY_DSN` が外部の取り込み先を指していた。ブラウザがエラー通知を直接送信するには、そのオリジンを `connect-src` に許可する必要がある。強制適用前に対象環境の DSN と Network パネルで送信先を照合し、実際に使うオリジンだけを許可する。

実際の LINE 認証後の遷移、認証済み画面のコンソール、印刷、天気、LINE プロフィール画像の取得先は検証環境で確認する。現時点での `img-src` の LINE 画像ホストは `https://profile.line-scdn.net` のみ。実際の取得先を確認した後に許可範囲を確定する。

画面検証・本番画像ホスト確認・強制適用は [Issue #282](https://github.com/keichan110/fuyugyo/issues/282) で追跡する。
