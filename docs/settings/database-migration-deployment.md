# 本番データベース migration のデプロイ手順

## 自動フロー

`main` への push または手動実行により、`.github/workflows/deploy.yml` が次の順で処理する。

1. 必須 secret・variable の検証
2. 依存関係の固定インストールと production build
3. Worker secret の反映
4. `wrangler d1 migrations apply fuyugyo --remote`
5. `wrangler deploy`
6. D1 にアクセスしない `/api/health` による Worker の応答確認

build が失敗した場合は本番 DB を変更しない。migration が失敗した場合は Worker をデプロイしない。Wrangler は migration の適用前に D1 バックアップを取得し、失敗した migration をロールバックする。deploy が失敗した場合は、additive な DB 変更だけが残り、稼働中の旧 Worker はそのまま動作する。公開 health endpoint は攻撃者による D1 リクエストの増幅を避けるため、DB readiness を確認しない。スキーマ適用の成否は migration コマンドの終了コードで判定する。

同時デプロイは GitHub Actions の `deploy-production` concurrency group で直列化する。

## migration の互換性ルール

本番 migration は、適用前の Worker と適用後の Worker の両方から利用できなければならない。

- テーブル・列・index の追加は、既存コードの動作を変えない形で行う。
- 新しい NOT NULL 列は、旧 Worker の書き込みを壊さない default を持たせるか nullable で追加する。
- rename、削除、型や意味の変更は単一デプロイで行わない。
- 破壊的変更は expand/contract に分割する。先に新旧両方を扱えるスキーマとコードを配布し、データ移行と旧コード停止を確認した後、別デプロイで旧スキーマを削除する。

このルールにより、migration 完了から Worker デプロイ完了までの間も旧 Worker が動作できる。

## 障害時の判断

- migration 失敗: Workflow を停止したまま SQL を修正する。Worker は旧版のままなので、先に deploy しない。
- deploy 失敗: additive migration は戻さず、deploy の原因を修正して再実行する。
- deploy 後の health check 失敗: GitHub Actions と Cloudflare のログを確認し、必要なら直前の Worker deployment に戻す。DB 復元はデータ損失を伴うため、Worker のロールバックだけでは復旧できない場合に限る。
- DB 復元が必要: Cloudflare D1 の Time Travel または migration 適用時のバックアップを使い、影響範囲を確認してから実施する。

本番への deploy、remote migration、DB 復元は GitHub Actions または権限を持つ運用担当者が行い、開発エージェントからは実行しない。
