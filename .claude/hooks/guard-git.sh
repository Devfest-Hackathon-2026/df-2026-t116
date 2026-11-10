#!/usr/bin/env bash
# Claude Code PreToolUse(Bash) アダプタ。判定は scripts/guard-git-command.sh。ブロックは exit 2。
root=$(cd "$(dirname "$0")/../.." && pwd)
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
else
  cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
fi
bash "$root/scripts/guard-git-command.sh" "$cmd"
