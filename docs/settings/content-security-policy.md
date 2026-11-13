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

確認結果を記録したうえで `Content-Security-Policy` へ切り替える。この資料の追加時点では画面検証と本番ホスト確認は未実施。
