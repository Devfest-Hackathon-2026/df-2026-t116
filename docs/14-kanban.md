# 14 看板の使い方（着手の宣言と Done）

ルールの本体は [AGENTS.md](../AGENTS.md)「着手の前に看板を見る」、決定の経緯は [0015](decisions/0015-kanban-claim-rule.md)。ここには `gh` で動かすためのコマンドと固定値だけを置く。

- 看板: <https://github.com/orgs/akamiso-rangers/projects/1>（DevFest 2026 t116 Roadmap (案D)、プロジェクト番号 1）
- 欄: Status（Todo／In Progress／Blocked(人待ち)／In Review／Done）・Owner（ai／human）・Phase（P0〜P6）・Assignees

## 0. 準備（1回だけ）

看板を動かすには `gh` のトークンに `project` 権限が要る。

```sh
gh auth status                    # Token scopes に 'project' と 'read:org' があるか
gh auth refresh -s project,read:org   # 無ければ。ブラウザでの承認が要るので人が操作する
```

## 固定値（2026-11-10 時点）

秘密情報ではない（看板と欄の ID）。変わったら `gh project field-list 1 --owner akamiso-rangers --format json` で取り直してここを直す。

```sh
OWNER=akamiso-rangers
REPO=$OWNER/devfest-2026-t116
PROJECT_ID=PVT_kwDOFQZ0hc4Bq5Uy
STATUS_FIELD=PVTSSF_lADOFQZ0hc4Bq5UyzhpOY0I
TODO=5e0113da; IN_PROGRESS=93507968; BLOCKED=19bbaacb; IN_REVIEW=8517af4f; DONE=47a051d4
OWNER_FIELD=PVTSSF_lADOFQZ0hc4Bq5UyzhpOZCo
OWNER_HUMAN=e9573c29; OWNER_AI=6fb42465
```

## 1. 着手の前に確かめる

```sh
N=58   # Issue 番号
gh issue view $N -R $REPO --json state,assignees --jq '{state, assignees:[.assignees[].login]}'
gh project item-list 1 --owner $OWNER -L 300 --format json \
  --jq ".items[]|select(.content.number==$N)|{status, assignees, owner}"
```

自分以外が Assignee で In Progress なら触らない。何も出なければ看板に無い（次の手順で足す）。

## 2. 自分のものにする

```sh
ME=$(gh api user --jq .login)
gh issue edit $N -R $REPO --add-assignee $ME
# 看板に無ければ足す。既にあればその項目の id が返る
ITEM=$(gh project item-add 1 --owner $OWNER --url https://github.com/$REPO/issues/$N --format json --jq .id)
gh project item-edit --project-id $PROJECT_ID --id $ITEM --field-id $STATUS_FIELD --single-select-option-id $IN_PROGRESS
gh project item-edit --project-id $PROJECT_ID --id $ITEM --field-id $OWNER_FIELD  --single-select-option-id $OWNER_AI   # 人が手で作業するなら $OWNER_HUMAN
```

## 3. 着手を宣言する

```sh
gh issue comment $N -R $REPO --body "【着手】中村さんの Claude Code／ブランチ feat/$N-xxx／終了見込み 14:00 JST"
```

## 4. PR を看板に足す

```sh
PR=70
PITEM=$(gh project item-add 1 --owner $OWNER --url https://github.com/$REPO/pull/$PR --format json --jq .id)
gh project item-edit --project-id $PROJECT_ID --id $PITEM --field-id $STATUS_FIELD --single-select-option-id $IN_PROGRESS   # レビュー待ちなら $IN_REVIEW
gh pr edit $PR -R $REPO --add-assignee $ME
```

## 5. 終わったら Done、やめたら外す

```sh
# マージで閉じたら（Issue・PR の両方）
gh project item-edit --project-id $PROJECT_ID --id $ITEM --field-id $STATUS_FIELD --single-select-option-id $DONE

# 途中でやめる・人待ちになる
gh issue edit $N -R $REPO --remove-assignee $ME
gh project item-edit --project-id $PROJECT_ID --id $ITEM --field-id $STATUS_FIELD --single-select-option-id $TODO   # 人待ちは $BLOCKED
gh issue comment $N -R $REPO --body "【中断】理由…／ここまで…／ブランチ …"
```

## 6. 引き取り（3時間反応が無いとき）

In Progress のまま3時間反応が無ければ、本人に一声かけてから引き取ってよい（Issue のコメントか、チームのチャット）。引き取ったら:

```sh
gh issue edit $N -R $REPO --remove-assignee <前の人> --add-assignee $ME
gh issue comment $N -R $REPO --body "【着手】（引き取り）<誰のAIか>／ブランチ …／終了見込み …"
```

## 注意

- `gh project item-add`／`item-edit` は1回数秒かかる（2026-11-10 実測で30件約4.5分）。まとめて直すときは時間を見込む。
- 看板の自動化（閉じたら Done 等）は未確認。閉じたら手で Done にする。
