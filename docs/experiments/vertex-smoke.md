# Vertex AI 実機確認（Issue #22）

2026-11-10 JST に、設計書（[design-d-4koma.md](../design-d-4koma.md)）が決めたモデルを Vertex AI で実際に呼んで確かめた記録。

## 目的

- 設計書 3・4 節のモデル ID（`gemini-3.8-flash` / `gemini-nano-banana-2.1`）が Vertex AI（location `global`）で通るか。
- 画像の縦横比（2:3）と、候補の 1:4 が使えるか。
- 待ち時間と、連続で呼んだときの回数制限（429）の様子。

## 手順

前提: gcloud でユーザー認証した application default credentials（ADC）。API キーは使わない。

```
GOOGLE_CLOUD_PROJECT=<project> node tools/smoke-vertex.mjs
```

- `tools/smoke-vertex.mjs` は、アプリと同じ指示文と config で、文章 1 回と画像 1 回（設定画 `mikan.png` を参照 1 枚、前段の絵の指示つき、aspectRatio 2:3・imageSize 1K）を呼ぶ。
- `<project>` には自分のプロジェクト ID を入れる（この doc には書かない）。
- 1:4 の確認は、使い捨てのスクリプトで aspectRatio だけ変えて呼んだ。リポジトリには入れていない。
- 環境: `@google/genai` 3.0.0（Vertex モード）。

## 結果

| # | 対象 | モデル / location | 設定 | 時刻 (JST) | 所要 | 結果 |
|---|---|---|---|---|---|---|
| 1 | 文章 | `gemini-3.8-flash` / `global` | JSON スキーマ応答 | 16:09 | 5.5 秒 | 成功。`ok=true`、panels 4 |
| 2 | 画像 | `gemini-nano-banana-2.1` / `global` | 参照 1 枚、2:3、1K | （未記録） | 21.0 秒 | 成功。PNG 848x1264（約 2:3） |
| 3 | 画像 | 同上 | 参照 1 枚、1:4、1K | 16:10 | 0.5 秒 | 失敗。429 RESOURCE_EXHAUSTED |
| 4 | 画像 | 同上 | 参照 1 枚、1:4、1K | 16:15 | 18.2 秒 | 成功。PNG 512x2064（1:4.03） |

参考: 同じ時間帯に、別 Issue（#38）の試しを 2:3 で直列に 10 回回した。成功 5 回（20.6〜44.1 秒）、429 が 5 回。#3 の 429 は、この試しと同時刻に起きた。

## 結論

- モデル ID は設計書どおりで、そのまま使える。
- 画像の 1:4 も使えた。ただし本番は **2:3 のまま**にする。理由: 横長のコマ 4 つを縦に積む作りで、スマホで読める幅を保てるため。#38 の試しでも、2:3 で 4 コマが崩れなかった。
- 画像は 18〜44 秒かかった。設計書の打ち切り（120 秒、[0012](../decisions/0012-generation-limits.md)）の範囲内。
- 連続で呼ぶと 429 が出る。再試行と待ちを前提にする。
- 費用の概算: 画像 3 回（2:3 が 1 回、1:4 が 1 回、429 は課金なしと見込む）＋文章 1 回で、約 15〜16 円。設計書 7 節の仮定（1 枚 0.034 ドル、1 ドル 150 円）で計算した。請求画面では見ていない。

## API キーを使っていないことの確認

- `tools/_vertex.mjs` は `new GoogleGenAI({ vertexai: true, project, location })` で作る。`apiKey` の指定は無い（`grep apiKey tools/` で該当なし）。
- 認証は ADC。サービスアカウントの鍵ファイルも使っていない。

## 未確認

- クォータ: `gcloud alpha services quota list --service=aiplatform.googleapis.com` に、`gemini-nano-banana-2.1`・`gemini-3.8-flash` を名指しした 1 分・1 日の回数の行は無かった。共有の動的な枠と見られるが、**未確認**。コンソールのクォータ画面は見ていない。
- 429 が出る条件（1 分あたりの回数か、同時実行か、共有枠の混み具合か）は分かっていない。
- 本番のサービスアカウントでの呼び出しは、この確認の範囲外（ここで使ったのは開発者の ADC）。
