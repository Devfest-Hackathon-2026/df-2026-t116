#!/usr/bin/env bash
# ブランチ名が規約に沿うか検査する。
# 使い方: check-branch-name.sh <ブランチ名>
set -u

if [ $# -ne 1 ]; then
  echo "使い方: $0 <ブランチ名>" >&2
  exit 2
fi

name="$1"
re='^(feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert)/[0-9]+-[a-z0-9-]+$'
if [[ "$name" =~ $re ]]; then
  exit 0
fi

{
  echo "ブランチ名が規約に合っていません: ${name}"
  if [ "$name" = "main" ]; then
    echo "main は作業ブランチとして使えません。main への直接コミットは禁止です。"
  fi
  cat <<'MSG'
形式: <type>/<Issue番号>-<小文字英数とハイフン>
  type: feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert
例:
  feat/12-add-login
  docs/3-update-readme
MSG
} >&2
exit 1
