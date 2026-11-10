# 0011 GCP / Firebase のリージョン

- 状態: 決定
- 日付: 2026-11-10（#31 の報告を前提メモに追記 06:05 JST）
- 決定者: @H4aruki（#31 でコンソールから設定）。選んだ理由の @H4aruki の言葉は記録に無い（未確認）
- 関連: #31、[0002](0002-tech-stack.md)

## 背景

- 利用者は日本（会場は Google 渋谷オフィス、Demo Day 11/27）。データの置き場所と応答の速さを考える必要がある。
- Firebase App Hosting のバックエンドを作れるリージョンは us-central1 / us-east4 / us-east5 / asia-east1（台湾）/ asia-southeast1（シンガポール）/ europe-west4 に限られ、東京（asia-northeast1）は選べない（Firebase 公式「App Hosting locations」、2026-11-10 に確認）。
- Firestore と Cloud Storage は asia-northeast1 を選べる。
- Vertex AI はアプリから `GOOGLE_CLOUD_LOCATION=global` で呼んでいる（apphosting.yaml）。

## 検討した選択肢

### 案A: データは asia-northeast1、App Hosting は asia-east1（採用）
- 利点: データは国内に置ける。App Hosting は選べる中で日本に近いアジアのリージョン。
- 欠点: サーバー（台湾）とデータ（東京）が分かれ、読み書きのたびに往復が増える。

### 案B: すべて asia-east1 にそろえる
- 利点: サーバーとデータの往復が短い。
- 欠点: データが国外になる。採らなかった理由の記録は無い（未確認）。

### 案C: すべて asia-northeast1 にそろえる
- 欠点: App Hosting が東京を提供していないので不可能。

## 決定

- **データ（Firestore・Storage）: asia-northeast1**
- **Firebase App Hosting: asia-east1**（バックエンド名 `devfest-4koma`、URL <https://devfest-4koma--project-bd07690e-65d2-4420-910.asia-east1.hosted.app>）

## 理由（判断基準）

1. App Hosting は東京を選べない（公式の一覧）。
2. @H4aruki がこの組み合わせを選んだ理由の言葉は未確認。推測で補わない。

## 却下した案と理由

| 案 | 理由 |
|---|---|
| すべて asia-northeast1 | App Hosting が東京を提供していない |
| すべて asia-east1 | 採らなかった理由は未確認 |

## 影響

- コード: なし（Firebase Admin SDK は ADC で接続）。
- 運用: ドキュメントと `apphosting.yaml`／Firebase 設定を一致させる。
- 費用: リージョン間の通信は発生する。金額への影響は未確認（ハッカソン規模では小さい見込み）。

## リスクと対策

| リスク | 対策 |
|---|---|
| サーバーとデータの往復で遅くなる | 遅延の実測は未実施。体感が悪ければ見直す |

## 未決事項・見直す条件

- App Hosting に asia-northeast1 が追加されたら、移すかを検討する。
- 応答が遅いという問題が出たら、データとサーバーのリージョンをそろえるか検討する。

## 出典

- 前提メモ追記 2026-11-10 06:05（#31: リージョン・バックエンド名・URL）
- Firebase「Understand App Hosting」App Hosting locations <https://firebase.google.com/docs/app-hosting/about-app-hosting>（2026-11-10 確認）
- `apphosting.yaml`
