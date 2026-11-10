import { describe, expect, it } from "vitest";
import { pagePosition } from "./apiTypes";
import { requireUser, resolveUser } from "./auth";
import { FakeGenerator } from "./generator/fake";
import type { ComicGenerator, GenerateInput, GenerateResult, GenerateSheetResult } from "./generator/types";
import { MemoryImageStore } from "./images/memory";
import { createService, jstDate, pickWinner, validateRenameInput, type ServiceConfig } from "./service";
import { MemoryStore } from "./store/memory";
import { ApiError, emptyReasons, type NodeDoc, type ThemeDoc, type User, type VoteDoc } from "./types";

const alice: User = { uid: "alice", name: "アリス" };
const bob: User = { uid: "bob", name: "ボブ" };
const carol: User = { uid: "carol", name: "キャロル" };
const dave: User = { uid: "dave", name: "デイブ" };

const SEC = 1000;

function setup(opts: { config?: Partial<ServiceConfig>; generator?: ComicGenerator } = {}) {
  const store = new MemoryStore();
  const images = new MemoryImageStore();
  const clock = { t: Date.UTC(2026, 10, 10, 3, 0, 0) };
  const svc = createService({
    store,
    images,
    generator: opts.generator ?? new FakeGenerator(0),
    config: {
      limitPerUser: 10,
      limitGlobal: 120,
      genTimeoutSec: 120,
      confirmAfterSec: 300,
      confirmSingleAfterSec: 1800,
      ...opts.config,
    },
    now: () => clock.t,
  });
  return { store, images, clock, svc };
}

type Svc = ReturnType<typeof setup>["svc"];

const LINES = ["朝、ミカンが寝坊した", "テツが迎えに来た", "でも今日は日曜", "二人で二度寝"];
const THEME = { title: "寝坊の町", text: "いつも寝坊する町の子どもたちの毎日", artStyle: "standard", characterIds: ["mikan", "tetsu"] };

async function expectApiError(p: Promise<unknown>, status: number): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    return e as ApiError;
  }
  throw new Error(`ApiError ${status} が投げられなかった`);
}

async function makeTheme(svc: Svc, user = alice) {
  return svc.createTheme(user, THEME);
}

function draw(svc: Svc, user: User, themeId: string, slot: number, lines = LINES, nodeId = crypto.randomUUID()) {
  return svc.createNode(user, { nodeId, themeId, slot, lines });
}

function node(over: Partial<NodeDoc>): NodeDoc {
  return {
    id: "x",
    themeId: "t",
    parentId: null,
    depth: 0,
    lines: ["a", "", "", ""],
    status: "done",
    deadlineAt: 0,
    failReason: null,
    imagePath: "p",
    likes: 0,
    nopes: 0,
    reasons: emptyReasons(),
    slotOpen: true,
    doneAt: 0,
    authorUid: "u",
    authorName: "u",
    createdAt: 0,
    ...over,
  };
}

describe("1. 作品の入力", () => {
  it("作品名21字・物語の軸201字・知らない絵柄 → 400、ちょうどは通る", async () => {
    const { svc } = setup();
    await expectApiError(svc.createTheme(alice, { ...THEME, title: "あ".repeat(21) }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, text: "あ".repeat(201) }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, text: "" }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, artStyle: "picasso" }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, artStyle: undefined }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, characterIds: ["mikan", "tetsu", "hakase"] }), 400);
    await expectApiError(svc.createTheme(alice, { ...THEME, characterIds: ["nobody"] }), 400);
    const ok = await svc.createTheme(alice, { ...THEME, title: "あ".repeat(20), text: "い".repeat(200), artStyle: "mono" });
    expect(ok.title).toBe("あ".repeat(20));
    expect(ok.artStyle).toBe("mono");
    expect(ok.pageCount).toBe(0);
    expect(ok.completedEpisodes).toBe(0);
    expect(ok.coverUrl).toBeNull();
    expect(ok.slot).toEqual({ episode: 1, pageInEpisode: 1, doneCount: 0 });
    expect(JSON.stringify(ok)).not.toContain("authorUid");
  });

  it("作品名なしで作れる。空文字・空白だけは未設定（フィールド無し）", async () => {
    const { svc, store } = setup();
    const { title: _omit, ...noTitle } = THEME;
    const a = await svc.createTheme(alice, noTitle);
    const b = await svc.createTheme(alice, { ...THEME, title: "" });
    const c = await svc.createTheme(alice, { ...THEME, title: "   " });
    for (const t of [a, b, c]) {
      expect("title" in t).toBe(false);
      const saved = await store.get<ThemeDoc>("themes", t.id);
      expect(saved && "title" in saved).toBe(false);
      expect((await svc.getTheme(t.id, alice)).theme.title).toBeUndefined();
    }
    await expectApiError(svc.createTheme(alice, { ...THEME, title: 5 }), 400);
  });

  it("古い保存（title が空文字・非文字列）は未設定として読む", async () => {
    const { svc, store } = setup();
    const t = await makeTheme(svc);
    const saved = (await store.get<ThemeDoc>("themes", t.id))!;
    await store.runTransaction(async (tx) => {
      tx.set("themes", t.id, { ...saved, title: "" });
    });
    expect("title" in (await svc.listThemes())[0]!).toBe(false);
    await store.runTransaction(async (tx) => {
      tx.set("themes", t.id, { ...saved, title: 42 as unknown as string });
    });
    expect("title" in (await svc.getTheme(t.id, alice)).theme).toBe(false);
  });

  it("作品名が無ければ文チェックには物語の軸だけ、生成にも title を渡さない", async () => {
    const seen: string[] = [];
    const inputs: GenerateInput[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async (text) => {
        seen.push(text);
        return { ok: true };
      },
      generate: (i, s) => {
        inputs.push(i);
        return new FakeGenerator(0).generate(i, s);
      },
    };
    const { svc } = setup({ generator: gen });
    const { title: _omit, ...noTitle } = THEME;
    const theme = await svc.createTheme(alice, noTitle);
    expect(seen[0]).toBe(THEME.text);
    await draw(svc, bob, theme.id, 0, LINES);
    expect(inputs).toHaveLength(1);
    expect("title" in inputs[0]!).toBe(false);
  });

  it("作品名の変更 PATCH: 本人だけ・文チェックあり・一覧と詳細に出る", async () => {
    const seen: string[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async (text) => {
        seen.push(text);
        return text.includes("NG") ? { ok: false, reason: "使えない言葉" } : { ok: true };
      },
      generate: (i, s) => new FakeGenerator(0).generate(i, s),
    };
    const { svc } = setup({ generator: gen });
    const { title: _omit, ...noTitle } = THEME;
    const theme = await svc.createTheme(alice, noTitle);
    await expectApiError(svc.renameTheme(bob, theme.id, { title: "乗っ取り" }), 403);
    await expectApiError(svc.renameTheme(alice, theme.id, { title: "" }), 400);
    await expectApiError(svc.renameTheme(alice, theme.id, { title: "あ".repeat(21) }), 400);
    await expectApiError(svc.renameTheme(alice, theme.id, {}), 400);
    await expectApiError(svc.renameTheme(alice, theme.id, { title: "NGの町" }), 400);
    await expectApiError(svc.renameTheme(alice, "no-such", { title: "x" }), 404);
    expect((await svc.getTheme(theme.id, alice)).theme.title).toBeUndefined();

    const detail = await svc.renameTheme(alice, theme.id, { title: "  朝の町  " });
    expect(seen.at(-1)).toBe(`朝の町\n${THEME.text}`);
    expect(detail.theme.title).toBe("朝の町");
    expect((await svc.getTheme(theme.id, bob)).theme.title).toBe("朝の町");
    expect((await svc.listThemes()).find((t) => t.id === theme.id)?.title).toBe("朝の町");
    // 直すこともできる
    expect((await svc.renameTheme(alice, theme.id, { title: "夜の町" })).theme.title).toBe("夜の町");
  });

  describe("作品名の付け直しの回数（1作品・JSTの1日・5回まで）", () => {
    function countingSetup() {
      const seen: string[] = [];
      const gen: ComicGenerator = {
        generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
        moderateTheme: async (text) => {
          seen.push(text);
          return text.includes("NG") ? { ok: false, reason: "使えない言葉" } : { ok: true };
        },
        generate: (i, s) => new FakeGenerator(0).generate(i, s),
      };
      return { seen, ...setup({ generator: gen }) };
    }

    it("同じ作品で5回まで成功し、6回目は 429。moderateTheme は5回だけ呼ばれる", async () => {
      const { svc, seen } = countingSetup();
      const theme = await makeTheme(svc);
      seen.length = 0; // 作成時の文チェックは数えない
      for (let i = 1; i <= 5; i++) await svc.renameTheme(alice, theme.id, { title: `名前${i}` });
      expect(seen).toHaveLength(5);
      const err = await expectApiError(svc.renameTheme(alice, theme.id, { title: "名前6" }), 429);
      expect(err.message).toContain("上限（5回）");
      expect(seen).toHaveLength(5);
      expect((await svc.getTheme(theme.id, alice)).theme.title).toBe("名前5");
    });

    it("別の作品なら独立して数える", async () => {
      const { svc } = countingSetup();
      const a = await makeTheme(svc);
      const b = await makeTheme(svc);
      for (let i = 1; i <= 5; i++) await svc.renameTheme(alice, a.id, { title: `名前${i}` });
      await expectApiError(svc.renameTheme(alice, a.id, { title: "あふれ" }), 429);
      expect((await svc.renameTheme(alice, b.id, { title: "別の作品" })).theme.title).toBe("別の作品");
    });

    it("文チェック NG の回は回数に入らない", async () => {
      const { svc } = countingSetup();
      const theme = await makeTheme(svc);
      for (let i = 0; i < 3; i++) await expectApiError(svc.renameTheme(alice, theme.id, { title: "NGの町" }), 400);
      for (let i = 1; i <= 5; i++) await svc.renameTheme(alice, theme.id, { title: `名前${i}` });
      await expectApiError(svc.renameTheme(alice, theme.id, { title: "名前6" }), 429);
    });

    it("日付（JST）が変わると数え直し。画像生成の枠には影響しない", async () => {
      const { svc, clock } = countingSetup();
      const theme = await makeTheme(svc);
      for (let i = 1; i <= 5; i++) await svc.renameTheme(alice, theme.id, { title: `名前${i}` });
      await expectApiError(svc.renameTheme(alice, theme.id, { title: "名前6" }), 429);
      clock.t += 24 * 3600 * SEC;
      expect((await svc.renameTheme(alice, theme.id, { title: "翌日" })).theme.title).toBe("翌日");
    });
  });

  it("未ログインは入口で 401（requireUser）", () => {
    expect(() => requireUser(null)).toThrow(ApiError);
    try {
      requireUser(null);
    } catch (e) {
      expect((e as ApiError).status).toBe(401);
    }
  });

  it("確かめには「作品名\\n物語の軸」を渡し、だめなら 400", async () => {
    const seen: string[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async (text) => {
        seen.push(text);
        return text.includes("NG") ? { ok: false, reason: "使えない言葉" } : { ok: true };
      },
      generate: (i, s) => new FakeGenerator(0).generate(i, s),
    };
    const { svc } = setup({ generator: gen });
    await makeTheme(svc);
    expect(seen[0]).toBe(`${THEME.title}\n${THEME.text}`);
    await expectApiError(svc.createTheme(alice, { ...THEME, title: "NGの町" }), 400);
  });

  it("セリフ: 5つ・31字・全部空 → 400", async () => {
    const { svc } = setup();
    const theme = await makeTheme(svc);
    await expectApiError(draw(svc, bob, theme.id, 0, ["a", "b", "c", "d", "e"]), 400);
    await expectApiError(draw(svc, bob, theme.id, 0, ["あ".repeat(31), "", "", ""]), 400);
    await expectApiError(draw(svc, bob, theme.id, 0, [" ", "", "  ", ""]), 400);
    await expectApiError(svc.createNode(bob, { nodeId: crypto.randomUUID(), themeId: theme.id, lines: LINES }), 400);
    const ok = await draw(svc, bob, theme.id, 0, ["あ".repeat(30), "", "", ""]);
    expect(ok.status).toBe("done");
  });
});

const PARTS = {
  hairStyle: "bob",
  hairColor: "brown",
  body: "small",
  outfit: "uniform",
  outfitColor: "blue",
  age: "teen",
  species: "human",
};
const CUSTOM = { name: "ソラ", parts: PARTS, note: "丸い眼鏡をかけている" };

describe("1b. パーツで作るキャラ", () => {
  const base = { title: "寝坊の町", text: "いつも寝坊する町", artStyle: "standard" };

  it("例のみ・パーツのみ・混在を受ける", async () => {
    const { svc, store } = setup();
    const ex = await svc.createTheme(alice, { ...base, characters: ["mikan", "tetsu"] });
    expect(ex.characters).toEqual([
      { kind: "example", id: "mikan" },
      { kind: "example", id: "tetsu" },
    ]);
    expect(ex.characterIds).toEqual(["mikan", "tetsu"]);

    const cu = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    expect(cu.characterIds).toEqual([]);
    expect(cu.characters).toHaveLength(1);
    expect(cu.characters[0]).toMatchObject({ kind: "custom", name: "ソラ" });
    expect(JSON.stringify(cu.characters[0])).toContain("丸い眼鏡をかけている");
    const saved = await store.get<ThemeDoc>("themes", cu.id);
    const sc = saved?.characters[0];
    expect(sc?.kind === "custom" && sc.id).toBeTruthy();
    expect(sc?.kind === "custom" && sc.parts).toEqual(PARTS);

    const mix = await svc.createTheme(alice, { ...base, characters: ["kinako", { name: "ナギ", parts: PARTS }] });
    expect(mix.characters.map((c) => c.kind)).toEqual(["example", "custom"]);
    expect(mix.characterIds).toEqual(["kinako"]);
  });

  it("旧形式（characterIds だけ）も受ける", async () => {
    const { svc } = setup();
    const t = await svc.createTheme(alice, { ...base, characterIds: ["hakase"] });
    expect(t.characters).toEqual([{ kind: "example", id: "hakase" }]);
    expect(t.characterIds).toEqual(["hakase"]);
  });

  it("古い保存データは characterIds から characters を作って読める", async () => {
    const { svc, store } = setup();
    const t = await makeTheme(svc);
    await store.runTransaction(async (tx) => {
      const old = { ...(await store.get<ThemeDoc>("themes", t.id)) } as Partial<ThemeDoc>;
      delete old.characters;
      tx.set("themes", t.id, old);
    });
    const list = await svc.listThemes();
    expect(list[0]?.characters).toEqual([
      { kind: "example", id: "mikan" },
      { kind: "example", id: "tetsu" },
    ]);
  });

  it("不正な入力は 400", async () => {
    const { svc } = setup();
    const bad = (characters: unknown) => expectApiError(svc.createTheme(alice, { ...base, characters }), 400);
    await bad([{ ...CUSTOM, parts: { ...PARTS, hairColor: "rainbow" } }]);
    await bad([{ ...CUSTOM, parts: { hairStyle: "bob" } }]);
    await bad([{ ...CUSTOM, name: "あ".repeat(21) }]);
    await bad([{ ...CUSTOM, name: "  " }]);
    await bad([{ ...CUSTOM, note: "あ".repeat(81) }]);
    await bad([CUSTOM, CUSTOM, CUSTOM]);
    await bad(["mikan", "tetsu", "kinako"]);
    await bad(["mikan", "mikan"]);
    await bad(["nobody"]);
    await bad([]);
    // 境界（名前20字・note80字）は通る
    await svc.createTheme(alice, { ...base, characters: [{ ...CUSTOM, name: "あ".repeat(20), note: "い".repeat(80) }] });
    // 同じパーツのキャラを2体はよい（例の重複だけ不可）
    await svc.createTheme(alice, { ...base, characters: [CUSTOM, CUSTOM] });
  });

  it("名前・作品名に改行などの制御文字があれば 400、普通の空白は通る", async () => {
    const { svc } = setup();
    for (const bad of ["ソラ\n秘密", "ソラ\r秘密", "ソラ\t秘密", "ソラ 秘密", "ソラ\u0000秘密"]) {
      await expectApiError(svc.createTheme(alice, { ...base, characters: [{ ...CUSTOM, name: bad }] }), 400);
      await expectApiError(svc.createTheme(alice, { ...base, title: bad, characters: [CUSTOM] }), 400);
    }
    const ok = await svc.createTheme(alice, {
      ...base,
      title: "寝坊 の 町",
      characters: [{ ...CUSTOM, name: "ソラ 太郎" }],
    });
    expect(ok.title).toBe("寝坊 の 町");
    expect(ok.characters[0]).toMatchObject({ name: "ソラ 太郎" });
    expect(() => validateRenameInput({ title: "a\nb" })).toThrow(ApiError);
    expect(validateRenameInput({ title: " 新しい 名前 " })).toBe("新しい 名前");
  });

  it("文チェックにキャラ名と自由記入が渡り、NG なら作られない", async () => {
    const seen: string[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async (t) => (seen.push(t), t.includes("NG") ? { ok: false, reason: "だめ" } : { ok: true }),
      generate: async () => ({ status: "failed", reason: "使わない" }),
    };
    const { svc } = setup({ generator: gen });
    await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    expect(seen).toHaveLength(1);
    for (const w of ["寝坊の町", "いつも寝坊する町", "ソラ", "丸い眼鏡をかけている"]) expect(seen[0]).toContain(w);
    await expectApiError(svc.createTheme(alice, { ...base, characters: [{ ...CUSTOM, note: "NGな特徴" }] }), 400);
    await expectApiError(svc.createTheme(alice, { ...base, characters: [{ ...CUSTOM, name: "NG" }] }), 400);
  });

  it("文チェックにパーツの見た目も渡る（パーツだけ変えても確かめる文が変わる）", async () => {
    const seen: string[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async (t) => (seen.push(t), { ok: true }),
      generate: async () => ({ status: "failed", reason: "使わない" }),
    };
    const { svc } = setup({ generator: gen });
    await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await svc.createTheme(alice, { ...base, characters: [{ ...CUSTOM, parts: { ...PARTS, hairStyle: "short" } }] });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("肩までのボブの髪");
    expect(seen[1]).toContain("短く整えた髪");
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("createNode は generator にパーツのキャラの名前・見た目の文・確定した設定画を渡す", async () => {
    const inputs: GenerateInput[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async () => ({ ok: true }),
      generate: async (i, s) => {
        inputs.push(i);
        return new FakeGenerator(0).generate(i, s);
      },
    };
    const { svc } = setup({ generator: gen });
    const t = await svc.createTheme(alice, { ...base, characters: ["mikan", CUSTOM] });
    await svc.confirmSheets(alice, t.id);
    await draw(svc, bob, t.id, 0);
    const chars = inputs[0]!.characters;
    expect(chars.map((c) => c.name)).toEqual(["ミカン", "ソラ"]);
    expect(chars[0]?.sheetPath).toBe("/characters/mikan.png");
    expect(chars[1]?.appearance).toContain("10代の人間");
    expect(chars[1]?.appearance).toContain("丸い眼鏡をかけている");
    expect(chars[1]?.sheetPath).toBeUndefined();
    expect(chars[0]?.sheetImage).toBeUndefined();
    expect(chars[1]?.sheetImage?.mime).toBe("image/svg+xml");
    expect(chars[1]?.sheetImage?.bytes.length).toBeGreaterThan(0);
  });

  describe("確定した設定画を読めないとき", () => {
    for (const mode of ["null", "throw"] as const) {
      it(`images.get が${mode === "null" ? " null を返す" : "例外を投げる"}と、画像 AI を呼ばず failed にして回数は戻さない`, async () => {
        let calls = 0;
        const gen: ComicGenerator = {
          generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
          moderateTheme: async () => ({ ok: true }),
          generate: async (i, s) => {
            calls++;
            return new FakeGenerator(0).generate(i, s);
          },
        };
        const { svc, store, images, clock } = setup({ generator: gen });
        const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
        await svc.confirmSheets(alice, t.id);
        const orig = images.get.bind(images);
        images.get = async () => {
          if (mode === "throw") throw new Error("storage down");
          return null;
        };
        const v = await draw(svc, bob, t.id, 0);
        images.get = orig;
        expect(calls).toBe(0);
        expect(v.status).toBe("failed");
        expect(v.failReason).toBe("キャラの設定画を読めませんでした");
        const n = await store.get<NodeDoc>("nodes", v.nodeId);
        expect(n?.status).toBe("failed");
        expect(n?.failReason).toBe("キャラの設定画を読めませんでした");
        const day = jstDate(clock.t);
        // 設定画の生成（all_ に1）+ このページ（bob_ と all_ に1）。ページ分は戻らない
        expect((await store.get<{ count: number }>("usage", `bob_${day}`))?.count).toBe(1);
        expect((await store.get<{ count: number }>("usage", `all_${day}`))?.count).toBe(2);
      });
    }
  });

  it("山のカードにもキャラの形が付く", async () => {
    const { svc } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await svc.confirmSheets(alice, t.id);
    await draw(svc, bob, t.id, 0);
    const cards = await svc.deck(carol, t.id);
    expect(cards[0]?.characters[0]).toMatchObject({ kind: "custom", name: "ソラ" });
  });
});

describe("2. 描く", () => {
  it("slot 違いは 409・同じ人の2本目は 409", async () => {
    const { svc } = setup();
    const theme = await makeTheme(svc);
    const e1 = await expectApiError(draw(svc, bob, theme.id, 1), 409);
    expect(e1.message).not.toBe("このページにはもう描きました");
    const a = await draw(svc, bob, theme.id, 0);
    expect(a.status).toBe("done");
    expect(a.mine).toBe(true);
    const e2 = await expectApiError(draw(svc, bob, theme.id, 0), 409);
    expect(e2.message).toBe("このページにはもう描きました");
    await svc.confirm(alice, theme.id);
    const e3 = await expectApiError(draw(svc, carol, theme.id, 0), 409);
    expect(e3.message).toBe("このページはもう決まりました");
    // 次のページには同じ人がまた描ける。親は最後の決まったページ・depth はページの通し番号
    const b = await draw(svc, bob, theme.id, 1);
    expect(b.status).toBe("done");
  });

  it("親・ページの番号・生成に渡す物", async () => {
    const inputs: GenerateInput[] = [];
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async () => ({ ok: true }),
      generate: (i, s) => {
        inputs.push(i);
        return new FakeGenerator(0).generate(i, s);
      },
    };
    const { svc, store } = setup({ generator: gen });
    const theme = await svc.createTheme(alice, { ...THEME, artStyle: "gekiga" });
    const p0 = await draw(svc, bob, theme.id, 0);
    await svc.confirm(alice, theme.id);
    const p1 = await draw(svc, carol, theme.id, 1, ["次の朝", "", "", ""]);
    const saved = await store.get<NodeDoc>("nodes", p1.nodeId);
    expect(saved?.parentId).toBe(p0.nodeId);
    expect(saved?.depth).toBe(1);
    expect(saved?.slotOpen).toBe(true);
    expect(inputs[0]?.prevLines).toBeUndefined();
    expect(inputs[0]?.prevImage).toBeUndefined();
    expect(inputs[1]?.themeText).toBe(THEME.text);
    expect(inputs[1]?.title).toBe(THEME.title);
    expect(inputs[1]?.artStyle).toContain("劇画");
    expect(inputs[1]?.position).toEqual({ episode: 1, pageInEpisode: 2 });
    expect(inputs[1]?.prevLines).toEqual(LINES);
    expect(inputs[1]?.prevImage?.mime).toBe("image/svg+xml");
    // 仮の絵の上の端に「第N話 Mページ」
    const svg = new TextDecoder().decode((await svc.getImage(p1.nodeId))!.bytes);
    expect(svg).toContain("第1話 2ページ");
  });

  it("失敗・止められた後は描き直せる", async () => {
    let fail = true;
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async () => ({ ok: true }),
      generate: async (i, s): Promise<GenerateResult> => {
        if (fail) {
          fail = false;
          throw new Error("boom");
        }
        return new FakeGenerator(0).generate(i, s);
      },
    };
    const { svc, clock } = setup({ generator: gen });
    const theme = await makeTheme(svc);
    const a = await draw(svc, bob, theme.id, 0);
    expect(a.status).toBe("failed");
    clock.t += 1; // 同じ時刻だと並びが id 次第になるので、描いた順を時刻で分ける
    const r = await draw(svc, bob, theme.id, 0, ["NGワード", "", "", ""]);
    expect(r.status).toBe("rejected");
    clock.t += 1;
    const b = await draw(svc, bob, theme.id, 0);
    expect(b.status).toBe("done");
    const d = await svc.getTheme(theme.id, bob);
    expect(d.slot.candidates.map((c) => c.status)).toEqual(["failed", "rejected", "done"]);
    expect(d.slot.doneCount).toBe(1);
  });

  it("同じ nodeId で2回 → 1本だけ・回数は1だけ増える・他人が同じ nodeId なら 409", async () => {
    const { svc, store, clock } = setup();
    const theme = await makeTheme(svc);
    const nodeId = crypto.randomUUID();
    const body = { nodeId, themeId: theme.id, slot: 0, lines: LINES };
    const [a, b] = await Promise.all([svc.createNode(bob, body), svc.createNode(bob, body)]);
    expect(a.nodeId).toBe(nodeId);
    expect(b.nodeId).toBe(nodeId);
    const detail = await svc.getTheme(theme.id, bob);
    expect(detail.slot.candidates).toHaveLength(1);
    const day = new Date(clock.t + 9 * 3600 * 1000).toISOString().slice(0, 10);
    expect((await store.get<{ count: number }>("usage", `bob_${day}`))?.count).toBe(1);
    expect((await store.get<{ count: number }>("usage", `all_${day}`))?.count).toBe(1);
    await expectApiError(svc.createNode(carol, body), 409);
  });
});

describe("3. 山", () => {
  it("自分の候補・評価済み・done でない物は出ない。themeId で絞れる。前のページが付く", async () => {
    const { svc, store } = setup();
    const t1 = await makeTheme(svc);
    const t2 = await svc.createTheme(dave, { ...THEME, title: "別の作品" });
    const b1 = await draw(svc, bob, t1.id, 0);
    const c1 = await draw(svc, carol, t1.id, 0);
    const b2 = await draw(svc, bob, t2.id, 0);
    store._put("nodes", "gen", { ...node({ id: "gen", themeId: t1.id, status: "generating", deadlineAt: Number.MAX_SAFE_INTEGER, doneAt: null }) });
    store._put("nodes", "bad", { ...node({ id: "bad", themeId: t1.id, status: "failed", doneAt: null }) });

    const all = await svc.deck(alice);
    expect(all.map((c) => c.nodeId).sort()).toEqual([b1.nodeId, c1.nodeId, b2.nodeId].sort());
    const onlyT1 = await svc.deck(alice, t1.id);
    expect(onlyT1.map((c) => c.nodeId).sort()).toEqual([b1.nodeId, c1.nodeId].sort());
    const card = onlyT1[0]!;
    expect(card.themeTitle).toBe(THEME.title);
    expect(card.episode).toBe(1);
    expect(card.pageInEpisode).toBe(1);
    expect(card.prevPage).toBeNull();
    expect(card.imageUrl).toBe(`/api/images/${card.nodeId}`);
    expect(JSON.stringify(all)).not.toContain("likes");

    // bob には自分の候補が出ない
    expect((await svc.deck(bob)).map((c) => c.nodeId)).toEqual([c1.nodeId]);
    // 評価すると出ない
    await svc.vote(alice, { nodeId: b1.nodeId, like: true });
    expect((await svc.deck(alice, t1.id)).map((c) => c.nodeId)).toEqual([c1.nodeId]);

    // 決まった後は次のページの候補だけ。前のページが付く
    await svc.confirm(alice, t1.id);
    expect(await svc.deck(alice, t1.id)).toEqual([]);
    const c2 = await draw(svc, carol, t1.id, 1);
    const next = await svc.deck(alice, t1.id);
    expect(next.map((c) => c.nodeId)).toEqual([c2.nodeId]);
    expect(next[0]?.prevPage).toEqual({ imageUrl: `/api/images/${b1.nodeId}`, lines: LINES });
    expect(next[0]?.pageInEpisode).toBe(2);
  });

  it("最大20枚・順はばらばら", async () => {
    const { svc } = setup({ config: { limitGlobal: 1000 } });
    const theme = await makeTheme(svc);
    for (let i = 0; i < 25; i++) await draw(svc, { uid: `u${i}`, name: `u${i}` }, theme.id, 0);
    const orders = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const cards = await svc.deck(alice);
      expect(cards).toHaveLength(20);
      orders.add(cards.map((c) => c.nodeId).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("4. 票", () => {
  it("いいね/いまいち・2回目 409・自分の候補 400・done でない 400", async () => {
    const { svc, store } = setup();
    const theme = await makeTheme(svc);
    const b = await draw(svc, bob, theme.id, 0);
    const liked = await svc.vote(alice, { nodeId: b.nodeId, like: true });
    expect(liked.likes).toBe(1);
    expect(liked.myVote).toEqual({ like: true, reason: null });
    const noped = await svc.vote(carol, { nodeId: b.nodeId, like: false });
    expect(noped.likes).toBe(1);
    expect(noped.myVote).toEqual({ like: false, reason: null });
    expect((await store.get<NodeDoc>("nodes", b.nodeId))?.nopes).toBe(1);
    await expectApiError(svc.vote(alice, { nodeId: b.nodeId, like: false }), 409);
    await expectApiError(svc.vote(bob, { nodeId: b.nodeId, like: true }), 400);
    await expectApiError(svc.vote(alice, { nodeId: b.nodeId, like: "yes" }), 400);
    store._put("nodes", "gen", { ...node({ id: "gen", themeId: theme.id, status: "generating", deadlineAt: Number.MAX_SAFE_INTEGER }) });
    await expectApiError(svc.vote(alice, { nodeId: "gen", like: true }), 400);
    await expectApiError(svc.vote(alice, { nodeId: "none", like: true }), 404);
  });

  it("理由の付け直しで数が合う・いまいちには付けられない", async () => {
    const { svc, store } = setup();
    const theme = await makeTheme(svc);
    const b = await draw(svc, bob, theme.id, 0);
    await svc.vote(alice, { nodeId: b.nodeId, like: true });
    await svc.vote(carol, { nodeId: b.nodeId, like: false });
    let v = await svc.setReason(alice, { nodeId: b.nodeId, reason: "hiki" });
    expect(v.reasons).toEqual({ hiki: 1, igai: 0, chara: 0, e: 0 });
    v = await svc.setReason(alice, { nodeId: b.nodeId, reason: "e" });
    expect(v.reasons).toEqual({ hiki: 0, igai: 0, chara: 0, e: 1 });
    expect(v.myVote).toEqual({ like: true, reason: "e" });
    v = await svc.setReason(alice, { nodeId: b.nodeId, reason: "e" });
    expect(v.reasons?.e).toBe(1);
    await expectApiError(svc.setReason(carol, { nodeId: b.nodeId, reason: "hiki" }), 400);
    await expectApiError(svc.setReason(dave, { nodeId: b.nodeId, reason: "hiki" }), 404);
    await expectApiError(svc.setReason(alice, { nodeId: b.nodeId, reason: "bad" }), 400);
    expect((await store.get<VoteDoc>("votes", `${b.nodeId}_alice`))?.reason).toBe("e");
  });

  it("戻すと数が戻り、山にまた出る。決まった後は戻せない", async () => {
    const { svc, store } = setup();
    const theme = await makeTheme(svc);
    const b = await draw(svc, bob, theme.id, 0);
    await svc.vote(alice, { nodeId: b.nodeId, like: true });
    await svc.setReason(alice, { nodeId: b.nodeId, reason: "chara" });
    await svc.vote(carol, { nodeId: b.nodeId, like: false });
    const back = await svc.unvote(alice, b.nodeId);
    expect(back.myVote).toBeNull();
    expect(back.likes).toBeNull(); // 評価していないので隠れる
    let saved = await store.get<NodeDoc>("nodes", b.nodeId);
    expect(saved?.likes).toBe(0);
    expect(saved?.reasons).toEqual(emptyReasons());
    expect(await store.get("votes", `${b.nodeId}_alice`)).toBeNull();
    expect((await svc.deck(alice)).map((c) => c.nodeId)).toEqual([b.nodeId]);
    await svc.unvote(carol, b.nodeId);
    saved = await store.get<NodeDoc>("nodes", b.nodeId);
    expect(saved?.nopes).toBe(0);
    await expectApiError(svc.unvote(carol, b.nodeId), 404);
    // また評価できる
    await svc.vote(alice, { nodeId: b.nodeId, like: false });
    await svc.confirm(alice, theme.id);
    await expectApiError(svc.unvote(alice, b.nodeId), 400);
    await expectApiError(svc.vote(carol, { nodeId: b.nodeId, like: true }), 400);
    expect((await store.get<NodeDoc>("nodes", b.nodeId))?.nopes).toBe(1);
  });
});

describe("5. 決まる条件", () => {
  it("決まる時刻を過ぎた後に戻そうとしても、先に決まって戻せない", async () => {
    const { svc, clock } = setup();
    const theme = await makeTheme(svc);
    const start = clock.t;
    const b = await draw(svc, bob, theme.id, 0);
    await svc.vote(alice, { nodeId: b.nodeId, like: true });
    clock.t = start + 1800 * SEC;
    await expectApiError(svc.unvote(alice, b.nodeId), 400);
    const d = await svc.getTheme(theme.id, alice);
    expect(d.pages[0]?.nodeId).toBe(b.nodeId);
  });

  it("① 2本以上で最初の完成から5分。それより前は決まらない", async () => {
    const { svc, clock } = setup();
    const theme = await makeTheme(svc);
    const start = clock.t;
    const b = await draw(svc, bob, theme.id, 0);
    clock.t += 60 * SEC;
    await draw(svc, carol, theme.id, 0);
    let d = await svc.getTheme(theme.id, alice);
    expect(d.slot.autoConfirmAt).toBe(start + 300 * SEC);
    clock.t = start + 299 * SEC;
    d = await svc.getTheme(theme.id, alice);
    expect(d.theme.pageCount).toBe(0);
    clock.t = start + 300 * SEC;
    d = await svc.getTheme(theme.id, null);
    expect(d.theme.pageCount).toBe(1);
    expect(d.pages[0]?.nodeId).toBe(b.nodeId); // 同数なら早い方
    expect(d.slot.index).toBe(1);
    expect(d.slot.autoConfirmAt).toBeNull();
    expect(d.theme.slot).toEqual({ episode: 1, pageInEpisode: 2, doneCount: 0 });
  });

  it("② 1本だけなら30分。5分では決まらない", async () => {
    const { svc, clock } = setup();
    const theme = await makeTheme(svc);
    const start = clock.t;
    await draw(svc, bob, theme.id, 0);
    expect((await svc.getTheme(theme.id, alice)).slot.autoConfirmAt).toBe(start + 1800 * SEC);
    clock.t = start + 600 * SEC;
    expect((await svc.getTheme(theme.id, alice)).theme.pageCount).toBe(0);
    clock.t = start + 1800 * SEC;
    expect((await svc.getTheme(theme.id, alice)).theme.pageCount).toBe(1);
  });

  it("①② は山・描く・票の前にも確かめる。一覧では決めない", async () => {
    const { svc, clock, store } = setup();
    const theme = await makeTheme(svc);
    const start = clock.t;
    const b = await draw(svc, bob, theme.id, 0);
    clock.t += 1; // 票が同じなら早く描いた bob が勝つ（同じ時刻だと id 次第になる）
    await draw(svc, carol, theme.id, 0);
    clock.t = start + 300 * SEC;
    expect((await svc.listThemes())[0]?.pageCount).toBe(0);
    expect((await svc.listThemes())[0]?.slot.doneCount).toBe(2);
    // 票の前に決まるので、決まった後の票として 400
    await expectApiError(svc.vote(alice, { nodeId: b.nodeId, like: true }), 400);
    expect((await store.get<ThemeDoc>("themes", theme.id))?.confirmed).toEqual([b.nodeId]);
    expect((await svc.listThemes())[0]?.slot).toEqual({ episode: 1, pageInEpisode: 2, doneCount: 0 });

    // 山の前に決まる
    const t2 = await makeTheme(svc);
    const s2 = clock.t;
    await draw(svc, bob, t2.id, 0);
    clock.t = s2 + 1800 * SEC;
    expect(await svc.deck(alice, t2.id)).toEqual([]);
    expect((await store.get<ThemeDoc>("themes", t2.id))?.confirmed).toHaveLength(1);

    // 描く前に決まるので、古い slot は 409
    const t3 = await makeTheme(svc);
    const s3 = clock.t;
    await draw(svc, bob, t3.id, 0);
    clock.t = s3 + 1800 * SEC;
    const e = await expectApiError(draw(svc, carol, t3.id, 0), 409);
    expect(e.message).toBe("このページはもう決まりました");
  });

  it("③ 始めた人の confirm。候補が無ければ 400・始めた人以外は 403", async () => {
    const { svc, store } = setup();
    const theme = await makeTheme(svc);
    await expectApiError(svc.confirm(alice, theme.id), 400);
    store._put("nodes", "gen", { ...node({ id: "gen", themeId: theme.id, status: "generating", deadlineAt: Number.MAX_SAFE_INTEGER, doneAt: null }) });
    await expectApiError(svc.confirm(alice, theme.id), 400);
    const b = await draw(svc, bob, theme.id, 0);
    expect((await svc.getTheme(theme.id, alice)).slot.canConfirm).toBe(true);
    expect((await svc.getTheme(theme.id, bob)).slot.canConfirm).toBe(false);
    await expectApiError(svc.confirm(bob, theme.id), 403);
    await expectApiError(svc.confirm(alice, "none"), 404);
    const d = await svc.confirm(alice, theme.id);
    expect(d.theme.mine).toBe(true);
    expect(d.pages.map((p) => p.nodeId)).toEqual([b.nodeId]);
    expect(d.theme.coverUrl).toBe(`/api/images/${b.nodeId}`);
    // 募集中だった候補は全部締まる（generating のままの物も）
    expect((await store.get<NodeDoc>("nodes", b.nodeId))?.slotOpen).toBe(false);
    expect((await store.get<NodeDoc>("nodes", "gen"))?.slotOpen).toBe(false);
    expect(d.slot.candidates).toEqual([]);
  });

  it("決まった後に完成した generating は書き込まれない", async () => {
    const holder: { svc?: Svc } = {};
    let first = true;
    const gen: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async () => ({ ok: true }),
      generate: async (i, s): Promise<GenerateResult> => {
        if (first) {
          first = false;
          // 生成の途中で、別の候補でページが決まる
          await draw(holder.svc!, carol, themeId, 0);
          await holder.svc!.confirm(alice, themeId);
        }
        return new FakeGenerator(0).generate(i, s);
      },
    };
    const { svc, store } = setup({ generator: gen });
    holder.svc = svc;
    const themeId = (await makeTheme(svc)).id;
    const b = await draw(svc, bob, themeId, 0);
    expect(b.status).toBe("generating");
    const saved = await store.get<NodeDoc>("nodes", b.nodeId);
    expect(saved?.slotOpen).toBe(false);
    expect(saved?.imagePath).toBeNull();
    expect((await store.get<ThemeDoc>("themes", themeId))?.slotDoneCount).toBe(0);
  });
});

describe("6. 勝ちの順", () => {
  it("いいね数 → 割合 → 早さ → id", () => {
    expect(
      pickWinner([
        node({ id: "a", likes: 2, nopes: 5, createdAt: 2 }),
        node({ id: "b", likes: 1, nopes: 0, createdAt: 1 }),
        node({ id: "c", likes: 9, status: "failed" }),
      ])?.id,
    ).toBe("a");
    expect(
      pickWinner([node({ id: "a", likes: 1, nopes: 1, createdAt: 1 }), node({ id: "b", likes: 1, nopes: 0, createdAt: 2 })])?.id,
    ).toBe("b");
    expect(
      pickWinner([node({ id: "a", likes: 0, nopes: 0, createdAt: 1 }), node({ id: "b", likes: 0, nopes: 3, createdAt: 0 })])?.id,
    ).toBe("b"); // 0票の割合は0なので、早い方
    expect(
      pickWinner([node({ id: "b", likes: 1, nopes: 0, createdAt: 5 }), node({ id: "a", likes: 1, nopes: 0, createdAt: 5 })])?.id,
    ).toBe("a");
    expect(pickWinner([node({ status: "generating" })])).toBeNull();
  });

  it("サービス経由: 後から描いた方でもいいねが多ければ勝つ", async () => {
    const { svc, clock } = setup();
    const theme = await makeTheme(svc);
    await draw(svc, bob, theme.id, 0);
    clock.t += SEC;
    const c = await draw(svc, carol, theme.id, 0);
    await svc.vote(alice, { nodeId: c.nodeId, like: true });
    await svc.vote(dave, { nodeId: c.nodeId, like: false });
    const d = await svc.confirm(alice, theme.id);
    expect(d.pages[0]?.nodeId).toBe(c.nodeId);
  });
});

describe("7. 4ページで1話", () => {
  it("pagePosition の値", () => {
    expect(pagePosition(0)).toEqual({ episode: 1, pageInEpisode: 1 });
    expect(pagePosition(3)).toEqual({ episode: 1, pageInEpisode: 4 });
    expect(pagePosition(4)).toEqual({ episode: 2, pageInEpisode: 1 });
    expect(pagePosition(7)).toEqual({ episode: 2, pageInEpisode: 4 });
    expect(pagePosition(8)).toEqual({ episode: 3, pageInEpisode: 1 });
  });

  it("4ページ決まると completedEpisodes=1、次は第2話1ページ目", async () => {
    const { svc } = setup();
    const theme = await makeTheme(svc);
    const ids: string[] = [];
    for (let slot = 0; slot < 4; slot++) {
      const n = await draw(svc, slot % 2 ? carol : bob, theme.id, slot, [`${slot + 1}ページ目`, "", "", ""]);
      ids.push(n.nodeId);
      const d = await svc.confirm(alice, theme.id);
      expect(d.theme.pageCount).toBe(slot + 1);
    }
    const d = await svc.getTheme(theme.id, alice);
    expect(d.theme.completedEpisodes).toBe(1);
    expect(d.theme.slot).toEqual({ episode: 2, pageInEpisode: 1, doneCount: 0 });
    expect(d.slot).toMatchObject({ index: 4, episode: 2, pageInEpisode: 1 });
    expect(d.pages.map((p) => [p.episode, p.pageInEpisode])).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
    ]);
    expect(d.pages.map((p) => p.nodeId)).toEqual(ids);
    const listed = (await svc.listThemes())[0];
    expect(listed?.completedEpisodes).toBe(1);
    expect(listed?.pageCount).toBe(4);
    // 第2話1ページ目の前のページは第1話4ページ目
    const n5 = await draw(svc, bob, theme.id, 4);
    const card = (await svc.deck(alice)).find((c) => c.nodeId === n5.nodeId);
    expect(card?.episode).toBe(2);
    expect(card?.pageInEpisode).toBe(1);
    expect(card?.prevPage?.lines[0]).toBe("4ページ目");
  });
});

describe("8. 票数を隠す", () => {
  it("評価前は出ない・null、評価後は数字、自分の候補は見える", async () => {
    const { svc } = setup();
    const theme = await makeTheme(svc);
    const b = await draw(svc, bob, theme.id, 0);
    await svc.vote(carol, { nodeId: b.nodeId, like: true });
    await svc.setReason(carol, { nodeId: b.nodeId, reason: "igai" });

    const before = await svc.getTheme(theme.id, alice);
    expect(before.slot.candidates).toEqual([]);
    expect(before.slot.toSwipeCount).toBe(1);
    expect(before.slot.doneCount).toBe(1);
    const anon = await svc.getTheme(theme.id, null);
    expect(anon.slot.candidates).toEqual([]);
    expect(anon.theme.mine).toBe(false);

    const own = await svc.getTheme(theme.id, bob);
    expect(own.slot.candidates[0]?.mine).toBe(true);
    expect(own.slot.candidates[0]?.likes).toBe(1);
    expect(own.slot.candidates[0]?.reasons).toEqual({ hiki: 0, igai: 1, chara: 0, e: 0 });
    expect(own.slot.toSwipeCount).toBe(0);

    await svc.vote(alice, { nodeId: b.nodeId, like: false });
    const after = await svc.getTheme(theme.id, alice);
    expect(after.slot.candidates[0]?.likes).toBe(1);
    expect(after.slot.candidates[0]?.reasons?.igai).toBe(1);
    expect(after.slot.candidates[0]?.myVote).toEqual({ like: false, reason: null });
    expect(after.slot.toSwipeCount).toBe(0);
    const undone = await svc.unvote(alice, b.nodeId);
    expect(undone.likes).toBeNull();
    expect(undone.reasons).toBeNull();

    // panels・authorUid は出さない
    const raw = JSON.stringify([after, own, await svc.deck(dave)]);
    expect(raw).not.toContain("panels");
    expect(raw).not.toContain("authorUid");
    expect(raw).not.toContain("コマ1:");
  });
});

describe("9. 上限", () => {
  it("1人11回目は 429", async () => {
    const { svc } = setup({ config: { limitPerUser: 10 } });
    const themes = [];
    for (let i = 0; i < 11; i++) themes.push(await makeTheme(svc));
    for (let i = 0; i < 10; i++) await draw(svc, bob, themes[i]!.id, 0);
    await expectApiError(draw(svc, bob, themes[10]!.id, 0), 429);
    // 別の人はまだ作れる
    expect((await draw(svc, carol, themes[10]!.id, 0)).status).toBe("done");
  });

  it("全体の上限でも 429", async () => {
    const { svc } = setup({ config: { limitGlobal: 3 } });
    const theme = await makeTheme(svc);
    for (const u of [alice, bob, carol]) await draw(svc, u, theme.id, 0);
    const err = await expectApiError(draw(svc, dave, theme.id, 0), 429);
    expect(err.message).toContain("全体");
  });
});

describe("10. 期限切れ", () => {
  it("deadlineAt を過ぎた generating は GET で failed に見え、次の書き込みで保存される・描き直せる", async () => {
    const { svc, store, clock } = setup();
    const theme = await makeTheme(svc);
    store._put("nodes", "old", {
      ...node({ id: "old", themeId: theme.id, status: "generating", deadlineAt: clock.t + 1000, imagePath: null, authorUid: "bob", doneAt: null }),
    });
    expect((await svc.getTheme(theme.id, bob)).slot.candidates[0]?.status).toBe("generating");
    await expectApiError(draw(svc, bob, theme.id, 0), 409);
    clock.t += 2000;
    const d = await svc.getTheme(theme.id, bob);
    expect(d.slot.candidates[0]?.status).toBe("failed");
    expect(d.slot.candidates[0]?.failReason).toBe("時間切れ");
    expect((await store.get<NodeDoc>("nodes", "old"))?.status).toBe("generating"); // GET では保存しない
    expect((await draw(svc, bob, theme.id, 0)).status).toBe("done");
    expect((await store.get<NodeDoc>("nodes", "old"))?.status).toBe("failed");
  });

  it("期限後に届いた完成は書き込まれない", async () => {
    const holder: { clock?: { t: number } } = {};
    const slow: ComicGenerator = {
      generateSheet: (i, s) => new FakeGenerator(0).generateSheet(i, s),
      moderateTheme: async () => ({ ok: true }),
      generate: async (input, signal): Promise<GenerateResult> => {
        holder.clock!.t += 200_000; // 期限（120秒）を過ぎてから返る
        return new FakeGenerator(0).generate(input, signal);
      },
    };
    const { svc, store, clock } = setup({ generator: slow });
    holder.clock = clock;
    const theme = await makeTheme(svc);
    const n = await draw(svc, bob, theme.id, 0);
    expect(n.status).toBe("failed");
    expect(n.failReason).toBe("時間切れ");
    const saved = await store.get<NodeDoc>("nodes", n.nodeId);
    expect(saved?.status).toBe("generating");
    expect(saved?.imagePath).toBeNull();
    expect(await store.get("nodePrivate", n.nodeId)).toBeNull();
    expect(await svc.getImage(n.nodeId)).toBeNull();
    expect((await store.get<ThemeDoc>("themes", theme.id))?.slotDoneCount).toBe(0);
  });
});

describe("11. rejected と画像", () => {
  it("lines に NG → rejected と理由", async () => {
    const { svc } = setup();
    const theme = await makeTheme(svc);
    const n = await draw(svc, bob, theme.id, 0, ["NGワード", "", "", ""]);
    expect(n.status).toBe("rejected");
    expect(n.failReason).toBeTruthy();
    expect(n.imageUrl).toBeNull();
  });

  it("done なら画像が読め、panels は nodePrivate にだけある", async () => {
    const { svc, store } = setup();
    const theme = await makeTheme(svc);
    const n = await draw(svc, bob, theme.id, 0);
    expect(n.imageUrl).toBe(`/api/images/${n.nodeId}`);
    const img = await svc.getImage(n.nodeId);
    expect(img?.mime).toBe("image/svg+xml");
    const svg = new TextDecoder().decode(img!.bytes);
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="768"');
    expect(svg).toContain("ミカン");
    expect(svg).toContain("テツが迎えに来た");
    expect(svg).toContain("第1話 1ページ");
    expect((await store.get<{ panels: string[] }>("nodePrivate", n.nodeId))?.panels).toHaveLength(4);
  });
});

describe("12. 抜け道", () => {
  const verifyIdToken = async () => {
    throw new Error("呼ばれないはず");
  };
  const headers = new Headers({ "x-dev-user": "alice" });

  it("NODE_ENV=production では x-dev-user が効かない", async () => {
    expect(await resolveUser(headers, { dataBackend: "memory", nodeEnv: "production", verifyIdToken })).toBeNull();
  });

  it("firestore では x-dev-user が効かない", async () => {
    expect(await resolveUser(headers, { dataBackend: "firestore", nodeEnv: "development", verifyIdToken })).toBeNull();
  });

  it("memory かつ production 以外では効く", async () => {
    expect(await resolveUser(headers, { dataBackend: "memory", nodeEnv: "development", verifyIdToken })).toEqual({
      uid: "alice",
      name: "alice",
    });
  });

  it("不正なトークンは 401", async () => {
    await expectApiError(
      resolveUser(new Headers({ authorization: "Bearer bad" }), { dataBackend: "firestore", nodeEnv: "production", verifyIdToken }),
      401,
    );
  });
});

describe("ApiError の見分け", () => {
  it("別のバンドルから来た同じ形の物も ApiError として扱う", async () => {
    const { isApiError } = await import("./types");
    expect(isApiError(new ApiError(409, "x"))).toBe(true);
    expect(isApiError(Object.assign(new Error("x"), { name: "ApiError", status: 409 }))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
  });
});

describe("11. 設定画", () => {
  const base = { title: "寝坊の町", text: "いつも寝坊する町", artStyle: "standard" };
  const usageOf = async (store: MemoryStore, key: string) =>
    (await store.get<{ count: number }>("usage", key))?.count ?? 0;
  const today = (clock: { t: number }) => jstDate(clock.t);

  /** 設定画を失敗させる generator。fail の間は failed を返す */
  function flaky() {
    const state = { fail: true, sheetCalls: 0 };
    const fake = new FakeGenerator(0);
    const gen: ComicGenerator = {
      moderateTheme: (t) => fake.moderateTheme(t),
      generate: (i, s) => fake.generate(i, s),
      generateSheet: async (i, s) => {
        state.sheetCalls++;
        return state.fail ? { status: "failed", reason: "設定画を作れませんでした" } : fake.generateSheet(i, s);
      },
    };
    return { gen, state };
  }

  it("例だけの作品は作成時から確定済みで、設定画は作らずすぐ描ける", async () => {
    const { svc, store, clock } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: ["mikan"] });
    expect(t.sheetsConfirmed).toBe(true);
    expect(t.sheetRetriesLeft).toBe(2);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(0);
    expect((await draw(svc, bob, t.id, 0)).status).toBe("done");
  });

  it("パーツの作品は作成時に設定画が作られ、確定前の POST /api/nodes は 409、確定後は描ける", async () => {
    const { svc, store, clock } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: ["mikan", CUSTOM] });
    expect(t.sheetsConfirmed).toBe(false);
    expect(t.sheetRetriesLeft).toBe(2);
    const c = t.characters[1]!;
    expect(c).toMatchObject({ kind: "custom", sheetStatus: "done" });
    const saved = await store.get<ThemeDoc>("themes", t.id);
    const sc = saved!.characters[1]!;
    const sheetPath = sc.kind === "custom" ? sc.sheetPath : "";
    expect(c.kind === "custom" && c.sheetUrl).toBe(
      `/api/themes/${t.id}/sheets/${sc.kind === "custom" ? sc.id : ""}?v=${encodeURIComponent(sheetPath ?? "")}`,
    );
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(1);
    const err = await expectApiError(draw(svc, bob, t.id, 0), 409);
    expect(err.message).toBe("設定画の確認が終わるまで描けません");

    const detail = await svc.confirmSheets(alice, t.id);
    expect(detail.theme.sheetsConfirmed).toBe(true);
    expect((await draw(svc, bob, t.id, 0)).status).toBe("done");
  });

  it("設定画の画像は誰でも見られる。できていないキャラ・知らない作品は null", async () => {
    const { svc, store } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    const id = (await store.get<ThemeDoc>("themes", t.id))!.characters[0]!;
    const cid = id.kind === "custom" ? id.id : "";
    expect((await svc.getSheetImage(t.id, cid))?.mime).toBe("image/svg+xml");
    expect(await svc.getSheetImage(t.id, "nope")).toBeNull();
    expect(await svc.getSheetImage("nope", cid)).toBeNull();
  });

  it("確定は本人だけ・全部 done の時だけ", async () => {
    const { gen, state } = flaky();
    const { svc } = setup({ generator: gen });
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    expect(t.characters[0]).toMatchObject({ sheetStatus: "failed", sheetUrl: null });
    await expectApiError(svc.confirmSheets(alice, t.id), 409);
    state.fail = false;
    await svc.retrySheets(alice, t.id, undefined);
    await expectApiError(svc.confirmSheets(bob, t.id), 403);
    await expectApiError(svc.confirmSheets(alice, "nope"), 404);
    expect((await svc.confirmSheets(alice, t.id)).theme.sheetsConfirmed).toBe(true);
  });

  it("生成失敗時は sheetStatus failed で作品は残り、描き直せる", async () => {
    const { gen, state } = flaky();
    const { svc, store } = setup({ generator: gen });
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    expect(t.characters[0]).toMatchObject({ kind: "custom", sheetStatus: "failed" });
    const saved = await store.get<ThemeDoc>("themes", t.id);
    const sc = saved!.characters[0]!;
    expect(sc.kind === "custom" && sc.sheetFailReason).toBe("設定画を作れませんでした");
    expect(sc.kind === "custom" && sc.sheetPath).toBeNull();
    state.fail = false;
    const d = await svc.retrySheets(alice, t.id, {});
    expect(d.theme.characters[0]).toMatchObject({ sheetStatus: "done" });
    expect(d.theme.sheetRetriesLeft).toBe(1);
  });

  it("描き直しは2回まで（3回目 409）・本人だけ・確定後は 409。1回の押下で何体でも1回", async () => {
    const { svc, store, clock } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM, { ...CUSTOM, name: "ナギ" }] });
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(2);
    await expectApiError(svc.retrySheets(bob, t.id, {}), 403);
    await expectApiError(svc.retrySheets(alice, "nope", {}), 404);
    await expectApiError(svc.retrySheets(alice, t.id, { characterId: "nope" }), 404);
    await expectApiError(svc.retrySheets(alice, t.id, { characterId: 1 }), 400);

    const d1 = await svc.retrySheets(alice, t.id, {}); // 2体ぶん＝2枚、でも1回
    expect(d1.theme.sheetRetriesLeft).toBe(1);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(4);
    const first = (await store.get<ThemeDoc>("themes", t.id))!.characters[0]!;
    const d2 = await svc.retrySheets(alice, t.id, { characterId: first.kind === "custom" ? first.id : "" });
    expect(d2.theme.sheetRetriesLeft).toBe(0);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(5);
    const err = await expectApiError(svc.retrySheets(alice, t.id, {}), 409);
    expect(err.message).toBe("描き直しは2回までです");

    const t2 = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await svc.confirmSheets(alice, t2.id);
    await expectApiError(svc.retrySheets(alice, t2.id, {}), 409);
  });

  it("失敗した回は描き直しの回数を使わず、全体の usage は描いた枚数ぶん増える。成功した回は1回使う", async () => {
    const { gen, state } = flaky();
    const { svc, store, clock } = setup({ generator: gen });
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] }); // 失敗、usage 1
    expect(t.sheetRetriesLeft).toBe(2);
    const d1 = await svc.retrySheets(alice, t.id, {});
    expect(d1.theme.characters[0]).toMatchObject({ sheetStatus: "failed" });
    expect(d1.theme.sheetRetriesLeft).toBe(2);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(2);
    state.fail = false;
    const d2 = await svc.retrySheets(alice, t.id, {});
    expect(d2.theme.sheetRetriesLeft).toBe(1);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(3);
  });

  it("失敗が続いても何度でも描き直せるが、全体の上限に達すると 429", async () => {
    const { gen } = flaky();
    const { svc } = setup({ generator: gen, config: { limitGlobal: 4 } });
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] }); // usage 1
    for (let i = 0; i < 3; i++) {
      expect((await svc.retrySheets(alice, t.id, {})).theme.sheetRetriesLeft).toBe(2);
    }
    await expectApiError(svc.retrySheets(alice, t.id, {}), 429);
  });

  it("2体のうち1体だけ成功した回は1回使う", async () => {
    const fake = new FakeGenerator(0);
    let calls = 0;
    let partial = false;
    const gen: ComicGenerator = {
      moderateTheme: (t) => fake.moderateTheme(t),
      generate: (i, s) => fake.generate(i, s),
      generateSheet: async (i, s) => {
        if (partial && ++calls === 2) return { status: "failed", reason: "失敗" };
        return fake.generateSheet(i, s);
      },
    };
    const { svc, store } = setup({ generator: gen });
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM, { ...CUSTOM, name: "ナギ" }] });
    const before = (await store.get<ThemeDoc>("themes", t.id))!;
    const pathOf = (doc: ThemeDoc, name: string) => {
      const c = doc.characters.find((x) => x.kind === "custom" && x.name === name);
      return c?.kind === "custom" ? c.sheetPath : null;
    };
    partial = true;
    const d = await svc.retrySheets(alice, t.id, {});
    const saved = (await store.get<ThemeDoc>("themes", t.id))!;
    const nagi = saved.characters.find((c) => c.kind === "custom" && c.name === "ナギ");
    expect(d.theme.characters.map((c) => (c.kind === "custom" ? c.sheetStatus : "")).sort()).toEqual(["done", "done"]);
    expect(pathOf(saved, "ナギ")).toBe(pathOf(before, "ナギ"));
    expect(nagi?.kind === "custom" && nagi.sheetFailReason).toBe("失敗");
    const nagiView = (await svc.getTheme(t.id, alice)).theme.characters.find((c) => c.kind === "custom" && c.name === "ナギ");
    expect(nagiView?.kind === "custom" && nagiView.sheetFailReason).toBe("失敗");
    expect(pathOf(saved, "ソラ")).not.toBe(pathOf(before, "ソラ"));
    expect(d.theme.sheetRetriesLeft).toBe(1);
  });

  it("成功2回のあとは 409", async () => {
    const { svc } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await svc.retrySheets(alice, t.id, {});
    expect((await svc.retrySheets(alice, t.id, {})).theme.sheetRetriesLeft).toBe(0);
    await expectApiError(svc.retrySheets(alice, t.id, {}), 409);
  });

  it("最後の描き直しで1体だけ失敗しても、前の画像で確定できる", async () => {
    const fake = new FakeGenerator(0);
    let hold = false;
    const pending: Array<(result: GenerateSheetResult) => void> = [];
    const gen: ComicGenerator = {
      moderateTheme: (text) => fake.moderateTheme(text),
      generate: (input, signal) => fake.generate(input, signal),
      generateSheet: (input, signal) => {
        if (hold) return new Promise((resolve) => pending.push(resolve));
        return fake.generateSheet(input, signal);
      },
    };
    const { svc, store, images, clock } = setup({ generator: gen });
    const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM, { ...CUSTOM, name: "ナギ" }] });
    await svc.retrySheets(alice, created.id, {});
    const before = (await store.get<ThemeDoc>("themes", created.id))!;
    const previous = new Map(before.characters.flatMap((c) => (c.kind === "custom" ? [[c.name, c] as const] : [])));
    const nagiBefore = previous.get("ナギ");
    const soraBefore = previous.get("ソラ");
    if (!nagiBefore?.sheetPath || !soraBefore?.sheetPath) throw new Error("描き直し前の設定画が無い");
    const usageBefore = await usageOf(store, `all_${today(clock)}`);

    hold = true;
    const redraw = svc.retrySheets(alice, created.id, {});
    for (let i = 0; i < 50 && pending.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending).toHaveLength(2);

    const mid = (await store.get<ThemeDoc>("themes", created.id))!;
    for (const c of mid.characters) {
      if (c.kind !== "custom") continue;
      expect(c.sheetStatus).toBe("generating");
      expect(c.sheetPath).toBe(previous.get(c.name)?.sheetPath);
      expect(await svc.getSheetImage(created.id, c.id)).toBeNull();
    }
    const midView = await svc.getTheme(created.id, alice);
    for (const c of midView.theme.characters) {
      if (c.kind !== "custom") continue;
      expect(c).toMatchObject({ sheetStatus: "generating", sheetUrl: null });
    }
    const blocked = await expectApiError(svc.confirmSheets(alice, created.id), 409);
    expect(blocked.message).toBe("設定画がそろっていません。描き直すか、できあがるまで待ってください");

    const signal = new AbortController().signal;
    pending[0]!(await fake.generateSheet({ character: { name: "ソラ", appearance: "x" } }, signal));
    pending[1]!({ status: "failed", reason: "失敗" });
    const after = await redraw;

    expect(after.theme.sheetRetriesLeft).toBe(0);
    const nagiUrl = `/api/themes/${created.id}/sheets/${nagiBefore.id}?v=${encodeURIComponent(nagiBefore.sheetPath)}`;
    const soraOldUrl = `/api/themes/${created.id}/sheets/${soraBefore.id}?v=${encodeURIComponent(soraBefore.sheetPath)}`;
    expect(after.theme.characters.find((c) => c.kind === "custom" && c.name === "ナギ")).toMatchObject({
      sheetStatus: "done",
      sheetUrl: nagiUrl,
    });
    const soraView = after.theme.characters.find((c) => c.kind === "custom" && c.name === "ソラ");
    expect(soraView).toMatchObject({ kind: "custom", sheetStatus: "done" });
    expect(soraView?.kind === "custom" && soraView.sheetUrl).toBeTruthy();
    expect(soraView?.kind === "custom" && soraView.sheetUrl).not.toBe(soraOldUrl);

    const saved = (await store.get<ThemeDoc>("themes", created.id))!;
    const nagi = saved.characters.find((c) => c.kind === "custom" && c.name === "ナギ");
    const sora = saved.characters.find((c) => c.kind === "custom" && c.name === "ソラ");
    expect(nagi?.kind === "custom" && nagi.sheetStatus).toBe("done");
    expect(nagi?.kind === "custom" && nagi.sheetPath).toBe(nagiBefore.sheetPath);
    expect(nagi?.kind === "custom" && nagi.sheetFailReason).toBe("失敗");
    expect(sora?.kind === "custom" && sora.sheetPath).not.toBe(soraBefore.sheetPath);
    expect(sora?.kind === "custom" && sora.sheetFailReason).toBeNull();

    const kept = await images.get(nagiBefore.sheetPath);
    const read = await svc.getSheetImage(created.id, nagiBefore.id);
    expect(read?.mime).toBe("image/svg+xml");
    expect(read?.bytes).toEqual(kept?.bytes);

    expect((await svc.confirmSheets(alice, created.id)).theme.sheetsConfirmed).toBe(true);
    await expectApiError(svc.retrySheets(alice, created.id, {}), 409);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(usageBefore + 2);
  });

  it("描き直すと前と別の画像の置き場になる", async () => {
    const { svc, store } = setup();
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    const before = t.characters[0];
    const p1 = (await store.get<ThemeDoc>("themes", t.id))!.characters[0]!;
    const retried = await svc.retrySheets(alice, t.id, {});
    const after = retried.theme.characters[0];
    const p2 = (await store.get<ThemeDoc>("themes", t.id))!.characters[0]!;
    expect(p1.kind === "custom" && p1.sheetPath).toBeTruthy();
    expect(p2.kind === "custom" && p2.sheetPath).toBeTruthy();
    expect(p1.kind === "custom" && p1.sheetPath).not.toBe(p2.kind === "custom" && p2.sheetPath);
    expect(before?.kind === "custom" && before.sheetUrl).toBeTruthy();
    expect(after?.kind === "custom" && after.sheetUrl).toBeTruthy();
    expect(before?.kind === "custom" && before.sheetUrl).not.toBe(after?.kind === "custom" && after.sheetUrl);
  });

  it("設定画も全体の上限に数える。足りなければ作品作成が 429 で作品が残らない", async () => {
    const { svc, store, clock } = setup({ config: { limitGlobal: 2 } });
    await svc.createTheme(alice, { ...base, characters: [CUSTOM] }); // 1枚
    const before = (await svc.listThemes()).length;
    const err = await expectApiError(
      svc.createTheme(alice, { ...base, characters: [CUSTOM, { ...CUSTOM, name: "ナギ" }] }), // 2枚＝足りない
      429,
    );
    expect(err.message).toContain("全体");
    expect((await svc.listThemes()).length).toBe(before);
    expect(await usageOf(store, `all_${today(clock)}`)).toBe(1);
    // 1枚なら通る。そのあと描き直しは足りなくて 429
    const t = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await expectApiError(svc.retrySheets(alice, t.id, {}), 429);
    expect((await svc.listThemes()).length).toBe(before + 1);
  });

  it("設定画は1人1日の上限には数えない", async () => {
    const { svc, store, clock } = setup({ config: { limitPerUser: 1 } });
    await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    await svc.createTheme(alice, { ...base, characters: [CUSTOM, { ...CUSTOM, name: "ナギ" }] });
    expect(await usageOf(store, `alice_${today(clock)}`)).toBe(0);
    // ページ生成は1人1回までのまま
    const ex = await svc.createTheme(alice, { ...base, characters: ["mikan"] });
    await draw(svc, alice, ex.id, 0);
    expect(await usageOf(store, `alice_${today(clock)}`)).toBe(1);
  });

  it("並行した描き直しの古い結果は、確定済みの設定画を上書きしない", async () => {
    for (const late of ["done", "failed"] as const) {
      const fake = new FakeGenerator(0);
      let hold = false;
      const pending: Array<(result: GenerateSheetResult) => void> = [];
      const gen: ComicGenerator = {
        moderateTheme: (text) => fake.moderateTheme(text),
        generate: (input, signal) => fake.generate(input, signal),
        generateSheet: (input, signal) => {
          if (!hold) return fake.generateSheet(input, signal);
          return new Promise((resolve) => {
            pending.push(resolve);
          });
        },
      };
      const { svc, store } = setup({ generator: gen });
      const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
      hold = true;
      const redrawA = svc.retrySheets(alice, created.id, {});
      const redrawB = svc.retrySheets(alice, created.id, {});
      for (let i = 0; i < 50 && pending.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(pending).toHaveLength(2);

      const signal = new AbortController().signal;
      const firstDone = await fake.generateSheet({ character: { name: "ソラ", appearance: "b" } }, signal);
      pending[1]!(firstDone);
      await redrawB;
      expect((await svc.confirmSheets(alice, created.id)).theme.sheetsConfirmed).toBe(true);

      const mid = (await store.get<ThemeDoc>("themes", created.id))!.characters[0]!;
      expect(mid.kind).toBe("custom");
      if (mid.kind !== "custom") throw new Error("custom");
      const path = mid.sheetPath;
      expect(mid.sheetStatus).toBe("done");
      expect(path).toBeTruthy();

      if (late === "done") {
        pending[0]!(await fake.generateSheet({ character: { name: "ソラ", appearance: "a" } }, signal));
      } else {
        pending[0]!({ status: "failed", reason: "古い失敗" });
      }
      await redrawA;

      const after = (await store.get<ThemeDoc>("themes", created.id))!;
      const character = after.characters[0]!;
      expect(character.kind === "custom" && character.sheetStatus).toBe("done");
      expect(character.kind === "custom" && character.sheetPath).toBe(path);
      expect(after.sheetsConfirmed).toBe(true);
    }
  });

  it("並行した描き直しでは、最後に始めた生成の結果だけを確定前でも反映する（#75）", async () => {
    for (const bResult of ["done", "failed"] as const) {
      const fake = new FakeGenerator(0);
      let hold = false;
      const pending: Array<(result: GenerateSheetResult) => void> = [];
      const gen: ComicGenerator = {
        moderateTheme: (text) => fake.moderateTheme(text),
        generate: (input, signal) => fake.generate(input, signal),
        generateSheet: (input, signal) => {
          if (!hold) return fake.generateSheet(input, signal);
          return new Promise((resolve) => {
            pending.push(resolve);
          });
        },
      };
      const { svc, store } = setup({ generator: gen });
      const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
      const first = (await store.get<ThemeDoc>("themes", created.id))!.characters[0]!;
      const firstPath = first.kind === "custom" ? first.sheetPath : null;
      hold = true;
      const redrawA = svc.retrySheets(alice, created.id, {});
      const redrawB = svc.retrySheets(alice, created.id, {});
      for (let i = 0; i < 50 && pending.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(pending).toHaveLength(2);

      const signal = new AbortController().signal;
      pending[1]!(
        bResult === "done"
          ? await fake.generateSheet({ character: { name: "ソラ", appearance: "b" } }, signal)
          : { status: "failed", reason: "Bの失敗" },
      );
      await redrawB;
      const mid = (await store.get<ThemeDoc>("themes", created.id))!;
      const midChar = mid.characters[0]!;
      if (midChar.kind !== "custom") throw new Error("custom");
      const bPath = midChar.sheetPath;
      expect(midChar.sheetStatus).toBe("done");
      if (bResult === "done") expect(bPath).not.toBe(firstPath);

      pending[0]!(await fake.generateSheet({ character: { name: "ソラ", appearance: "a" } }, signal));
      await redrawA;

      const after = (await store.get<ThemeDoc>("themes", created.id))!;
      const character = after.characters[0]!;
      if (character.kind !== "custom") throw new Error("custom");
      expect(character.sheetPath).toBe(bPath);
      expect(after.sheetsConfirmed).toBe(false);
      // A は捨てられて戻さない。B が全部失敗のときだけ B の1回が戻る
      expect(after.sheetRetries).toBe(bResult === "done" ? 2 : 1);
    }
  });

  it("期限後に返った設定画の成功は書かない（#76）", async () => {
    const fake = new FakeGenerator(0);
    let hold = false;
    const pending: Array<(result: GenerateSheetResult) => void> = [];
    const gen: ComicGenerator = {
      moderateTheme: (text) => fake.moderateTheme(text),
      generate: (input, signal) => fake.generate(input, signal),
      generateSheet: (input, signal) =>
        hold ? new Promise((resolve) => pending.push(resolve)) : fake.generateSheet(input, signal),
    };
    const { svc, store, clock } = setup({ generator: gen });
    const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    hold = true;
    const redraw = svc.retrySheets(alice, created.id, {});
    for (let i = 0; i < 50 && pending.length < 1; i++) await new Promise((r) => setTimeout(r, 0));
    const before = (await store.get<ThemeDoc>("themes", created.id))!.characters[0]!;
    if (before.kind !== "custom") throw new Error("custom");
    expect(before.sheetDeadlineAt).toBe(clock.t + 120 * SEC);
    const oldPath = before.sheetPath;
    clock.t += 121 * SEC;
    pending[0]!(await fake.generateSheet({ character: { name: "ソラ", appearance: "a" } }, new AbortController().signal));
    await redraw;
    const after = (await store.get<ThemeDoc>("themes", created.id))!;
    const c = after.characters[0]!;
    if (c.kind !== "custom") throw new Error("custom");
    expect(c.sheetPath).toBe(oldPath); // 期限後の絵は書かれない
    expect(c.sheetFailReason).toBe("時間切れ");
    expect(after.sheetRetries).toBe(0); // 予約は戻る
  });

  it("要求が途中で止まった generating は、期限後に読むと失敗で、予約は一度だけ戻る（#76）", async () => {
    const { svc, store, clock } = setup();
    const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    const raw = (await store.get<ThemeDoc>("themes", created.id))!;
    // 描き直しの途中で止まった状態を作る（前の絵なし・予約済み）
    const stuck = raw.characters.map((c) =>
      c.kind === "custom"
        ? { ...c, sheetStatus: "generating" as const, sheetPath: null, sheetGenId: "g1", sheetDeadlineAt: clock.t + 120 * SEC, sheetReserved: true }
        : c,
    );
    store._put("themes", created.id, { ...raw, characters: stuck, sheetRetries: 1 } as unknown as Record<string, unknown>);

    expect((await svc.getTheme(created.id, alice)).theme.characters[0]).toMatchObject({ sheetStatus: "generating" });
    clock.t += 121 * SEC;
    const view = await svc.getTheme(created.id, alice);
    expect(view.theme.characters[0]).toMatchObject({ sheetStatus: "failed", sheetFailReason: "時間切れ" });
    expect(view.theme.sheetRetriesLeft).toBe(2);
    await svc.getTheme(created.id, alice);
    await svc.getTheme(created.id, alice);
    expect((await store.get<ThemeDoc>("themes", created.id))!.sheetRetries).toBe(0);
  });

  it("#66 形式（設定画の欄が無い自作キャラ）は未確定で、描き直して確定するまで描けない", async () => {
    const { svc, store } = setup();
    const created = await svc.createTheme(alice, { ...base, characters: [CUSTOM] });
    const raw = (await store.get<ThemeDoc>("themes", created.id))!;
    const { sheetRetries: _retries, sheetsConfirmed: _confirmed, ...rest } = raw;
    const characters = rest.characters.map((c) => {
      if (c.kind !== "custom") return c;
      const { sheetStatus: _status, sheetPath: _path, sheetFailReason: _reason, ...custom } = c;
      return custom;
    });
    store._put("themes", created.id, { ...rest, characters } as unknown as Record<string, unknown>);

    const loaded = await svc.getTheme(created.id, alice);
    expect(loaded.theme.sheetsConfirmed).toBe(false);
    expect(loaded.theme.characters[0]).toMatchObject({ kind: "custom", sheetStatus: "failed" });

    const blocked = await expectApiError(draw(svc, bob, created.id, 0), 409);
    expect(blocked.message).toBe("設定画の確認が終わるまで描けません");

    const retried = await svc.retrySheets(alice, created.id, {});
    expect(retried.theme.characters[0]).toMatchObject({ kind: "custom", sheetStatus: "done" });
    expect(retried.theme.sheetRetriesLeft).toBe(1);

    const confirmed = await svc.confirmSheets(alice, created.id);
    expect(confirmed.theme.sheetsConfirmed).toBe(true);
    expect((await draw(svc, bob, created.id, 0)).status).toBe("done");
  });

  it("古い保存（設定画の欄なし）は確定済み・描き直し0回として読める", async () => {
    const { svc, store } = setup();
    const t = await makeTheme(svc);
    const raw = (await store.get<ThemeDoc>("themes", t.id))!;
    const { sheetRetries: _r, sheetsConfirmed: _c, ...old } = raw;
    store._put("themes", t.id, old as unknown as Record<string, unknown>);
    const d = await svc.getTheme(t.id, alice);
    expect(d.theme.sheetsConfirmed).toBe(true);
    expect(d.theme.sheetRetriesLeft).toBe(2);
    expect((await draw(svc, bob, t.id, 0)).status).toBe("done");
  });
});
