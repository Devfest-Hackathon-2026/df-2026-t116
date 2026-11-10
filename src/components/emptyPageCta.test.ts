import { describe, expect, it } from "vitest";
import { FakeGenerator } from "../lib/generator/fake";
import { MemoryImageStore } from "../lib/images/memory";
import type { ThemeDetail2 } from "../lib/apiTypes";
import { createService } from "../lib/service";
import { MemoryStore } from "../lib/store/memory";
import { emptyReasons, type NodeDoc, type NodeStatus, type User } from "../lib/types";
import { emptyPageFixedCta, viewerCanWrite } from "./emptyPageCta";

const STATUSES: NodeStatus[] = ["generating", "done", "failed", "rejected"];
const PARTS = {
  hairStyle: "short",
  hairColor: "black",
  body: "small",
  outfit: "uniform",
  outfitColor: "blue",
  age: "teen",
  species: "human",
};
const alice: User = { uid: "alice", name: "アリス" };
const LINES = ["朝", "昼", "夕", "夜"];

describe("ページ0枚の固定ボタン", () => {
  it("設定画は確定済みで canWrite が偽のとき、ログイン中は「描きました」、未ログインはログインへ進む", () => {
    const blocked = STATUSES.filter((status) => !viewerCanWrite(false, status));
    expect(blocked).toEqual(["generating", "done"]);
    for (const status of blocked) {
      expect(emptyPageFixedCta({ sheetsPending: false, mineStatus: status, loggedIn: true })).toEqual({
        kind: "disabled",
        label: "描きました",
      });
      expect(emptyPageFixedCta({ sheetsPending: false, mineStatus: status, loggedIn: false })).toEqual({
        kind: "login",
        label: "ログインして描く",
      });
    }
  });
});

function labelOf(
  d: ThemeDetail2,
  loggedIn: boolean,
): { canWrite: boolean; sheetsPending: boolean; label: string; mineStatus: NodeStatus | null } {
  const customs = d.theme.characters.flatMap((c) => (c.kind === "custom" ? [c] : []));
  const sheetsPending = customs.length > 0 && !d.theme.sheetsConfirmed;
  const mineStatus = d.slot.candidates.find((c) => c.mine)?.status ?? null;
  const cta = emptyPageFixedCta({ sheetsPending, mineStatus, loggedIn });
  return {
    canWrite: viewerCanWrite(sheetsPending, mineStatus),
    sheetsPending,
    mineStatus,
    label: d.pages.length === 0 ? cta.label : "(ページあり)",
  };
}

describe("canWrite が偽になる画面の状態", () => {
  it("未ログインと1日の上限では偽にならず、生成中と描き終わりだけ「描きました」になる", async () => {
    const store = new MemoryStore();
    const svc = createService({
      store,
      images: new MemoryImageStore(),
      generator: new FakeGenerator(0),
      config: { limitPerUser: 1, limitGlobal: 120, genTimeoutSec: 120 },
      now: () => Date.UTC(2026, 10, 10, 3, 0, 0),
    });
    const theme = await svc.createTheme(alice, {
      title: "寝坊",
      text: "いつも寝坊する町",
      artStyle: "standard",
      characterIds: ["mikan"],
    });
    const rows: Array<{ name: string } & ReturnType<typeof labelOf>> = [];
    const record = async (name: string, themeId: string, user: User | null) => {
      const row = { name, ...labelOf(await svc.getTheme(themeId, user), user !== null) };
      rows.push(row);
      return row;
    };

    expect(await record("未ログイン・候補なし", theme.id, null)).toMatchObject({
      canWrite: true,
      sheetsPending: false,
      label: "最初のページを描く",
    });
    expect(await record("ログイン・候補なし", theme.id, alice)).toMatchObject({
      canWrite: true,
      sheetsPending: false,
      label: "最初のページを描く",
    });

    const drawnId = crypto.randomUUID();
    await svc.createNode(alice, { nodeId: drawnId, themeId: theme.id, slot: 0, lines: LINES });
    const other = await svc.createTheme(alice, {
      title: "別",
      text: "別の町の話",
      artStyle: "standard",
      characterIds: ["tetsu"],
    });
    await expect(
      svc.createNode(alice, { nodeId: crypto.randomUUID(), themeId: other.id, slot: 0, lines: LINES }),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(await record("1日の上限・この作品は未投稿", other.id, alice)).toMatchObject({
      canWrite: true,
      sheetsPending: false,
      label: "最初のページを描く",
    });
    expect(await record("自分の候補が描き終わり", theme.id, alice)).toMatchObject({
      canWrite: false,
      sheetsPending: false,
      mineStatus: "done",
      label: "描きました",
    });

    const base: NodeDoc = {
      id: drawnId,
      themeId: theme.id,
      parentId: null,
      depth: 0,
      lines: LINES,
      status: "generating",
      deadlineAt: Number.MAX_SAFE_INTEGER,
      failReason: null,
      imagePath: null,
      likes: 0,
      nopes: 0,
      reasons: emptyReasons(),
      slotOpen: true,
      doneAt: null,
      authorUid: alice.uid,
      authorName: alice.name,
      createdAt: 1,
    };
    store._put("nodes", drawnId, { ...base, status: "generating" });
    expect(await record("自分の候補が生成中", theme.id, alice)).toMatchObject({
      canWrite: false,
      sheetsPending: false,
      mineStatus: "generating",
      label: "描きました",
    });
    for (const status of ["failed", "rejected"] as const) {
      store._put("nodes", drawnId, { ...base, status });
      expect(await record(`自分の候補が${status}`, theme.id, alice)).toMatchObject({
        canWrite: true,
        label: "最初のページを描く",
      });
    }

    const sheets = createService({
      store: new MemoryStore(),
      images: new MemoryImageStore(),
      generator: new FakeGenerator(0),
      config: { limitPerUser: 10, limitGlobal: 120, genTimeoutSec: 120 },
      now: () => Date.UTC(2026, 10, 10, 3, 0, 0),
    });
    const custom = await sheets.createTheme(alice, {
      title: "ねこ",
      text: "ねこのギルド",
      artStyle: "standard",
      characters: [{ name: "ソラ", parts: PARTS }],
    });
    const pending = labelOf(await sheets.getTheme(custom.id, null), false);
    rows.push({ name: "設定画の確認待ち", ...pending });
    expect(pending).toMatchObject({
      canWrite: false,
      sheetsPending: true,
      label: "設定画の確認が終わるまで描けません",
    });
    expect(rows.map((row) => [row.name, row.canWrite, row.label])).toEqual([
      ["未ログイン・候補なし", true, "最初のページを描く"],
      ["ログイン・候補なし", true, "最初のページを描く"],
      ["1日の上限・この作品は未投稿", true, "最初のページを描く"],
      ["自分の候補が描き終わり", false, "描きました"],
      ["自分の候補が生成中", false, "描きました"],
      ["自分の候補がfailed", true, "最初のページを描く"],
      ["自分の候補がrejected", true, "最初のページを描く"],
      ["設定画の確認待ち", false, "設定画の確認が終わるまで描けません"],
    ]);
  });
});
