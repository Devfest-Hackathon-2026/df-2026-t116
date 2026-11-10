import type { NodeStatus } from "../lib/types";

export function viewerCanWrite(sheetsPending: boolean, mineStatus: NodeStatus | null): boolean {
  return !sheetsPending && (mineStatus === null || mineStatus === "failed" || mineStatus === "rejected");
}

export type EmptyPageCta =
  | { kind: "write"; label: "最初のページを描く" }
  | { kind: "login"; label: "ログインして描く" }
  | { kind: "disabled"; label: "設定画の確認が終わるまで描けません" | "描きました" };

export function emptyPageFixedCta(input: {
  sheetsPending: boolean;
  mineStatus: NodeStatus | null;
  loggedIn: boolean;
}): EmptyPageCta {
  if (input.sheetsPending) return { kind: "disabled", label: "設定画の確認が終わるまで描けません" };
  if (!viewerCanWrite(input.sheetsPending, input.mineStatus)) {
    if (!input.loggedIn) return { kind: "login", label: "ログインして描く" };
    return { kind: "disabled", label: "描きました" };
  }
  return { kind: "write", label: "最初のページを描く" };
}
