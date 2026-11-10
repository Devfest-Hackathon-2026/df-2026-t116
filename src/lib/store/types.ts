import type { NodeDoc, ThemeDoc, VoteDoc } from "../types";

export type Collection = "themes" | "nodes" | "nodePrivate" | "votes" | "usage";

/**
 * トランザクションの中の操作。Firestore と同じく「読みを先に全部、書きは後」で使う。
 * 書きは関数が正常に終わった時だけまとめて反映される。
 */
export interface Tx {
  get<T>(col: Collection, id: string): Promise<T | null>;
  /** 同じ作品の候補を全部読む（期限切れの掃除・ページを決める時に使う） */
  nodesByTheme(themeId: string): Promise<NodeDoc[]>;
  set<T extends object>(col: Collection, id: string, data: T): void;
  update(col: Collection, id: string, patch: Record<string, unknown>): void;
  delete(col: Collection, id: string): void;
}

/**
 * 問い合わせは等号だけ（Firestore の複合インデックスを要らなくする）。並べ替えはサーバーの中で。
 */
export interface Store {
  runTransaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  get<T>(col: Collection, id: string): Promise<T | null>;
  /** 並びは ids と同じ。無い物は null */
  getMany<T>(col: Collection, ids: string[]): Promise<(T | null)[]>;
  /** 更新の新しい順（updatedAt の1つの欄だけで並べる） */
  listThemes(limit: number): Promise<ThemeDoc[]>;
  listNodesByTheme(themeId: string): Promise<NodeDoc[]>;
  /** slotOpen==true かつ status=="done" の候補（themeId があればその作品だけ） */
  listOpenDoneNodes(themeId?: string): Promise<NodeDoc[]>;
  listVotesByUserAndTheme(uid: string, themeId: string): Promise<VoteDoc[]>;
}
