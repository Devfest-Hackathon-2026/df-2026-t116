#!/usr/bin/env bash
# Cursor beforeShellExecution アダプタ。入力 {"command": "..."} → {"permission": ...} を stdout に出す。
root=$(cd "$(dirname "$0")/../.." && pwd)
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("command",""))' 2>/dev/null)
if reason=$(bash "$root/scripts/guard-git-command.sh" "$cmd" 2>&1 >/dev/null); then
  printf '{"permission":"allow"}\n'
  exit 0
fi
printf '%s' "$reason" | python3 -c 'import json,sys; r=sys.stdin.read().strip(); print(json.dumps({"permission":"deny","user_message":r,"agent_message":r}, ensure_ascii=False))'
exit 0
