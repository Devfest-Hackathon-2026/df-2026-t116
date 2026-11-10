#!/usr/bin/env bash
# コミットメッセージ（1行目）が Conventional Commits に沿うか検査する。
# 使い方: check-commit-msg.sh "<メッセージ>" | <ファイルパス>
set -u

if [ $# -ne 1 ]; then
  echo "使い方: $0 <メッセージ文字列 または ファイル>" >&2
  exit 2
fi

if [ -f "$1" ]; then
  first=$(grep -v '^#' "$1" | head -n 1)
else
  first=$(printf '%s\n' "$1" | head -n 1)
fi
first=${first%$'\r'}

# マージ・revert・fixup・squash は通す
case "$first" in
  "Merge "*|"fixup! "*|"squash! "*) exit 0 ;;
esac
revert_re='^Revert ".+"$'
if [[ "$first" =~ $revert_re ]]; then
  exit 0
fi

re='^(feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert)(\([^()[:space:]]+\))?!?: .+'
if [[ "$first" =~ $re ]]; then
  exit 0
fi

cat >&2 <<MSG
コミットメッセージが規約（Conventional Commits）に合っていません。
  検査した行: ${first}
形式: type(scope)!: 説明
  type  : feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert
  scope : 任意。例 (docs)
  !     : 任意。破壊的変更のとき
  説明  : ": "（コロンと半角スペース）の後に書く。日本語可
例:
  feat: ログイン画面を追加
  fix(api): タイムアウトの設定を修正
  docs!: 運用手順を全面改訂
MSG
exit 1
