#!/usr/bin/env bash
# check-commit-msg.sh と check-branch-name.sh の自動テスト。
set -u
dir=$(cd "$(dirname "$0")" && pwd)
fail=0

expect() { # 期待終了コード スクリプト 引数
  local want="$1" script="$2" arg="$3"
  bash "$dir/$script" "$arg" >/dev/null 2>&1
  local got=$?
  if [ "$got" -eq "$want" ]; then
    echo "PASS: $script '$arg'"
  else
    echo "FAIL: $script '$arg' (期待 $want, 実際 $got)"
    fail=1
  fi
}

for m in "feat: 追加" "fix(api): 修正" "docs!: 破壊的変更" "ci(workflow)!: x" \
  "Merge branch 'main' into x" 'Revert "feat: 追加"' "fixup! feat: a" "squash! fix: b"; do
  expect 0 check-commit-msg.sh "$m"
done
for m in "追加した" "feat:追加" "feat: " "Feat: x" "feature: x" "feat(): x" "feat(a b): x" ""; do
  expect 1 check-commit-msg.sh "$m"
done

for b in feat/1-dev-conventions-ci fix/20-a docs/3-x1; do
  expect 0 check-branch-name.sh "$b"
done
for b in main feat/add-login feat/1-Add feat/1_x feature/1-x feat/1- "feat/1-日本語"; do
  expect 1 check-branch-name.sh "$b"
done

# --- pre-push（一時リポジトリ） ---
root=$(cd "$dir/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(
  cd "$tmp" && git init -q -b main . && mkdir scripts &&
  cp "$root/scripts/check-branch-name.sh" scripts/ &&
  git -c user.name=t -c user.email=t@example.com commit -q --allow-empty -m "feat: a" &&
  git -c user.name=t -c user.email=t@example.com commit -q --allow-empty -m "feat: b"
) || { echo "FAIL: 一時リポジトリの準備"; exit 1; }
zero=0000000000000000000000000000000000000000
c2=$(git -C "$tmp" rev-parse HEAD)
c1=$(git -C "$tmp" rev-parse HEAD~1)

expect_push() { # 期待終了コード 説明 入力行
  local want="$1" label="$2" line="$3" got
  (cd "$tmp" && printf '%s\n' "$line" | bash "$root/.githooks/pre-push" origin x) >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    echo "PASS: pre-push $label"
  else
    echo "FAIL: pre-push $label (期待 $want, 実際 $got)"
    fail=1
  fi
}
expect_push 1 "main への push" "refs/heads/feat/1-a $c2 refs/heads/main $c1"
expect_push 1 "main の削除" "(delete) $zero refs/heads/main $c1"
expect_push 1 "非 fast-forward" "refs/heads/feat/1-a $c1 refs/heads/feat/1-a $c2"
expect_push 1 "規約外のブランチ名" "refs/heads/badname $c2 refs/heads/badname $zero"
expect_push 0 "新規の正しいブランチ" "refs/heads/feat/1-a $c2 refs/heads/feat/1-a $zero"
expect_push 0 "fast-forward 更新" "refs/heads/feat/1-a $c2 refs/heads/feat/1-a $c1"
expect_push 0 "ブランチ削除" "(delete) $zero refs/heads/feat/1-a $c1"

# --- guard-git（共通判定と各ツールのアダプタ） ---
bash "$dir/test-guard-git.sh" || fail=1

exit "$fail"
