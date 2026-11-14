# 依存パッケージの更新

Renovate の設定はルートの `renovate.json` で管理する。

## 更新方針

- 通常の更新 PR と lockfile 更新は毎週月曜日の 0:00〜6:59（Asia/Tokyo）に作成する。実際の時刻は Renovate の実行タイミングに依存する。
- 公開から7日経過したバージョンを対象にする。`pnpm-workspace.yaml` の `minimumReleaseAge: 10080` と合わせ、`trustPolicy: no-downgrade` は維持する。
- TanStack・Mantine・Cloudflare・ESLint・Vitest は関連パッケージをグループ化する。本番依存と開発依存、および minor と patch を分け、自動マージ対象と手動確認対象を混在させない。
- 本番依存の patch、開発依存の minor/patch は必須チェック成功後に自動マージする。
- major・0.x 系の全更新・本番依存の minor・GitHub Actions・lockfile 更新は手動確認する。0.x 系はグループから分離する。
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

GitHub のアラートと OSV の検知を有効にする。脆弱性修正 PR は通常の週次スケジュールを待たず、Renovate の次回実行で作られる。ただし修正版にも7日の公開待機期間を適用し、pnpm のインストール条件と合わせる。待機期間内の緊急修正は、個別に待機期間の例外を検討する。

OSV による npm の検知は直接依存が対象。seroval などの間接依存は、親パッケージ（TanStack Router など）の更新か lockfile 更新で解消するかを確認する。

```bash
pnpm audit --prod --audit-level=high
pnpm audit --audit-level=moderate
```

上段は Issue #266 の本番依存の完了条件、下段は開発依存を含む手動確認用の監査。現在の Quality Check の audit は既存のままとし、PR からの削除と週次監査への移行は [Issue #267](https://github.com/keichan110/fuyugyo/issues/267) で対応する。

導入から1週間経っても解消しない脆弱性は手動で更新する。Dependency Dashboard のエラーと PR の lockfile 生成結果も確認し、設定追加だけで解消したと判断しない。

## 設定の検証

```bash
npm exec --yes --package=node@26.13.0 --package=renovate@44.239.1 -- renovate-config-validator --strict renovate.json
```

## 参照

- [Renovate 設定](https://docs.renovatebot.com/configuration-options/)
- [GitHub Actions の SHA 固定](https://docs.renovatebot.com/modules/manager/github-actions/)
- [Issue #266](https://github.com/keichan110/fuyugyo/issues/266)
