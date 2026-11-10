import { charLen } from "./labels";

export const TITLE_MAX = 20;
export const TEXT_MAX = 200;

export function step1BlockReason(title: string, text: string): string | null {
  const titleLeft = TITLE_MAX - charLen(title.trim());
  const textLeft = TEXT_MAX - charLen(text.trim());
  if (text.trim() === "") return "物語の軸を入れてください";
  if (textLeft < 0) return "物語の軸が字数を超えています";
  if (titleLeft < 0) return "作品名が字数を超えています";
  return null;
}
