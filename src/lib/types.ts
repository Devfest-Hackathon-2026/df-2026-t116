// データの形（docs/design-d-serial.md）。時刻はすべて epoch ミリ秒の数値で持つ。
import type { ArtStyleId } from "./artStyles";
import type { CharacterParts } from "./characterParts";

// 理由の表示名は画面側（続きが気になる／展開が意外／キャラが良い／絵が良い）。話は続くので「オチ」ではなく「引き」
export const VOTE_REASONS = ["hiki", "igai", "chara", "e"] as const;
export type VoteReason = (typeof VOTE_REASONS)[number];
export type Reasons = Record<VoteReason, number>;

export type NodeStatus = "generating" | "done" | "failed" | "rejected";

export type SheetStatus = "generating" | "done" | "failed";

/** 設定画の描き直しができる回数（1作品あたり） */
export const SHEET_RETRY_MAX = 2;

/**
 * 作品名の付け直しができる回数（1作品あたり・JST の1日あたり）。
 * 連打で文チェック（moderateTheme）の呼び出しが増えすぎないための歯止め。
 * 画像生成の日次上限（usage の user_ / all_）とは別の枠。
 */
export const RENAME_LIMIT_PER_DAY = 5;

/** 作品のキャラ。①例（固定4体）か ②パーツ選択＋短い自由記入（見た目の文はサーバーが組み立てる） */
export type ThemeCharacter =
  | { kind: "example"; id: string }
  | {
      kind: "custom";
      /** サーバーで作る */
      id: string;
      /** 1〜20字 */
      name: string;
      parts: CharacterParts;
      /** 短い自由記入（0〜80字。無ければ空文字） */
      note: string;
      /** サーバーが parts と note から組み立てた見た目の文 */
      appearance: string;
      /** 設定画の状態（generating＝AIが描いている／done＝できた／failed＝失敗か止められた） */
      sheetStatus: SheetStatus;
      sheetPath: string | null;
      sheetFailReason: string | null;
      /** サーバー内部の照合用。最後に始めた生成の ID（無い古いデータは未設定） */
      sheetGenId?: string;
      /** この生成の期限（ms）。これを過ぎた generating は失敗として扱い、結果は書かない（無い古いデータは期限なし） */
      sheetDeadlineAt?: number;
      /** 描き直しで予約した回数を、この生成が持っているか（失敗確定時に一度だけ戻す印） */
      sheetReserved?: boolean;
    };

export interface ThemeDoc {
  id: string;
  /** 作品名（1〜20字）。未設定ならフィールド無し（空文字では保存しない） */
  title?: string;
  /** 物語の軸（1〜200字） */
  text: string;
  artStyle: ArtStyleId;
  /** 作品のキャラ（1〜2体） */
  characters: ThemeCharacter[];
  /** 互換のため残す。例のキャラの id（パーツのキャラは入れない） */
  characterIds: string[];
  authorUid: string;
  authorName: string;
  createdAt: number;
  /** 一覧の並び（新しい順）に使う。ページが決まった時・候補が完成した時に更新 */
  updatedAt: number;
  /** 決まったページの nodeId の並び（index＝ページの通し番号） */
  confirmed: string[];
  /** 今の募集中のページの募集が始まった時刻 */
  slotOpenedAt: number;
  /** 募集中のページの完成した候補の数（一覧を安く返すための写し。完成の書き込みで+1、決まると0） */
  slotDoneCount: number;
  /** 募集中のページで最初に候補が完成した時刻（無ければ null） */
  slotFirstDoneAt: number | null;
  /** 設定画の描き直しに使った回数（最大 SHEET_RETRY_MAX） */
  sheetRetries: number;
  /** 始めた人が設定画を確定したら true。false の間はページを描けない（例のキャラだけの作品は最初から true） */
  sheetsConfirmed: boolean;
}

export interface NodeDoc {
  id: string;
  themeId: string;
  /** 描いた時点の最後の決まったページ（1ページ目なら null） */
  parentId: string | null;
  /** ページの通し番号（0始まり） */
  depth: number;
  lines: string[];
  status: NodeStatus;
  deadlineAt: number;
  failReason: string | null;
  imagePath: string | null;
  likes: number;
  nopes: number;
  reasons: Reasons;
  /** 募集中のページの候補なら true。ページが決まるとそのページの候補は全部 false */
  slotOpen: boolean;
  /** 完成した時刻（未完成なら null） */
  doneAt: number | null;
  authorUid: string;
  authorName: string;
  createdAt: number;
}

/** 絵の指示。画面に一切返さない。 */
export interface NodePrivateDoc {
  id: string;
  panels: string[];
}

/** votes/{nodeId}_{uid} */
export interface VoteDoc {
  id: string;
  nodeId: string;
  themeId: string;
  uid: string;
  /** true＝いいね・false＝いまいち */
  like: boolean;
  /** いいねの時だけ付けられる理由（無しも可） */
  reason: VoteReason | null;
  createdAt: number;
}

export interface UsageDoc {
  id: string;
  count: number;
}

export interface User {
  uid: string;
  name: string;
}

/** 古い仮のトップ（src/app/page.tsx）が使う形。新しい画面は apiTypes.ts の ThemeSummary を使う。 */
export interface ThemeView {
  id: string;
  text: string;
  characterIds: string[];
  authorName: string;
  createdAt: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * instanceof を使わずに見分ける。Service は globalThis に1つだけ置くので、
 * Next のルートごとに別のバンドルから来た ApiError でも同じ物として扱う。
 */
export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "ApiError" &&
    typeof (e as { status?: unknown }).status === "number" &&
    typeof (e as { message?: unknown }).message === "string"
  );
}

export function emptyReasons(): Reasons {
  return { hiki: 0, igai: 0, chara: 0, e: 0 };
}
