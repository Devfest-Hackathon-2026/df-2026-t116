// 連載の形（docs/design-d-serial.md）で、サーバーが画面に返す形。サーバーと画面が同じ物を使う。
import type { ArtStyleId } from "./artStyles";
import type { CharacterParts } from "./characterParts";
import type { NodeStatus, Reasons, SheetStatus, VoteReason } from "./types";

/** 1話のページ数 */
export const PAGES_PER_EPISODE = 4;

/** 作品の中の通し番号（0始まり）→ 第何話・何ページ目（どちらも1始まり） */
export function pagePosition(index: number): { episode: number; pageInEpisode: number } {
  return {
    episode: Math.floor(index / PAGES_PER_EPISODE) + 1,
    pageInEpisode: (index % PAGES_PER_EPISODE) + 1,
  };
}

/** 決まったページ（読む画面用） */
export interface PageView {
  nodeId: string;
  /** 作品の中の通し番号（0始まり） */
  index: number;
  episode: number;
  pageInEpisode: number;
  lines: string[];
  authorName: string;
  imageUrl: string;
  createdAt: number;
}

/** 募集中のページの候補 */
export interface CandidateView {
  nodeId: string;
  status: NodeStatus;
  failReason: string | null;
  deadlineAt: number;
  lines: string[];
  authorName: string;
  mine: boolean;
  /** 完成していれば `/api/images/{id}` */
  imageUrl: string | null;
  /** 自分の候補か、自分が評価した候補だけ数字。他は null */
  likes: number | null;
  reasons: Reasons | null;
  myVote: { like: boolean; reason: VoteReason | null } | null;
  createdAt: number;
}

/** 募集中のページ */
export interface SlotView {
  index: number;
  episode: number;
  pageInEpisode: number;
  /** 完成した候補の数（自分の分も含む） */
  doneCount: number;
  /** 画面に出す候補: 自分の候補（状態は問わない）と、自分が評価した候補だけ */
  candidates: CandidateView[];
  /** 自分がまだ評価していない、他人の完成した候補の数 */
  toSwipeCount: number;
  /** 作品を始めた人で、完成した候補が1本以上ある時 true */
  canConfirm: boolean;
  /** 自動で決まる予定の時刻（ミリ秒）。条件を満たしていなければ null */
  autoConfirmAt: number | null;
}

/** 画面に出すキャラ。例は id（名前は characters.ts から引く）、パーツのキャラは name と appearance */
export type CharacterView =
  | { kind: "example"; id: string }
  | {
      kind: "custom";
      name: string;
      appearance: string;
      /** 設定画の状態 */
      sheetStatus: SheetStatus;
      /** done なら `/api/themes/{id}/sheets/{characterId}?v={sheetPath}`、それ以外は null */
      sheetUrl: string | null;
      /** 直近の描き直しに失敗した理由。前の画像を残したときも入る。無ければ null */
      sheetFailReason: string | null;
    };

/** 作品の一覧・見出しに使う形 */
export interface ThemeSummary {
  id: string;
  /** 作品名（1〜20字）。未設定ならフィールド無し（画面は「無題」と出す） */
  title?: string;
  /** 物語の軸（1〜200字。世界・主人公・目指す所・雰囲気など、作品を始めた人が決める大枠） */
  text: string;
  /** 絵柄（作品を始めた人が選ぶ。全ページ共通） */
  artStyle: ArtStyleId;
  characters: CharacterView[];
  /** 互換のため残す。例のキャラの id だけ */
  characterIds: string[];
  authorName: string;
  createdAt: number;
  updatedAt: number;
  /** 設定画の確認が終わっていれば true（false の間はページを描けない） */
  sheetsConfirmed: boolean;
  /** 設定画の描き直しの残り回数（2 − 使った回数） */
  sheetRetriesLeft: number;
  /** 1ページ目の絵。まだ無ければ null */
  coverUrl: string | null;
  /** 決まったページの数 */
  pageCount: number;
  /** 完結した話の数 */
  completedEpisodes: number;
  slot: { episode: number; pageInEpisode: number; doneCount: number };
}

export interface ThemeListResponse {
  themes: ThemeSummary[];
}

export interface ThemeDetail2 {
  theme: ThemeSummary & { mine: boolean };
  pages: PageView[];
  slot: SlotView;
}

/** 作品名が未設定のときの表示 */
export const UNTITLED = "無題";

/** 画面に出す作品名（未設定は「無題」。保存はしない） */
export function displayTitle(t: { title?: string }): string {
  return t.title ? t.title : UNTITLED;
}

/** 無題のときに添える、物語の軸の冒頭（約20字） */
export function textHead(text: string, max = 20): string {
  const chars = [...text.trim().replace(/\s+/g, " ")];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

/** 評価の山の1枚 */
export interface DeckCard {
  nodeId: string;
  themeId: string;
  /** 作品名。未設定なら無し（画面は「無題」＋物語の軸の冒頭） */
  themeTitle?: string;
  /** 物語の軸の冒頭（無題のときに添える） */
  themeTextHead: string;
  characters: CharacterView[];
  characterIds: string[];
  episode: number;
  pageInEpisode: number;
  lines: string[];
  authorName: string;
  imageUrl: string;
  /** 1つ前の決まったページ（1ページ目の候補なら null） */
  prevPage: { imageUrl: string; lines: string[] } | null;
}

export interface DeckResponse {
  cards: DeckCard[];
}

/** POST /api/themes の体に入れるキャラ。例の id か、パーツで作るキャラ */
export type PostCharacter = string | { name: string; parts: CharacterParts; note?: string };

/** POST /api/themes の体 */
export interface PostThemeBody {
  /** 任意（1〜20字）。無ければ未設定 */
  title?: string;
  text: string;
  artStyle: ArtStyleId;
  characters?: PostCharacter[];
  /** 旧形式（例の id だけ）。characters が無い時だけ受ける */
  characterIds?: string[];
}

/** POST /api/themes/[id]/sheets/retry の体（任意）。characterId が無ければ確定前のパーツのキャラ全部 */
export interface PostSheetRetryBody {
  characterId?: string;
}

/** POST /api/nodes の体 */
export interface PostNodeBody {
  nodeId: string;
  themeId: string;
  /** 描くページの通し番号（0始まり）。今の募集中と違えば 409 */
  slot: number;
  lines: string[];
}

/** POST /api/votes の体 */
export interface PostVoteBody {
  nodeId: string;
  like: boolean;
}

/** PATCH /api/votes の体 */
export interface PatchVoteBody {
  nodeId: string;
  reason: VoteReason;
}
