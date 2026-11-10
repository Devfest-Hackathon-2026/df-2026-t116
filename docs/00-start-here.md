# はじめに（アイデア決定後の最初の 30 分）

> アイデア未決ならここまで来ない。決まったらこのページから。
> どの doc を読めばよいか迷ったら、まず [MAP](MAP.md) を開く。

## 手順

1. **判断記録（ADR）を埋める**
   [docs/decisions/0002-tech-stack.md](decisions/0002-tech-stack.md) の「未決」を「決定」に書き換える。候補から 1 つ選び、理由と却下した案を残す。
2. **カテゴリを 1 つ選ぶ**: 医療・福祉 / 観光 / 教育 / エンタメ / クリエイティブ
3. **ランタイムを 1 つ以上選ぶ**
   - App Engine / Cloud Run / Compute Engine / Firebase App Hosting / GKE / Firebase Hosting
   - **推奨: Cloud Run または Firebase Hosting / App Hosting**
   - Compute Engine と GKE はチームの課金上限の外なので避ける。
4. **アイデアを Issue に分解する**
   - `task` フォームを使う（1 Issue = 1 PR で閉じる大きさ）。
   - ラベルは `type` / `priority` / `area` を付ける。
   - マイルストーンは `MVP 11/7` / `機能完成 11/9` / `提出 11/10` を使う。
5. **スキャフォールドは PR 経由で入れる**
   - main へ直接 push しない。ブランチ名とコミットは [docs/09](09-コミットとブランチの規約.md) に従う。
6. **最初のデプロイ**
   - [docs/11-gcp-deploy.md](11-gcp-deploy.md) に従う。先に課金ガードレールを設定してからデプロイする。
   - 秘密情報の扱いは [docs/12-secrets.md](12-secrets.md)。

## 次に読むもの

- [AGENTS.md](../AGENTS.md)（セキュリティと PR の基本）
- [docs/13-demo-and-submission.md](13-demo-and-submission.md)（締切と提出の流れ）
- アイデア出し: [チェックリスト](ideation-checklist.md) と [アイデアシートのテンプレート](ideation-sheet-template.md)
