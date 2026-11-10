import type { Character } from "../characters";
import type { ImageData } from "../images/types";

export type ModerationResult = { ok: true } | { ok: false; reason: string };

export interface GenerateInput {
  /** 物語の軸（作品を始めた人が書いた大枠） */
  themeText: string;
  /** 作品名（無くてもよい） */
  title?: string;
  /** 絵柄の指示の文（artStyles.ts の prompt）。無ければ生成側の既定 */
  artStyle?: string;
  /** このページの位置（第何話の何ページ目。1話は4ページ） */
  position?: { episode: number; pageInEpisode: number };
  /** 1つ前のページのセリフ（話をつなぐため。あれば） */
  prevLines?: string[];
  characters: Character[];
  /** 人が書いた4行（セリフの正本） */
  lines: string[];
  /** 1つ前のページ（4コマ分の1枚。あれば） */
  prevImage?: ImageData;
}

export type GenerateResult =
  | { status: "done"; image: ImageData; panels: string[] }
  | { status: "rejected"; reason: string }
  | { status: "failed"; reason: string };

/** 設定画の生成の入力（パーツで作ったキャラの名前と見た目の文） */
export interface GenerateSheetInput {
  character: { name: string; appearance: string };
  /** 絵柄の指示の文。無ければ生成側の既定 */
  artStyle?: string;
}

export type GenerateSheetResult =
  | { status: "done"; image: ImageData }
  | { status: "rejected"; reason: string }
  | { status: "failed"; reason: string };

/** 漫画の1ページ（4コマ分）の生成。fake（手元・テスト）と vertex（#27）を差し替える。 */
export interface ComicGenerator {
  /** 作品名・物語の軸を確かめる（呼ぶ側は「作品名
物語の軸」をつないで渡す） */
  moderateTheme(text: string): Promise<ModerationResult>;
  generate(input: GenerateInput, signal: AbortSignal): Promise<GenerateResult>;
  /** パーツで作ったキャラの設定画を1枚（正方形 1:1・1K） */
  generateSheet(input: GenerateSheetInput, signal: AbortSignal): Promise<GenerateSheetResult>;
}
