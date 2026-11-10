#!/usr/bin/env bash
# 共通判定と各ツールのアダプタ（Claude / Cursor / Codex / Grok）のテスト。
set -u
dir=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$dir/.." && pwd)
fail=0

block_cmds=("git push origin main" "git push origin HEAD:main" "git push --force origin feat/1-a"
  "git push -f" "git push --force-with-lease" "git push origin +feat/1-a" "git push --delete origin main"
  "git push origin :main" "git commit --no-verify -m x" "git push --no-verify"
  "git config core.hooksPath /dev/null" "cd x && git push origin main")
allow_cmds=("git push origin feat/1-a" "git push -u origin feat/1-a" "git status" "git config core.hooksPath" "ls -f" "echo main")

json() { python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1].replace("@CMD@", json.dumps(sys.argv[2])[1:-1]))))' "$1" "$2"; }

# 結果: "deny" か "allow" に正規化
verdict_common() { bash "$dir/guard-git-command.sh" "$1" >/dev/null 2>&1; [ $? -eq 2 ] && echo deny || echo allow; }
verdict_claude() { local o; json '{"tool_input":{"command":"@CMD@"}}' "$1" | bash "$root/.claude/hooks/guard-git.sh" >/dev/null 2>&1; [ $? -eq 2 ] && echo deny || echo allow; }
verdict_cursor() { json '{"command":"@CMD@","cwd":"/tmp"}' "$1" | bash "$root/.cursor/hooks/guard-git.sh" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["permission"])'; }
verdict_codex() { local o rc; o=$(json '{"tool_name":"Bash","tool_input":{"command":"@CMD@"},"hook_event_name":"PreToolUse"}' "$1" | bash "$root/.codex/hooks/guard-git.sh" 2>/dev/null); rc=$?
  [ $rc -eq 2 ] && { echo deny; return; }
  printf '%s' "$o" | python3 -c 'import json,sys; s=sys.stdin.read(); print(json.loads(s)["hookSpecificOutput"]["permissionDecision"] if s.strip() else "allow")'; }
verdict_grok() { local o rc; o=$(json '{"toolName":"Bash","toolInput":{"command":"@CMD@"},"hookEventName":"PreToolUse"}' "$1" | bash "$root/.grok/hooks/guard-git.sh" 2>/dev/null); rc=$?
  [ $rc -eq 2 ] && { echo deny; return; }
  printf '%s' "$o" | python3 -c 'import json,sys; s=sys.stdin.read(); print(json.loads(s)["decision"] if s.strip() else "allow")'; }

check() { # 名前 期待 コマンド
  local got; got=$("verdict_$1" "$3")
  if [ "$got" = "$2" ]; then echo "PASS: guard-git[$1] $2 '$3'"; else echo "FAIL: guard-git[$1] 期待 $2, 実際 '$got' '$3'"; fail=1; fi
}
for t in common claude cursor codex grok; do
  for c in "${block_cmds[@]}"; do check "$t" deny "$c"; done
  for c in "${allow_cmds[@]}"; do check "$t" allow "$c"; done
done
# Grok: 他の入力形式
for j in '{"tool_input":{"command":"git push -f"}}' '{"command":"git push -f"}'; do
  r=$(printf '%s' "$j" | bash "$root/.grok/hooks/guard-git.sh" 2>/dev/null)
  case "$r" in *'"deny"'*) echo "PASS: guard-git[grok] 別形式 $j" ;; *) echo "FAIL: guard-git[grok] 別形式 $j"; fail=1 ;; esac
done
exit "$fail"
