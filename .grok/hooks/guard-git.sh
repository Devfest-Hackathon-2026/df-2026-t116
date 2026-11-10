#!/usr/bin/env bash
# Grok Build PreToolUse アダプタ。toolInput.command / tool_input.command / command のどれかを使う。
# 注意: Grok のフックは失敗・timeout・不正出力で fail-open（止まらない）。
root=$(cd "$(dirname "$0")/../.." && pwd)
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k in ("toolInput","tool_input"):
    v=d.get(k)
    if isinstance(v,dict) and v.get("command"):
        print(v["command"]); sys.exit()
print(d.get("command",""))' 2>/dev/null)
if reason=$(bash "$root/scripts/guard-git-command.sh" "$cmd" 2>&1 >/dev/null); then
  exit 0
fi
printf '%s' "$reason" | python3 -c 'import json,sys; r=sys.stdin.read().strip(); print(json.dumps({"decision":"deny","reason":r}, ensure_ascii=False))'
exit 0
