#!/usr/bin/env bash
# Codex PreToolUse(Bash) アダプタ。入力 tool_input.command。拒否は permissionDecision=deny の JSON。
root=$(cd "$(dirname "$0")/../.." && pwd)
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
if reason=$(bash "$root/scripts/guard-git-command.sh" "$cmd" 2>&1 >/dev/null); then
  exit 0
fi
printf '%s' "$reason" | python3 -c 'import json,sys; r=sys.stdin.read().strip(); print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":r}}, ensure_ascii=False))'
exit 0
