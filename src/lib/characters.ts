// 用意したキャラ（固定の4体）。すべてオリジナル。実在の人や他作品に似せない。
// 設定画は public/characters/{id}.png に置く（tools/make-character-sheets.mjs で作る）。
// 見た目の文は画像のAIへの指示にそのまま使う。顔・髪型と髪の色・服と色・体型・目立つ持ち物を具体的に書く。
// 左右（どちらの手か・どちら側か）は守られにくいので書かない。
// このファイルは tools/ から Node で直接読むので、値の import を足さない（型の import だけにする）。
import type { ImageData } from "./images/types";

export interface Character {
  id: string;
  name: string;
  /** 見た目の文。顔・髪・服・色を具体的に書く（画像のAIへの指示に使う）。 */
  appearance: string;
  /** 設定画のパス（public からの URL パス）。パーツで作ったキャラは無い */
  sheetPath?: string;
  /** 設定画の画像そのもの（パーツで作ったキャラの確定した設定画。あれば sheetPath より先に参照画像に使う） */
  sheetImage?: ImageData;
}

/** 既定の画風。設定画の指示に使い、作品の絵柄（artStyles.ts）が無い時はページの指示にも使う。artStyles.ts の standard と同じ文 */
export const ART_STYLE = "明るいカラーの日本の漫画風・太めの線";

export const CHARACTERS: readonly Character[] = [
  {
    id: "mikan",
    name: "ミカン",
    appearance:
      "人間の高校2年の女の子。小柄で細め。丸い顔に大きなたれ目（明るい茶色）、頬に薄いそばかす。オレンジ色の肩までのボブで、前髪を黄色い星形のヘアピン1本で留めている。紺のブレザーの制服に赤いリボン、紺と緑のチェックのスカート、白い靴下に茶色のローファー。背中に黄色いリュック。",
    sheetPath: "/characters/mikan.png",
  },
  {
    id: "tetsu",
    name: "テツ",
    appearance:
      "人間の高校2年の男の子。背が高く肩幅が広い。四角い輪郭に細いつり目と太い眉。黒髪の短い角刈り。紺の学ランの前を開け、中に赤いTシャツ。黒いズボンに白いスニーカー。首に銀色のホイッスルを下げ、緑のスポーツバッグを肩に掛けている。",
    sheetPath: "/characters/tetsu.png",
  },
  {
    id: "kinako",
    name: "キナコ",
    appearance:
      "人の言葉をしゃべる猫。四本足で歩く、ふっくら丸い体の小さな猫。毛はきなこ色（薄い黄土色）で、額に茶色のしま模様が3本。大きな緑の丸い目、ピンクの鼻、太く短いしっぽ。首に水色の首輪と金色の鈴。服は着ていない。",
    sheetPath: "/characters/kinako.png",
  },
  {
    id: "hakase",
    name: "ハカセ",
    appearance:
      "自分を博士だと思っている小さなロボット。高さは猫と同じくらい。白い四角い頭に、丸く光る水色の目が2つと、口の代わりの横長の黒い画面。頭のてっぺんに先が赤い玉のアンテナ1本。丸い胴は白で、胸に青いボタンが3つ。腕と脚は灰色の細い蛇腹。小さな丸い眼鏡と、短い白衣を着ている。",
    sheetPath: "/characters/hakase.png",
  },
];

export function findCharacter(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
