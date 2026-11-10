# ドキュメントのマップ

まずここだけ読め。必要なファイルだけ開く。

**この MAP 以外を最初から全部読まない。**

| パス | いつ読むか | 1行の内容 | 長さ |
|---|---|---|---|
| [AGENTS.md](../AGENTS.md) | 作業を始めるとき、PR を出すとき | Claude / Codex / Grok / Cursor 共通のルール本体。セキュリティ、PR、どの AI でも共通の守り | 短い |
| [README.md](../README.md) | リポジトリを初めて触るとき・審査員が最初に読む | アプリの説明、試し方、審査基準との対応、構成図、Google 技術。開発ルールはリンクだけ | 長い |
| [00-start-here.md](00-start-here.md) | アイデアが決まった直後 | アイデア決定後の最初の 30 分の手順 | 短い |
| [09 コミットとブランチの規約](09-コミットとブランチの規約.md) | コミットやブランチを作るとき | Conventional Commits とブランチ名の決まり | 中 |
| [10 CI とフックの仕組み](10-CIとフックの仕組み.md) | フックで止まったとき、CI を直すとき | ローカルフック（各 AI ツールの hooks を含む）と GitHub Actions の説明 | 長い |
| [11 GCP デプロイ手順](11-gcp-deploy.md) | デプロイするとき | 課金ガードレールを先に設定してから Cloud Run / Firebase に出す手順 | 長い |
| [12 秘密情報の扱い](12-secrets.md) | 鍵、トークン、`.env` を扱うとき | Secret Manager と `.env` の使い分け | 中 |
| [13 デモと提出](13-demo-and-submission.md) | 提出直前 | 11/10 の提出チェックリスト（Drive の共有設定など） | 中 |
| [アイデア出しチェックリスト](ideation-checklist.md) | アイデア出し中 | 審査員・メンター視点で、アイデアを確かめる項目 | 中 |
| [アイデアシートのテンプレート](ideation-sheet-template.md) | アイデア出し中 | 目的、カテゴリ、作品案を書き込む記入用シート | 長い |
| [案D アイデアシート](ideation-sheet-d-4koma.md) | 案Dを詰めるとき | お題に続きを付け合う4コマ案を、テンプレートで埋めた下書き | 長い |
| [案D 設計書](design-d-4koma.md) | 案D（採用）を実装するとき | 生成・上限・作業順。**開始フロー・キャラは serial が正** | 長い |
| [案D 設計書（2）連載の形](design-d-serial.md) | 連載・スワイプ・漫画UI・作品の始め方 | 決めた事・画面・入口。**始め方はここが正（4komaより優先）** | 中 |
| [14 看板の使い方](14-kanban.md) | Issue に着手する前・終えたとき | 着手の宣言と Done の gh コマンド、看板の欄の ID（固定値） | 中 |
| [案D ロードマップ（看板）](https://github.com/orgs/akamiso-rangers/projects/1) | 実装の進捗を見るとき | GitHub Projects 看板（Status / Owner / Phase）。人間専用は #31→#50。Issue 一覧は label:roadmap でも可 | 短い |
| [decisions/README.md](decisions/README.md) | 判断記録（ADR）を書く・読むとき | ADR の書き方（なるべく詳しく、PR 本文にも書く）とテンプレート（背景・選択肢・決定・理由・却下案・影響・リスク・未決・出典）と一覧 | 中 |
| [0001 提出用リポジトリへの移し方](decisions/0001-submission-transfer.md) | 提出直前 | 最終版だけを履歴なしで提出用リポジトリへ移す決定 | 長い |
| [0002 技術スタック](decisions/0002-tech-stack.md) | アイデア決定後 | Next.js + Firebase App Hosting + Firestore + Vertex AI（ADC）に決めた理由と却下案 | 長い |
| [0003 Organization への移管と公開範囲](decisions/0003-org-and-visibility.md) | 権限や公開範囲を確認するとき | 個人リポジトリから Organization へ移した理由と公開範囲 | 長い |
| [0004 main を守る仕組み](decisions/0004-main-guardrails.md) | main への push を考えるとき | branch protection が使えない中で main を守る方法の決定 | 長い |
| [0005 作品の始め方とキャラ](decisions/0005-start-flow.md) | 開始画面・キャラ・設定画を実装するとき | パーツ選択＋短文、設定画確認・描き直し2回、例4体 | 長い |
| [0006 生成費用の守り方](decisions/0006-generation-cost.md) | 回数・単価・cap を触るとき | cap据え置き、キャッシュ等で枚数確保、月140〜150枚目安 | 長い |
| [0007 案Dの採用](decisions/0007-adopt-idea-d.md) | プロダクト方針を確認するとき | 案Aから案Dへ切替 | 長い |
| [0008 連載形式](decisions/0008-serial-format.md) | 連載・スワイプを実装するとき | 1話4ページ・スワイプ評価・漫画アプリUI | 長い |
| [0009 話は人・AIは絵](decisions/0009-human-story-ai-art.md) | 生成プロンプトを変えるとき | セリフと軸は人、AIは絵とチェック | 長い |
| [0010 GCP課金ガード](decisions/0010-gcp-billing-guards.md) | 予算・spend cap を確認するとき | カード請求なし、cap と kill switch | 長い |
| [0011 リージョン](decisions/0011-gcp-regions.md) | Firebase/GCP リージョンを触るとき | データ asia-northeast1、App Hosting asia-east1 | 長い |
| [0012 生成の打ち切りと回数](decisions/0012-generation-limits.md) | タイムアウトや回数を変えるとき | 120秒、1人10・全体120 | 長い |
| [0013 チーム共有ルール](decisions/0013-team-sharing.md) | Discord や docs 共有するとき | GitHub基本、秘密だけDiscordテキスト、投稿前確認 | 長い |
| [0014 開発の進め方](decisions/0014-dev-workflow.md) | 誰が何をするか確認するとき | Haruki→Miso→Claude/Codex→PR | 長い |
| [0015 看板での着手の宣言](decisions/0015-kanban-claim-rule.md) | Issue に着手する前 | 着手前に看板を確認・Assignee＋In Progress・【着手】コメント・3時間＋一声で引き取り | 長い |
| [0016 見た目（Liquid Glass 風）](decisions/0016-liquid-glass-ui.md) | 画面の色・影・ガラスを触るとき | ガラスはナビ層だけ、カードは白＋多層の影 | 長い |
| [0017 README を審査員向けに](decisions/0017-readme-for-judges.md) | README を直すとき | 審査項目の順の節、主張ごとにコード・ADR、仮の画像を作らない | 中 |
| [Vertex 実機確認](experiments/vertex-smoke.md) | モデル ID・縦横比・回数制限を確かめるとき | 2026-11-10 の Vertex AI 実測（文章・画像 2:3 と 1:4・429）、API キー不使用の確認、未確認のクォータ | 短い |

## 読む順（場面別）

- **アイデア出し中** → [ideation-checklist](ideation-checklist.md) と [ideation-sheet-template](ideation-sheet-template.md) だけ
- **アイデア決定直後** → [00-start-here](00-start-here.md) だけ、次に [decisions/0002](decisions/0002-tech-stack.md)
- **実装・PR** → [AGENTS.md](../AGENTS.md) + [14 看板](14-kanban.md) + [09](09-コミットとブランチの規約.md) + [10](10-CIとフックの仕組み.md)
- **案D実装の進捗** → [看板](https://github.com/orgs/akamiso-rangers/projects/1)（Status列）＋ [roadmap Issues](https://github.com/akamiso-rangers/devfest-2026-t116/issues?q=is%3Aissue+label%3Aroadmap)（先に人間専用 #31）
- **デプロイ** → [11](11-gcp-deploy.md) + [12](12-secrets.md)
- **提出直前** → [13](13-demo-and-submission.md) + [decisions/0001](decisions/0001-submission-transfer.md)
- **方針を知る** → [decisions/README](decisions/README.md) + 関係する ADR（製品は 0007–0009、開始は 0005、費用は 0006/0010/0012）

新しい doc を足したらこの表にも1行足す。
