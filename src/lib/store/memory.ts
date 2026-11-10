// プロセス内の Map に置く Store。テストと手元用。
import type { NodeDoc, ThemeDoc, VoteDoc } from "../types";
import type { Collection, Store, Tx } from "./types";

type Table = Map<string, Record<string, unknown>>;

export class MemoryStore implements Store {
  private tables = new Map<Collection, Table>();
  /** トランザクションを1本ずつ流すための鎖 */
  private chain: Promise<unknown> = Promise.resolve();

  private table(col: Collection): Table {
    let t = this.tables.get(col);
    if (!t) {
      t = new Map();
      this.tables.set(col, t);
    }
    return t;
  }

  private read<T>(col: Collection, id: string): T | null {
    const v = this.table(col).get(id);
    return v ? (structuredClone(v) as T) : null;
  }

  private all<T>(col: Collection): T[] {
    return [...this.table(col).values()].map((v) => structuredClone(v) as T);
  }

  async get<T>(col: Collection, id: string): Promise<T | null> {
    return this.read<T>(col, id);
  }

  async getMany<T>(col: Collection, ids: string[]): Promise<(T | null)[]> {
    return ids.map((id) => this.read<T>(col, id));
  }

  async listThemes(limit: number): Promise<ThemeDoc[]> {
    return this.all<ThemeDoc>("themes")
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, limit);
  }

  async listNodesByTheme(themeId: string): Promise<NodeDoc[]> {
    return this.all<NodeDoc>("nodes").filter((n) => n.themeId === themeId);
  }

  async listOpenDoneNodes(themeId?: string): Promise<NodeDoc[]> {
    return this.all<NodeDoc>("nodes").filter(
      (n) => n.slotOpen === true && n.status === "done" && (themeId === undefined || n.themeId === themeId),
    );
  }

  async listVotesByUserAndTheme(uid: string, themeId: string): Promise<VoteDoc[]> {
    return this.all<VoteDoc>("votes").filter((v) => v.uid === uid && v.themeId === themeId);
  }

  runTransaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const writes: Array<() => void> = [];
      const tx: Tx = {
        get: async <T>(col: Collection, id: string) => this.read<T>(col, id),
        nodesByTheme: async (themeId) => this.listNodesByTheme(themeId),
        set: (col, id, data) => {
          const copy = structuredClone(data) as Record<string, unknown>;
          writes.push(() => this.table(col).set(id, copy));
        },
        update: (col, id, patch) => {
          const copy = structuredClone(patch);
          writes.push(() => {
            const cur = this.table(col).get(id);
            if (!cur) throw new Error(`update: ${col}/${id} が無い`);
            this.table(col).set(id, { ...cur, ...copy });
          });
        },
        delete: (col, id) => {
          writes.push(() => {
            this.table(col).delete(id);
          });
        },
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** テスト用: 中身を直接書き換える */
  _put(col: Collection, id: string, data: Record<string, unknown>): void {
    this.table(col).set(id, structuredClone(data));
  }
}
