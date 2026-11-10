# 0016 アプリの見た目を Liquid Glass 風にする

- 状態: 決定
- 日付: 2026-11-10（12:15 JST）
- 決定者: @H4aruki（方向性: Apple のアプリのような、リキッドグラスと影の使い方）。具体的な値と範囲は Miso（@H4aruki の AI）が起案
- 関連: Issue #72、PR（この ADR を足した PR）、#67（設定画の確認と描き直し）、Issue #82（主ボタンの朱色のコントラスト）

## 背景
- @H4aruki の指示（2026-11-10）: アプリのデザインも作り込む。X で保存・いいねしてあるスキル（AI 向けの手順書）を使って改良する。方向性は Apple のアプリのような、リキッドグラスと影の使い方。
- 制約: 当日 18:00 JST コード停止、PR は 14:00 JST まで。審査とデモはスマホの可能性がある。漫画（4コマ）の絵が主役。
- #67 が `globals.css` の末尾と `ThemeClient.tsx`・`NewThemeForm.tsx` を触っていて、今日入る予定。

## 検討した選択肢
### 案A: ガラスはナビゲーション層だけ、コンテンツは不透明な面＋多層の影（採用）
- 利点: Apple の指針どおり（WWDC25「Meet Liquid Glass」: ガラスはコンテンツの上に浮かぶナビゲーション層に限る、glass on glass を避ける）。絵の邪魔をしない。backdrop-filter が数か所で済み、スマホでも軽い。
- 欠点: 「全部ガラス」より派手さは控えめ。
### 案B: カードや一覧もすべてガラス
- 欠点: 指針に反し、階層が濁る。カードごとの backdrop-filter はスクロールで重い。絵の上の半透明は読みにくい。
### 案C: SVG フィルタで屈折まで再現
- 欠点: backdrop-filter の url() は Chromium でしか描かれず、@supports でも判定できない。Safari（iPhone）では効かない。

## 決定
- トークン（`:root`）: 下地 `--canvas #f2f2f7`、文字 `--ink #1d1d1f`／`--sub rgba(60,60,67,.72)`、角丸 `--radius-s 10px`・`--radius 14px`・`--radius-l 22px`・`--radius-pill`、影 3 段 `--shadow-1/2/3`、ガラス `--glass-bg rgba(255,255,255,.62)`＋`blur(24px) saturate(180%)`＋明るい細枠＋上の inset ハイライト、暗いガラス `--glass-dark-*`、動き `--ease-spring`・`--dur 220ms`。
- ガラスを使う所: 上の帯、浮いたカプセル型の下タブ、読む画面の上下のバー（暗いガラス）、シートの幕、評価画面の丸い操作ボタン（絵の上に浮く操作）。
- ガラスにしない所: カード、一覧、フォームのまとまり、漫画の絵。白の面＋`--shadow-1/2`。
- 朱色 `--accent #c43c18`（#82 で `#f2542d` から変更）は塗りのボタン・選択中・枠。白文字との比 5.24:1。白地の小さな朱色の文字は `--accent-ink #c43c18`（白地 5.2:1）で、いまは `--accent` と同じ色。旧 `#f2542d` は白と 3.45:1 で 4.5:1 に届かなかった。
- 読みやすさ・設定: backdrop-filter 非対応 → ほぼ不透明。`prefers-reduced-transparency: reduce` → 不透明・ぼかし無し。`prefers-contrast: more` → 不透明＋濃い枠。`prefers-reduced-motion` は既存ブロックのまま。
- 範囲: `src/app/globals.css` と `layout.tsx`（themeColor）だけ。API・データ・生成・TSX には触らない。

レビュー第1回で直したのは3件だけである。スマホ幅の募集欄では、2つのボタンがカードの中で折り返す。入力欄のフォーカス輪郭は透明な実線で、通常は枠の色と淡い影のままであり、強制カラーモードでも輪郭が残る。この決定で書いた「透明度を下げる設定ではぼかし無し」は、幕のセレクタが後から書いた同じ強さの `blur(6px)` に負けて効いていなかった。セレクタを `:root .sheet-backdrop` に上げ、コントラストを上げる設定にも同じ指定を足した。その設定では幕のぼかしが外れる。幕の色は変えていない。レビュー第2回では、読む画面の空コマ「（なし）」の色だけを `#999` にした。

## 理由（判断基準）
1. 絵が主役（ガラスで絵を邪魔しない）、2. Apple の一次情報に沿う、3. スマホでの性能と読みやすさ、4. 締切と #67 との衝突の少なさ。案A だけが 4 つを満たす。

## 却下した案と理由
| 案 | 採らなかった理由 |
|---|---|
| 全部ガラス（案B） | Apple の指針に反する。重い。絵と文字が読みにくい |
| SVG 屈折（案C） | Safari で効かず判定もできない。重い |
| ダークモード | 依頼の範囲外。締切まで時間がない |
| Web フォント（SF Pro 等）の読み込み | SF Pro は Apple 端末の外で使えない。system-ui で Apple 端末では SF/ヒラギノになる |
| MotionSites スキル（@H4aruki のブクマ） | 中身が動画だけで、入手条件（有料か）を確認できなかった |

## 影響
- コード: `globals.css` の値の変更とトークンの追加。クラス名は変えていない。`.glass` は共通の部品として追加したが、使われていなかったため削除した。
- API・データ: なし。
- 運用: #67 は末尾に追記しているだけなので、`globals.css` の末尾（「動きを減らす設定」以降）は変えていない。#67 の新しい部品は `--radius` などのトークン経由で新しい見た目に寄る。
- 費用: なし（生成を走らせていない）。

## リスクと対策
| リスク | 対策 |
|---|---|
| 古い Android で backdrop-filter が重い | ガラスは 5 か所だけ。カードには付けない |
| Safari は prefers-reduced-transparency 未対応 | 既定の状態（.62 の白＋ぼかし）だけで文字が読めるようにした |
| 浮いたタブが本文や固定ボタンにかぶる | `--bottom` にタブの上下の余白を足した。スクショで確認 |
| 主ボタンの白文字（朱色の上）のコントラスト | 以前の記述「3.45:1・太字 16px」は誤り。実際は 15px・font-weight 600・白 18% のグラデーション付きで、塗り 3.45:1、上端 `#f47353` で 2.83:1 だった。#82 で `--accent` を `#c43c18` にし、グラデーションを白 6% に弱めた。いまは塗り 5.24:1、上端 `#c84826` で 4.76:1（AA 4.5:1 以上）。測定: WCAG 2 の相対輝度 |

## 追加の決定（#82 主ボタンの朱色）
- 決定者: @H4aruki。日付: 2026-11-10 14:58 JST。
- 検討した案: A 朱色を少し濃くする（`#c43c18`）／B 朱色はそのまま、ボタンの文字を太く大きくしグラデーションの白を外す／C 今のまま。
- 採用: A。`--accent` を `#c43c18` にし、`.btn` のグラデーションを白 18% から 6% に弱め、影の色も `rgba(196, 60, 24, 0.28)` に合わせた。
- 採らなかった理由: B は見た目はほぼ今のままだが、通常サイズの文字では 4.5:1 に届かない（@H4aruki が A を選んだ）。C は上端 約 2.83:1、塗り 3.45:1 のままで AA 未達。
- 影響: 朱色の塗り・枠・outline・一部の文字（いいねの丸ボタンなど）が少し濃くなる。`--accent-soft` との比は 4.54:1。

## 未決事項・見直す条件
- 実機（iPhone Safari）での見え方は未確認。デモ前に一度見る。

## 出典
- @H4aruki の依頼（2026-11-10）。調査メモ（AI エージェントの作業環境、リポには入れない）
- WWDC25 Meet Liquid Glass https://developer.apple.com/videos/play/wwdc2025/219/
- HIG Materials https://developer.apple.com/design/human-interface-guidelines/materials
- WWDC25 Design Group Lab まとめ https://developer.apple.com/forums/topics/design-topic
- フォールバックと読みやすさ https://github.com/TurtIeSocks/agent-skills/blob/main/liquid-glass-css/references/fallbacks-a11y.md 、 https://rohullah.me/blog/glassmorphism-done-right
- SVG 屈折の対応状況 https://qodesign.dev/blog/liquid-glass-react-tailwind-browser-support
- prefers-reduced-transparency https://developer.chrome.com/blog/css-prefers-reduced-transparency
