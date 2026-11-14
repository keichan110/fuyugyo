# 依存パッケージの更新

Renovate の設定はルートの `renovate.json` で管理する。

## 更新方針

- 通常の更新 PR は毎日 0:00〜6:59、lockfile maintenance は毎週月曜日の同時間帯（Asia/Tokyo）に作成する。実際の時刻は Renovate の実行タイミングに依存し、両者の実行順序は指定しない。通常更新でも lockfile は一緒に更新する。
- 公開から7日経過したバージョンを対象にする。`pnpm-workspace.yaml` の `minimumReleaseAge: 10080` と合わせ、`trustPolicy: no-downgrade` は維持する。
- TanStack・Mantine・Cloudflare・ESLint・Vitest は関連パッケージをグループ化する。原則として本番依存と開発依存、および minor と patch を分け、自動マージ対象と手動確認対象を混在させない。TanStack Router 本体・plugin・CLI は本番・開発依存をまたいでまとめ、patch は自動マージ、minor は手動確認する。TanStack Query は別グループにする。Cloudflare 関連は0.x 系も含めてまとめ、minor・patch とも手動確認する。
- 本番依存の patch、開発依存の minor/patch は必須チェック成功後に自動マージする。
- major・0.x 系の全更新・本番依存の minor・Cloudflare 関連・GitHub Actions・lockfile 更新は手動確認する。0.x 系は Cloudflare 関連を除きグループから分離する。
- GitHub Actions はコミット SHA で固定する。末尾のバージョンコメントも Renovate が更新する。
- 自動マージは本番デプロイを実行しない。本番への反映は Release ワークフローを手動実行する。

## 導入手順

1. この設定を含む PR を main にマージする。
2. Renovate の GitHub App を **このリポジトリだけ**にインストールする。
3. GitHub の Settings → General → Pull Requests で Allow auto-merge を有効にする。
4. main のルールで `quality-check` が必須であり、Renovate App に bypass がないことを確認する。
5. Dependency Dashboard と最初の更新 PR で、グループ・ラベル・更新種別・自動マージの可否を確認する。
6. 次の週次実行まで確認し、Issue #266 の受け入れ条件を確認してからクローズする。

## 脆弱性への対応

Renovate のセキュリティ専用更新は、`vulnerabilityAlerts.enabled: false` と `osvVulnerabilityAlerts: false` で無効にする。セキュリティ更新の処理が pnpm の `minimumReleaseAgeExclude` に例外を追加し、7日待機を回避するため。GitHub の脆弱性アラート経由と OSV 経由は別の設定なので、両方を明示する。

脆弱性修正版も通常更新として、公開後7日の待機と日次スケジュールに従って取り込む。自動マージ条件は通常更新と同じ。間接依存は親パッケージの更新か週次の lockfile maintenance で更新する。Renovate の OSV 専用検知は使わず、実際に使用中の依存に残る脆弱性は `pnpm audit` で確認する。週次監査の追加は Issue #267 で対応する。

既存の `[SECURITY]` PR は閉じて通常更新に切り替え、Renovate が追加した待機例外は削除する。緊急時に7日待機を外すかは個別に判断し、自動では追加しない。`pnpm audit --fix` も待機例外を追加することがあるため、監査のみを行う場合は `--fix` を付けない。

```bash
pnpm audit --prod --audit-level=high
pnpm audit --audit-level=moderate
```

上段は Issue #266 の本番依存の完了条件、下段は開発依存を含む手動確認用の監査。現在の Quality Check の audit は既存のままとし、PR からの削除と週次監査への移行は [Issue #267](https://github.com/keichan110/fuyugyo/issues/267) で対応する。

導入から1週間経っても解消しない脆弱性は手動で更新する。Dependency Dashboard のエラーと PR の lockfile 生成結果も確認し、設定追加だけで解消したと判断しない。

## 設定の検証

```bash
npm exec --yes --package=node@26.13.0 --package=renovate@44.228.0 -- renovate-config-validator --strict renovate.json
```

検証する版は Mend の実行ログにある Renovate の版に合わせる。上記は初回実行時の版。

## 参照

- [Renovate 設定](https://docs.renovatebot.com/configuration-options/)
- [GitHub Actions の SHA 固定](https://docs.renovatebot.com/modules/manager/github-actions/)
- [Issue #266](https://github.com/keichan110/fuyugyo/issues/266)
