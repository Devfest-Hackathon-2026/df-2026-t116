#!/usr/bin/env bash
# 危険な git 操作を判定する共通スクリプト。各ツールのフックは薄いアダプタとしてこれを呼ぶ。
# 使い方: bash scripts/guard-git-command.sh "<コマンド文字列>"  または stdin に1行
# ブロック時: 理由を stderr に出して exit 2。許可時: exit 0。
if [ "$#" -gt 0 ]; then cmd=$1; else cmd=$(cat); fi

block() {
  echo "ブロック: $1" >&2
  exit 2
}

while IFS= read -r seg; do
  read -ra w <<<"$seg"
  start=-1
  for i in "${!w[@]}"; do
    if [ "${w[$i]}" = "git" ]; then
      start=$i
      break
    fi
  done
  [ "$start" -ge 0 ] || continue
  rest=("${w[@]:$((start + 1))}")

  for a in "${rest[@]}"; do
    [ "$a" = "--no-verify" ] && block "--no-verify はフックを迂回するため使えません。フックで止まった原因を直してください。"
  done

  sub=""
  for a in "${rest[@]}"; do
    case "$a" in -*) ;; *) sub=$a; break ;; esac
  done

  case "$sub" in
    push)
      for a in "${rest[@]}"; do
        case "$a" in
          --force | -f | --force-with-lease | --force-with-lease=* | --force-if-includes)
            block "force push は禁止です。" ;;
          --delete | -d)
            block "リモートブランチの削除（--delete）は禁止です。" ;;
          +*)
            block "+ 付き refspec は force push になるため禁止です。" ;;
          :*)
            block "空のコピー元 refspec（:ブランチ）はリモートブランチの削除になるため禁止です。" ;;
          main | HEAD:main | refs/heads/main | *:main | *:refs/heads/main)
            block "main への直接 push は禁止です。作業ブランチから PR を出してください。" ;;
        esac
      done ;;
    config)
      for i in "${!rest[@]}"; do
        if [ "${rest[$i],,}" = "core.hookspath" ] && [ $((i + 1)) -lt "${#rest[@]}" ]; then
          block "core.hooksPath の変更はフックを無効化できるため禁止です。"
        fi
      done ;;
  esac
done < <(printf '%s\n' "$cmd" | sed 's/&&/\n/g; s/||/\n/g; s/[;|]/\n/g')
exit 0
