# 0002 技術スタック

- 状態: 決定
- 日付: 2026-11-10（コミット 1305f38 04:38 JST、PR #30 を 06:24 JST に main へマージ）
- 決定者: @H4aruki（案D の設計書 [design-d-4koma.md](../design-d-4koma.md) の採用、前提メモ追記 2026-11-10 04:15）。表の各要素の選定理由は設計書で AI が調べて起案
- 関連: #29、#30、#33、[0007](0007-adopt-idea-d.md)、[0010](0010-gcp-billing-guards.md)、[0011](0011-gcp-regions.md)、[0012](0012-generation-limits.md)

## 背景

- 11/5 時点ではアイデアもカテゴリも未決で、本 ADR は候補だけを並べた「未決」の状態だった（PR #2）。
- 11/10 に案D（物語の続きを付け合う漫画）の採用が決まり（[0007](0007-adopt-idea-d.md)）、スタックを確定する必要が出た。
- 制約:
  - 実行基盤は App Engine / Cloud Run / Compute Engine / Firebase App Hosting / GKE / Firebase Hosting のいずれか1つ以上が必須。メイン技術は Google 技術（前提メモ）。
  - 締切はコード 11/10 18:00 JST・凍結 19:00 JST。採用決定から締切まで約14時間しかない。
  - 漫画1ページ（4コマ分）の画像生成を1回の HTTP 要求の中で待つ。待てる時間は App Hosting 5分、Firebase Hosting 経由 1分、Cloud Run 既定5分・最大60分（設計書 6節の出典）。
  - Google のクレジットは AI Studio に使えず、Gemini は Vertex AI 経由（前提メモ追記 2026-11-04 21:45）。
  - 提出用リポジトリは公開なので、秘密情報をどこにも置かない構成が望ましい（[0001](0001-submission-transfer.md)）。
  - 有料サービスは課金上限（[docs/11](../11-gcp-deploy.md)、[0010](0010-gcp-billing-guards.md)）の内側で使う。

## 検討した選択肢

### 例A: Next.js を Cloud Run に直接置く + Firestore + Gemini
- 利点: 画面と API を 1 つにまとめられる。max-instances で上限を縛れる。時間切れを最大60分まで伸ばせる。
- 欠点: Dockerfile・ビルド・公開の手順が多く、初日の準備に時間がかかる。

### 例B: Firebase Hosting + Cloud Functions + Gemini
- 利点: 静的な画面配信と関数を分けて書ける。Firebase Auth を組み込みで使える。
- 欠点: Hosting を通る要求は1分で切れ、画像生成を待てない恐れがある。関数のコールドスタートとデプロイ単位に慣れが要る。

### 例C: Next.js を Firebase App Hosting + Firestore + Gemini（採用に近い）
- 利点: GitHub の main に接続するだけで公開まで自動化できる（公開まで約5分）。中身は Cloud Run なので大会条件を満たす。1回の要求を5分まで待てる。
- 欠点: App Hosting の設定（リージョン、スケール上限）を最初に確認する必要がある。選べるリージョンに東京が無い（[0011](0011-gcp-regions.md)）。

### AI の呼び方: Vertex AI + ADC か、Gemini Developer API（AI Studio の API キー）か
- Vertex + ADC: 利点＝鍵が要らない・大会クレジットが使える。欠点＝実行サービスアカウントの権限設定が要る。
- Developer API: 利点＝手順が少ない。欠点＝API キーの管理が要り、公開リポジトリへの混入リスクがある。クレジットが使えない。

## 決定

**Next.js を Firebase App Hosting に置き、Firestore・Cloud Storage for Firebase・Vertex AI を使う。**（候補の例C）

| 役割 | 使うもの |
|---|---|
| 画面とサーバー | Next.js（App Router）を Firebase App Hosting。中身は Cloud Run |
| ログイン | Firebase Auth（Google ログイン） |
| データ | Firestore（画面からは直接読み書きしない。全部サーバー経由） |
| 画像 | Cloud Storage for Firebase（サーバー経由で返す） |
| 文章のAI | Gemini 3.8 Flash（`gemini-3.8-flash`、Vertex AI） |
| 画像のAI | Nano Banana 2.1（`gemini-nano-banana-2.1`、Vertex AI） |
| 認証 | 実行サービスアカウント＋ADC。APIキーと鍵ファイルは使わない |

## 理由（判断基準）

1. **生成を待てる時間**: 1ページの生成を1回の要求の中で待つ。App Hosting は5分まで待てる（Firebase Hosting は1分）。打ち切りは120秒で、その内側に収まる（[0012](0012-generation-limits.md)）。
2. **締切まで1日**: GitHub につなぐだけで公開でき、画面とサーバーが1つで済む。
3. **秘密情報を持たない**: Vertex を ADC で呼べば、秘密情報をどこにも置かずに済む（提出用のリポは公開）。
4. **クレジットが使える**: AI Studio にはクレジットが使えないので Vertex 経由にする。
5. **ログイン**: 匿名ログインは同じ回線から作れる数に上限があり、会場の Wi-Fi で止まる恐れがあるので Google ログインにした（設計書 4節）。
6. **画像の置き場**: 1枚1MB前後で Firestore の1件1MBの上限に入らないため Storage に置く（設計書 4節）。

## 却下した案と理由

| 案 | 採らなかった理由 |
|---|---|
| 例A: Next.js を Cloud Run に直接置く | Dockerfile・ビルド・公開の手順が App Hosting より多い。得る物（時間切れ60分まで）は今回要らない |
| 例B: Firebase Hosting ＋ Cloud Functions | Hosting を通る要求は1分で切れ、画像の生成を待てない恐れがある |
| Gemini API（AI Studio の APIキー） | 鍵の管理が要る。クレジットが使えない。Vertex なら ADC で鍵が要らない |
| 匿名ログイン | 同じ回線からの作成数に上限があり会場で止まる恐れ |

## 影響

- コード: リポの直下に Next.js（src/・public/・package.json）、apphosting.yaml、firebase.json、firestore.rules、storage.rules。Next は App Hosting の公式対応表に合わせて 15 系に固定（package.json のコメント）。
- API・データ: 書き込みは全部サーバー（Admin SDK）から。Firestore の規則は「読むのは誰でも・書くのは禁止」（設計書 5節）。
- デプロイ: Firebase App Hosting（`maxInstances: 3`・`minInstances: 0`）。main へのマージごとに自動で公開される。
- 費用: 課金の上限は [docs/11](../11-gcp-deploy.md) と [0010](0010-gcp-billing-guards.md)（予算¥3,000・各 spend cap ¥1,000）。生成の回数は 1人1日10回・全体1日120回（[0012](0012-generation-limits.md)）。
- 秘密情報: 今は無し（Vertex は ADC）。画面用の Firebase の設定値は公開前提の識別子なので秘密情報として扱わない（[docs/12](../12-secrets.md)）。

## リスクと対策

| リスク | 対策 |
|---|---|
| App Hosting の東京リージョンが無く遅延が増える | データは asia-northeast1、App Hosting は asia-east1 に分けて受け入れる（[0011](0011-gcp-regions.md)） |
| 生成が5分を超える | 120秒で打ち切り、失敗として作り直せるようにする（[0012](0012-generation-limits.md)） |
| モデル ID が実機と違う | #22 で Vertex 上のモデル ID を実機確認する |
| 依存の版が App Hosting の対応から外れる | Next を 15 系に固定 |

## 未決事項・見直す条件

- 画像の AI の1分・1日のクォータ上限は公式に数字が無く未確認（設計書 9節）。
- Demo Day（11/27）以降も動かすか、どの時点で止めるかは未決。
- 生成待ちが5分を超えるようになったら、非同期処理（Cloud Run 直置きや別ジョブ）を再検討する。

## 出典

- [design-d-4koma.md](../design-d-4koma.md) 4節・6節・7節と出典節（App Hosting 5分・Hosting 1分・Cloud Run 既定5分/最大60分、匿名ログインの上限）
- 前提メモ（実行基盤の条件）、前提メモ追記 2026-11-04 21:45（AI Studio 不可）、2026-11-10 04:15（案D採用・Vertex+ADC）
- PR #2（未決の版）、PR #30（決定の版）、コミット 1305f38
