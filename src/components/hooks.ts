"use client";
// 画面で共有する小さな仕組み（読み込み・今の時刻・山の枚数・読んだ話の記録）。
import { useCallback, useEffect, useRef, useState } from "react";
import { failureMessage, failureStatus, getDeck, onDeckChanged } from "@/lib/client/api";
import { useAuth } from "./AuthProvider";

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  status: number | null;
  reload: () => Promise<void>;
  setData: (d: T) => void;
}

/** 読み込む。initial（作り物の時の中身）があれば最初の描画にそれを使い、読みに行かない */
export function useLoad<T>(load: () => Promise<T>, initial: T | undefined, key: string): Loaded<T> {
  const [data, setData] = useState<T | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hadInitial = useRef(initial !== undefined);

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
      setStatus(null);
    } catch (e) {
      setError(failureMessage(e));
      setStatus(failureStatus(e));
    }
  }, []);

  useEffect(() => {
    if (hadInitial.current) {
      hadInitial.current = false;
      return;
    }
    void reload();
  }, [key, reload]);

  return { data, error, status, reload, setData };
}

/** 今の時刻。サーバーの描画とずれないよう、画面に出てからだけ数字を持つ（それまでは null） */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 評価の山の残り枚数。ログインしていなければ null */
export function useDeckCount(): number | null {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!user) {
      setCount(null);
      return;
    }
    let alive = true;
    let timer = 0;
    const load = () => {
      getDeck()
        .then((cards) => alive && setCount(cards.length))
        .catch(() => alive && setCount(null));
    };
    load();
    const off = onDeckChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 300);
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      off();
    };
  }, [user]);
  return count;
}

// ---- 読んだ話（この端末だけに覚える） ----
const READ_KEY = "t116.read";

function readAll(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(READ_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** その作品で読んだ一番先の話（無ければ 0） */
export function lastReadEpisode(themeId: string): number {
  const v = readAll()[themeId];
  return typeof v === "number" && v > 0 ? v : 0;
}

export function markEpisodeRead(themeId: string, episode: number): void {
  try {
    const all = readAll();
    if ((all[themeId] ?? 0) >= episode) return;
    all[themeId] = episode;
    window.localStorage.setItem(READ_KEY, JSON.stringify(all));
  } catch {
    // 覚えられなくても読むのに困らない
  }
}

/** 動きを減らす設定か */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
