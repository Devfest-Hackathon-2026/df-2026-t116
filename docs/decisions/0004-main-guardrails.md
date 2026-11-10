# 0004 main を守る仕組み

- 状態: 決定（2026-11-05 PR #12・#15 で他の AI ツールにも拡張）
- 日付: 2026-11-05
- 決定者: @H4aruki の方針（2026-11-04: リポジトリ制約は標準。2026-11-05 の Org 移行時: hooks＋CI で守る）。仕組みの中身は Miso が Claude Code で実装
- 関連: #3、PR #4、#11/PR #12、#13/PR #14・#15、[0003](0003-org-and-visibility.md)、[0014](0014-dev-workflow.md)、[docs/10](../10-CIとフックの仕組み.md)

## 背景

- @H4aruki の決定（2026-11-04 21:01）: リポジトリ制約は「標準」＝ main 直 push 禁止、PR とレビュー必須、CI でテスト必須、秘密情報の検知。セキュリティはフックで。
- Org 移行後、非公開・無料 Org のため GitHub の branch protection が使えない（403、[0003](0003-org-and-visibility.md)）。
- 作業は AI 主体（Claude Code / Codex / Grok / Cursor）で、人が直接 push することはほぼ無い。AI が誤って危険な git を打つのを、実行前に止める必要がある。

## 検討した選択肢

### 案A: git hooks ＋ AI ツールの実行前フック ＋ CI（採用）
- 利点: 費用ゼロ。AI が実行する前に止められる。CI が最後の砦になる。
- 欠点: hooks はローカル設定なので、外した人は main に push できてしまう。一部ツールのフックは信頼設定が要り、失敗時に止まらない（fail-open）。

### 案B: branch protection を戻すためだけに公開にする
- 利点: GitHub 側で強制できる。
- 欠点: 作業中の内容が見える（[0003](0003-org-and-visibility.md) と同じ理由）。

### 案C: 有料の GitHub Pro / Team
- 利点: 非公開のまま強制できる。
- 欠点: 費用がかかる。

## 決定

- `.githooks`
  - pre-commit: main へのコミットと秘密情報になりやすいファイル名（`.env`・`*.pem`・`*.key` 等）を止め、gitleaks を実行する（未導入なら警告して CI に任せる）。
  - commit-msg: Conventional Commits を求める。
  - pre-push: main への push、force push 相当（fast-forward でない push）、main の削除、規約外のブランチ名を止める。
- AI ツールの実行前フック: `.claude/` `.cursor/` `.codex/` `.grok/` の各 `hooks/guard-git.sh` が、main への push、`--force`、`--no-verify`、`core.hooksPath` の変更を止める。判定は `scripts/guard-git-command.sh` に共通化（PR #15）。
- PR の CI（lint-test / conventions / secret-scan）で守る。gitleaks は CLI v8.30.1 をチェックサム検証して直接実行する。
- 設定は `./scripts/setup-hooks.sh` で行う。

## 理由（判断基準）

1. **費用ゼロ**で「標準」の制約を満たす（案C は不可）。
2. **非公開を維持**（案B は不可）。
3. AI 主体の開発なので、**AI が実行する前に止める**層が一番効く。人の push はほぼ無い。
4. 層を重ねる: AI フック → git hooks → CI。どれか1つが外れても次で止まる。

## 却下した案と理由

| 案 | 採らなかった理由 |
|---|---|
| branch protection を戻すためだけに公開にする | [0003](0003-org-and-visibility.md) と同じ理由で、非公開を維持する |
| 有料の GitHub Pro / Team | 費用をかけない方針のため |
| gitleaks-action を使う | Org のリポジトリでは GITLEAKS_LICENSE が要る（2026-11-05 PR #2・#4 で CI が赤）。CLI 直実行に切り替えた |

## 影響

- コード: `.githooks/`、`scripts/`（check-commit-msg / check-branch-name / guard-git-command / setup-hooks / test-conventions）、各 AI ツールの hooks 設定、`.github/workflows/ci.yml`。
- 運用: 作業前に `git config core.hooksPath` が `.githooks` か確認する（AGENTS.md）。ブランチは `<type>/<Issue番号>-…` で、Issue 番号が要る。
- 費用: Actions の分数（月 2,000 分の無料枠）を使う。

## リスクと対策

| リスク | 対策 |
|---|---|
| hooks を外した人は main に push できてしまう | 運用で守る。AGENTS.md で `--no-verify` と hooksPath 変更を禁止。CI は PR で必ず走る |
| Codex は `/hooks`、Grok は `/hooks-trust` か `--trust` で信頼しないとフックが動かない。失敗・timeout・不正出力で fail-open | 最後の砦は git hooks と CI（AGENTS.md に明記） |
| Cursor は trusted workspace でないとフックが動かない | 同上 |
| 判定が文字列照合の簡易なもの | 同上 |
| CI が赤のままマージしてしまう（テストベッド PR #2 で発生） | checks の結果を見てから、別の操作でマージする |
| 積み重ね PR で変更が main に届かない（#14 で発生） | PR の向き先は常に main |

## 未決事項・見直す条件

- 公開化や有料プランに変えた場合は、branch protection を併用するよう見直す。
- AI によるマージの扱いは [0014](0014-dev-workflow.md) を参照（人間が許可した場合のみ AI がマージしてよい）。

## 出典

- 前提メモ追記 2026-11-04 21:01、2026-11-05 15:41
- 試行錯誤ログ 2026-11-04 22:35（テストベッド PR #2 の赤マージ）、2026-11-05 15:45（gitleaks CLI 化）、18:10・18:22（PR #12・#14）、19:00（積み重ね PR の事故）
- PR #4・#12・#14・#15、[docs/10](../10-CIとフックの仕組み.md)、AGENTS.md
