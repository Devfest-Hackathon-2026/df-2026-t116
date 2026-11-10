# 12 秘密情報の扱い

API キー、トークン、パスワードなどの秘密情報は、次のどちらかに置く。

| 場所 | 用途 | 置き方 |
|---|---|---|
| **Secret Manager** | 本番（Cloud Run / App Hosting） | コンソールか `gcloud secrets create` で作り、サービスに紐づける |
| **ローカルの `.env`** | 開発マシンだけ | `.env.example` をコピーして `.env` にし、値を入れる |

## 守ること

- 秘密情報をコミットしない。`.env` も含む（`.env.example` は値を空にしたものだけ可）。
- チャット、Issue、PR の本文、スクショに貼らない。
- 漏れたと思ったら、まずキーを無効化して作り直す。履歴から消すより先に行う。
- 秘密情報を含む画像や動画を公開しない（デモの画面共有にも注意する）。

## 多層の検査

| 層 | 何をする | 場所 |
|---|---|---|
| pre-commit | `.env` などの危険なファイル名のステージを止める。gitleaks があれば差分を検査 | `.githooks/pre-commit`（`./scripts/setup-hooks.sh` で有効化） |
| secret-scan | CI で gitleaks を実行し、PR に結果を出す | `.github/workflows/ci.yml` の `secret-scan` |
| 手元の確認 | 提出前に、書き出したディレクトリで gitleaks を再実行する | [docs/decisions/0001](decisions/0001-submission-transfer.md) |

pre-commit は手元で止めるための層で、CI の検査の代わりにはならない。gitleaks が入っていないマシンでは警告だけ出て、検査は CI に任される。

## チームでの共有

- 値は **Secret Manager** に入れて、共有はアクセス権で行う。チャットに貼らない。
- 付与は必要な人だけ。締切後は不要になったアクセスを外す。
- 共有が必要になったら、メンバーに「Secret Manager の値を見られる権限」を依頼する形にする。

## 関連

- AGENTS.md の「セキュリティ」節
- [docs/11 GCP デプロイ手順](11-gcp-deploy.md)
