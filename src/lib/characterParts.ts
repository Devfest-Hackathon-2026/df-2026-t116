// キャラを作るときの「大きなパーツ」の選択肢（docs/design-d-serial.md「決めた事（11/10 Haruki・開始フロー）」・ADR 0005）。
// すべて一般的な語。実在の作品・人物・ブランドを想起させる語は入れない。
// prompt は画像のAIへの指示文の断片。characters.ts の appearance と同じ書き方にそろえ、左右（どちらの手か・どちら側か）は書かない。

export interface PartOption {
  id: string;
  /** 画面に出す名前 */
  label: string;
  /** 画像のAIへの指示文の断片 */
  prompt: string;
}

export const PART_KINDS = ["hairStyle", "hairColor", "body", "outfit", "outfitColor", "age", "species"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** 種類ごとに選んだ選択肢の id */
export type CharacterParts = Record<PartKind, string>;

/** 画面に出す種類の名前 */
export const PART_KIND_LABELS: Record<PartKind, string> = {
  hairStyle: "髪型",
  hairColor: "髪色",
  body: "体型",
  outfit: "服の種類",
  outfitColor: "服の色",
  age: "年齢の印象",
  species: "種族",
};

export const PART_OPTIONS: Record<PartKind, readonly PartOption[]> = {
  hairStyle: [
    { id: "short", label: "ショート", prompt: "短く整えた髪" },
    { id: "bob", label: "ボブ", prompt: "肩までのボブの髪" },
    { id: "long", label: "ロング", prompt: "背中まである長い髪" },
    { id: "ponytail", label: "ポニーテール", prompt: "後ろで1つに束ねたポニーテール" },
    { id: "twintail", label: "ツインテール", prompt: "高い位置で2つに結んだツインテール" },
    { id: "curly", label: "くせ毛", prompt: "ふわふわとはねたくせ毛" },
    { id: "buzz", label: "坊主", prompt: "とても短い坊主頭" },
  ],
  hairColor: [
    { id: "black", label: "黒", prompt: "黒" },
    { id: "brown", label: "茶", prompt: "茶色" },
    { id: "blonde", label: "金", prompt: "金色" },
    { id: "red", label: "赤", prompt: "赤" },
    { id: "blue", label: "青", prompt: "青" },
    { id: "silver", label: "銀", prompt: "銀色" },
    { id: "pink", label: "ピンク", prompt: "ピンク" },
  ],
  body: [
    { id: "small", label: "小柄", prompt: "小柄で細め" },
    { id: "average", label: "ふつう", prompt: "ふつうの背丈と体格" },
    { id: "tall", label: "背が高い", prompt: "背が高くすらりとしている" },
    { id: "sturdy", label: "がっしり", prompt: "肩幅が広くがっしりした体格" },
    { id: "plump", label: "ふっくら", prompt: "丸くふっくらした体つき" },
    { id: "tiny", label: "とても小さい", prompt: "とても小さな体" },
  ],
  outfit: [
    { id: "uniform", label: "制服", prompt: "ブレザーの制服" },
    { id: "casual", label: "Tシャツとズボン", prompt: "Tシャツと長いズボン" },
    { id: "hoodie", label: "パーカー", prompt: "フード付きのパーカーとズボン" },
    { id: "dress", label: "ワンピース", prompt: "ひざ丈のワンピース" },
    { id: "kimono", label: "和服", prompt: "帯を締めた和服" },
    { id: "labcoat", label: "白衣", prompt: "ひざ丈の白衣" },
    { id: "overall", label: "つなぎ", prompt: "作業用のつなぎ" },
  ],
  outfitColor: [
    { id: "white", label: "白", prompt: "白" },
    { id: "black", label: "黒", prompt: "黒" },
    { id: "red", label: "赤", prompt: "赤" },
    { id: "blue", label: "青", prompt: "青" },
    { id: "green", label: "緑", prompt: "緑" },
    { id: "yellow", label: "黄色", prompt: "黄" },
    { id: "purple", label: "紫", prompt: "紫" },
  ],
  age: [
    { id: "child", label: "子ども", prompt: "子どもの" },
    { id: "teen", label: "10代", prompt: "10代の" },
    { id: "twenties", label: "20代", prompt: "20代くらいの" },
    { id: "middle", label: "中年", prompt: "中年の" },
    { id: "elder", label: "お年寄り", prompt: "お年寄りの" },
  ],
  species: [
    { id: "human", label: "人間", prompt: "人間" },
    { id: "cat", label: "猫", prompt: "人の言葉をしゃべる猫" },
    { id: "dog", label: "犬", prompt: "人の言葉をしゃべる犬" },
    { id: "rabbit", label: "うさぎ", prompt: "人の言葉をしゃべるうさぎ" },
    { id: "robot", label: "ロボット", prompt: "人の形に近い小さなロボット" },
    { id: "elf", label: "とがった耳の人", prompt: "耳がとがった人" },
  ],
};

/** 選択肢を id から引く。知らない id なら undefined */
export function findPartOption(kind: PartKind, id: unknown): PartOption | undefined {
  return PART_OPTIONS[kind].find((o) => o.id === id);
}

/** 全種類が知っている id か（余計な種類があっても、足りなくても false） */
export function validateParts(parts: unknown): parts is CharacterParts {
  if (typeof parts !== "object" || parts === null || Array.isArray(parts)) return false;
  const rec = parts as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== PART_KINDS.length) return false;
  return PART_KINDS.every((k) => !!findPartOption(k, rec[k]));
}

/**
 * パーツと短い自由記入から見た目の文を組み立てる（characters.ts の appearance と同じ書き方）。
 * 呼ぶ前に validateParts を通すこと。note は前後の空白を落として末尾に足す。
 */
export function buildAppearance(parts: CharacterParts, note?: string): string {
  const o = (k: PartKind) => findPartOption(k, parts[k])!.prompt;
  const main = [
    `${o("age")}${o("species")}。`,
    `${o("body")}。`,
    `${o("hairStyle")}で、髪（毛）の色は${o("hairColor")}。`,
    `${o("outfitColor")}色の${o("outfit")}を着ている。`,
  ].join("");
  const extra = note?.trim();
  return extra ? `${main}ほかの特徴: ${extra}` : main;
}
