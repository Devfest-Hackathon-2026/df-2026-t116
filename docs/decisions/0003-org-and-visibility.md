# 0003 Organization への移管と公開範囲

- 状態: 決定
- 日付: 2026-11-05（移管 13:30 JST ごろ、非公開維持の決定は前提メモ追記 15:41）
- 決定者: Haruki さん（Org 作成・非公開の選択・Maaa2005 の招待）。移管作業は Miso
- 関連: #3、PR #4（2026-11-05 16:15 JST マージ）、[0004](0004-main-guardrails.md)

## 背景

- 開発用リポジトリは最初、個人アカウント H4aruki の非公開リポジトリとして作った（2026-11-05 13:18 JST、Maaa2005 は write で招待）。
- チームメイト Maaa2005 に admin を付けようとすると GitHub が 422 を返した（"You can only give write access to user-owned repositories"）。個人所有のリポジトリでは協力者は write までしか持てない。
- Haruki さんは「対等な権限」を必要とした。
- 制約: 有料プラン（GitHub Pro / Team）には費用をかけない。締切前に作業中の内容を外に見せたくない。

## 検討した選択肢

### 案A: 無料 Organization に移し、非公開のまま（採用）
- 利点: Org Owner として対等な権限を渡せる。作業中の内容は見えない。費用ゼロ。
- 欠点: 無料 Org の非公開リポジトリでは branch protection が使えない（403 "Upgrade to GitHub Pro or make this repository public"）。Actions は月 2,000 分の上限。

### 案B: 無料 Organization に移し、公開にする
- 利点: branch protection が使え、Actions も無制限。
- 欠点: 締切前に作業中の内容と履歴が見える。

### 案C: H4aruki 配下のまま、Maaa2005 は write のみ
- 利点: 移管作業が要らない。個人の非公開リポジトリなら無料でも branch protection が使える。
- 欠点: 権限が対等でない。

### 案D: 有料の GitHub Pro / Team
- 利点: 非公開のまま branch protection が使える。
- 欠点: 費用がかかる（費用をかけない方針）。

## 決定

- 無料 Organization <https://github.com/akamiso-rangers> に移す（Haruki さんが Org を作成）。
- リポジトリ <https://github.com/akamiso-rangers/devfest-2026-t116> は非公開のまま。
- Maaa2005 は Haruki さんが Web から Org Owner として招待する（gh のトークンに `admin:org` が無いため）。招待は 2026-11-05 18:03 JST 時点で完了。

## 理由（判断基準）

1. **対等な権限**（最優先）: 案C では満たせない。
2. **作業中の内容を見せない**: 案B では満たせない。
3. **費用ゼロ**: 案D では満たせない。
4. Actions の分数は、非公開の無料枠（月 2,000 分）でハッカソンには足りる見込み（前提メモ追記 2026-11-05 15:41）。
5. 失う branch protection は hooks と CI で代わりに守る（[0004](0004-main-guardrails.md)）。

## 却下した案と理由

| 案 | 採らなかった理由 |
|---|---|
| H4aruki 配下のまま、Maaa2005 は write のみ | 対等でない |
| 公開にして branch protection と Actions の無制限を得る | 締切前に作業中の内容が見えてしまう。分数は無料枠で足りる見込み |
| 有料の GitHub Pro / Team | 費用をかけない方針 |

## 影響

- 運用: 無料 Org の非公開リポジトリでは GitHub の branch protection が使えない（403）。移管で、個人リポジトリ時代に設定した main の保護は消えた。保護は git hooks、AI ツールの hooks、CI のみ（[0004](0004-main-guardrails.md)）。
- 運用: Org のメンバー招待には `admin:org` が必要。現状の gh トークンは `read:org` のみなので、招待は人が Web で行う。
- 費用: Actions の分数に月 2,000 分の上限がある。

## リスクと対策

| リスク | 対策 |
|---|---|
| main が直接書き換えられる | hooks と CI で止める（[0004](0004-main-guardrails.md)） |
| Actions の分数を使い切る | CI を軽く保つ。使用量の実測は未確認 |

## 未決事項・見直す条件

- Actions の分数が足りなくなったら、公開化か CI の削減を Haruki さんが判断する。
- 提出後（締切後）の開発用リポジトリの扱い: 未決。

## 出典

- 前提メモ追記 2026-11-05 15:41（Org・非公開・hooks+CI）、2026-11-05 18:03（招待完了）
- 試行錯誤ログ 2026-11-05 13:18（リポジトリ作成）、13:30（移管・422・403）
- PR #4、Issue #3
