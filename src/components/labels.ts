import type { VoteReason } from "@/lib/types";

export const LINE_LABELS = ["コマ1", "コマ2", "コマ3", "コマ4"] as const;

export const REASON_LABELS: { key: VoteReason; label: string }[] = [
  { key: "hiki", label: "続きが気になる" },
  { key: "igai", label: "展開が意外" },
  { key: "chara", label: "キャラが良い" },
  { key: "e", label: "絵が良い" },
];

/** 文字の数（絵文字なども1字と数える。サーバーと同じ数え方） */
export function charLen(s: string): number {
  return [...s].length;
}
