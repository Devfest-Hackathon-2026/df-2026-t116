# AGENTS.md

最初に読む: [docs/MAP.md](docs/MAP.md)（どの doc を開くか迷ったらここ）、次に [docs/00-start-here.md](docs/00-start-here.md)（アイデア決定後の最初の 30 分）

- 技術スタック: [docs/decisions/0002-tech-stack.md](docs/decisions/0002-tech-stack.md)（決定済み）
- デプロイと課金の上限: [docs/11-gcp-deploy.md](docs/11-gcp-deploy.md)
- 秘密情報: [docs/12-secrets.md](docs/12-secrets.md)
- 締切と提出: [docs/13-demo-and-submission.md](docs/13-demo-and-submission.md)

## 意思決定の記録（重要）
- 意思決定は `docs/decisions/` の ADR と PR 本文の**両方**に、なるべく詳しく書く（背景・選択肢・理由・却下理由・影響・未決）。
- 決定を含む PR は ADR を追加・更新し、PR 本文にも要約と理由を書く。
- 書き方とテンプレートは [docs/decisions/README.md](docs/decisions/README.md)。出典に無い事実は書かず、分からないことは「未確認」と書く。秘密情報は書かない。

## 着手の前に看板を見る（重要）
同じ Issue を2人（2つの AI）が同時に作業しないために、着手と終了は必ず看板（開発用リポジトリの GitHub Projects）に残す。gh のコマンドと固定値は [docs/14-kanban.md](docs/14-kanban.md)、決定は [0015](docs/decisions/0015-kanban-claim-rule.md)。
1. **着手の前に確かめる。** 対象の Issue の Status と Assignees を見る。自分以外が Assignee で In Progress なら触らない（Issue に勝手に書き足さない）。Issue が看板に無ければ先に足す。
2. **自分のものにする。** Issue の Assignee を自分（AI は、その AI を動かしている人のアカウント）にし、看板の Status を In Progress、Owner を ai（人が手で作業するなら human）にする。
3. **着手を宣言する。** Issue に1行コメントする: `【着手】<誰のAIか（例: @Maaa2005 の Claude Code）>／ブランチ <type>/<Issue番号>-<短い名前>／終了見込み <HH:MM JST>`
4. **ブランチと PR は必ず Issue 番号付き。** ブランチは `<type>/<Issue番号>-<短い名前>`、PR 本文に `Closes #<番号>` か `Refs #<番号>`。PR も看板に足し、In Progress（レビュー待ちなら In Review）にする。
5. **終わったら Done、やめたら外す。** マージで閉じたら Issue・PR とも Done。途中でやめる・人待ちになるときは、Assignee を外して Todo に戻すか Blocked(人待ち) にし、Issue に `【中断】理由／どこまでやったか／ブランチ` をコメントする。
6. **終了見込みを過ぎて続けるなら、** 見込みを書き直す（コメント1行）。
7. **引き取り:** In Progress のまま**3時間反応がなければ、本人に一声かけてから**引き取ってよい。引き取ったら Assignee を自分に替え、【着手】を書き直す。

## セキュリティ
- 秘密情報（API キー、トークン、パスワード）をコミットしない。
- `.env` はコミットしない（`.env.example` は可）。
- 最初に hooks を有効化する: `./scripts/setup-hooks.sh`
- `--no-verify` は使わない。フックで止まったら原因を直す。
- main へ直接 push しない。force push もしない。

## PR
- ブランチ名とコミットは [docs/09](docs/09-コミットとブランチの規約.md) の規約に従う。
- PR テンプレートを埋める。
- CI が緑になってから出す。
- 1 Issue = 1 PR。
- 着手・終了は看板に残す（上の「着手の前に看板を見る」）。

## どの AI でも共通
- 使われうる AI: Claude Code / Codex / Grok / Cursor。いずれもまずこの AGENTS.md を読む。
- 作業前に `git config core.hooksPath` が `.githooks` か確認する。違えば `./scripts/setup-hooks.sh`。
- AI は、人間（@H4aruki）が許可した場合のみマージしてよい。許可の無い PR はマージしない。許可された PR も CI が緑か確かめてからマージする（今回は締切のため、許可のうえでハーネスで回す。[0014](docs/decisions/0014-dev-workflow.md)）。
- `--no-verify` と force push は、どのツールでも使わない。
- 危険な git（`--no-verify`、force push、main への push、`core.hooksPath` 変更）は、Claude Code / Codex / Grok / Cursor のプロジェクト hooks が実行前に止める（判定は `scripts/guard-git-command.sh` に共通化）。ただし Codex は `/hooks` で、Grok は `/hooks-trust` か `--trust` で信頼しないと動かず、Codex と Grok はフックの失敗・timeout・不正出力で fail-open（止まらない）になる。最後の砦は git hooks（`.githooks`）と CI。
