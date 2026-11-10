// Firestore に置く Store（firebase-admin。ADC で動く）。
import { getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { getAdminApp } from "../firebaseAdmin";
import type { NodeDoc, ThemeDoc, VoteDoc } from "../types";
import type { Collection, Store, Tx } from "./types";

const g = globalThis as unknown as { __t116Firestore?: Firestore };

function db(): Firestore {
  if (!g.__t116Firestore) {
    const fs = getFirestore(getAdminApp());
    fs.settings({ ignoreUndefinedProperties: true });
    g.__t116Firestore = fs;
  }
  return g.__t116Firestore;
}

export class FirestoreStore implements Store {
  async get<T>(col: Collection, id: string): Promise<T | null> {
    const snap = await db().collection(col).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async getMany<T>(col: Collection, ids: string[]): Promise<(T | null)[]> {
    if (ids.length === 0) return [];
    const d = db();
    const snaps = await d.getAll(...ids.map((id) => d.collection(col).doc(id)));
    return snaps.map((s) => (s.exists ? (s.data() as T) : null));
  }

  // 問い合わせは等号だけ・並べ替えは1つの欄だけ（自動の単一欄インデックスで足りる。複合インデックスは要らない）
  async listThemes(limit: number): Promise<ThemeDoc[]> {
    const q = await db().collection("themes").orderBy("updatedAt", "desc").limit(limit).get();
    return q.docs.map((d) => d.data() as ThemeDoc);
  }

  async listNodesByTheme(themeId: string): Promise<NodeDoc[]> {
    const q = await db().collection("nodes").where("themeId", "==", themeId).get();
    return q.docs.map((d) => d.data() as NodeDoc);
  }

  async listOpenDoneNodes(themeId?: string): Promise<NodeDoc[]> {
    let q: Query = db().collection("nodes").where("slotOpen", "==", true).where("status", "==", "done");
    if (themeId !== undefined) q = q.where("themeId", "==", themeId);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as NodeDoc);
  }

  async listVotesByUserAndTheme(uid: string, themeId: string): Promise<VoteDoc[]> {
    const q = await db()
      .collection("votes")
      .where("uid", "==", uid)
      .where("themeId", "==", themeId)
      .get();
    return q.docs.map((d) => d.data() as VoteDoc);
  }

  runTransaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const d = db();
    return d.runTransaction(async (t) => {
      const tx: Tx = {
        get: async <T>(col: Collection, id: string) => {
          const snap = await t.get(d.collection(col).doc(id));
          return snap.exists ? (snap.data() as T) : null;
        },
        nodesByTheme: async (themeId) => {
          const q = await t.get(d.collection("nodes").where("themeId", "==", themeId));
          return q.docs.map((x) => x.data() as NodeDoc);
        },
        set: (col, id, data) => {
          t.set(d.collection(col).doc(id), data);
        },
        update: (col, id, patch) => {
          t.update(d.collection(col).doc(id), patch);
        },
        delete: (col, id) => {
          t.delete(d.collection(col).doc(id));
        },
      };
      return fn(tx);
    });
  }
}
