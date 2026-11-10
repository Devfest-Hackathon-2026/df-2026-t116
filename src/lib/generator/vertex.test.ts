// VertexGenerator を偽の generateContent で確かめる（本物の Vertex は呼ばない）。
import type { GenerateContentParameters, GenerateContentResponse, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import { CHARACTERS, type Character } from "../characters";
import type { ImageData } from "../images/types";
import { isApiError } from "../types";
import type { GenerateInput } from "./types";
import {
  REASON_BAD_PANELS,
  REASON_BLOCKED,
  REASON_BUSY,
  REASON_NO_IMAGE,
  VertexGenerator,
  type GenerateContentFn,
} from "./vertex";
import { ART_STYLE } from "../characters";
import { ART_STYLES } from "../artStyles";
import { NOTE_FIRST_PAGE, NOTE_LAST_PAGE, NO_BALLOON, SHEET_NOTE, SPEAKER_NOTE, buildImageInstruction, splitSpeaker } from "./vertexPrompt";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const SHEET: ImageData = { bytes: new Uint8Array([9, 9, 9]), mime: "image/png" };

const mikan = CHARACTERS.find((c) => c.id === "mikan")!;
const tetsu = CHARACTERS.find((c) => c.id === "tetsu")!;
const hakase = CHARACTERS.find((c) => c.id === "hakase")!;

const PANELS = ["教室で寝ているミカン", "テツが起こしに来る", "ミカンが飛び起きる", "二人で笑う"];

function textResponse(obj: unknown): GenerateContentResponse {
  return {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }],
  } as unknown as GenerateContentResponse;
}

function imageResponse(mime = "image/png"): GenerateContentResponse {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: "どうぞ" }, { inlineData: { data: PNG_BYTES.toString("base64"), mimeType: mime } }],
        },
        finishReason: "STOP",
      },
    ],
  } as unknown as GenerateContentResponse;
}

type Responder = GenerateContentResponse | Error | (() => GenerateContentResponse);

/** 1回目（文章のAI）・2回目（画像のAI）の返りを決める偽物。呼ばれた中身を残す */
function fakeCall(text: Responder, image: Responder = imageResponse()) {
  const calls: GenerateContentParameters[] = [];
  const fn: GenerateContentFn = async (params) => {
    calls.push(params);
    const r = calls.length === 1 ? text : image;
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  };
  return { fn, calls };
}

function makeGen(fn: GenerateContentFn, loadSheet: (c: Character) => Promise<ImageData | null> = async () => SHEET) {
  return new VertexGenerator({ generateContent: fn, textModel: "text-m", imageModel: "image-m", loadSheet });
}

function input(lines: string[], extra: Partial<GenerateInput> = {}): GenerateInput {
  return { themeText: "寝坊の朝", characters: [mikan, tetsu], lines, ...extra };
}

const LINES = ["おはよう", "もう昼だよ！", "", "明日こそ早起きする"];

function partsOf(params: GenerateContentParameters): Part[] {
  const contents = params.contents as { parts: Part[] }[];
  return contents[0]!.parts;
}

function lastText(params: GenerateContentParameters): string {
  const parts = partsOf(params);
  return parts[parts.length - 1]!.text ?? "";
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("VertexGenerator.generate", () => {
  it("本文の指示に lines の4行がそのまま入り、空の行のコマは吹き出しなしになる", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const r = await makeGen(fn).generate(input(LINES), signal());
    expect(r.status).toBe("done");
    const prompt = lastText(calls[1]!);
    for (const l of LINES.filter((x) => x)) expect(prompt).toContain(`「${l}」`);
    for (const p of PANELS) expect(prompt).toContain(p);
    const third = prompt.split("3コマ目")[1]!.split("4コマ目")[0]!;
    expect(third).toContain(NO_BALLOON);
    expect(third).not.toContain("吹き出しのセリフ");
    expect(prompt.match(/吹き出しのセリフ（この日本語を一字違わず書く）/g)).toHaveLength(3);
    expect(prompt).not.toContain("絶対");
    // 文章のAIにも4行が渡り、セリフ欄を持たない形で頼んでいる
    expect(JSON.stringify(calls[0]!.contents)).toContain("もう昼だよ！");
    expect(calls[0]!.model).toBe("text-m");
    expect(calls[1]!.model).toBe("image-m");
  });

  it("名前「セリフ」の行は、吹き出しに中身だけを渡し、話す人を別に書く", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const lines = ["ミカン「ばねで靴を作ろう！」", "町の朝", "", "ハカセ 「うむ」"];
    await makeGen(fn).generate(input(lines, { characters: [mikan, hakase] }), signal());
    const prompt = lastText(calls[1]!);
    const first = prompt.split("1コマ目")[1]!.split("2コマ目")[0]!;
    expect(first).toContain("吹き出しのセリフ（この日本語を一字違わず書く）: 「ばねで靴を作ろう！」");
    expect(first).toContain(`話す人: ミカン${SPEAKER_NOTE}`);
    expect(prompt).not.toContain("「ミカン「");
    const second = prompt.split("2コマ目")[1]!.split("3コマ目")[0]!;
    expect(second).toContain("「町の朝」");
    expect(second).not.toContain("話す人");
    expect(prompt).toContain("話す人: ハカセ");
    // 文章のAIには元の行のまま渡す（誰が話すかが絵コンテに要る）
    expect(JSON.stringify(calls[0]!.contents)).toContain("ミカン「ばねで靴を作ろう！」");
  });

  it("指示は漫画の1ページ（縦長・横長のコマ4つ）で、4コマ漫画・オチ・起承転結の言葉が無い", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    await makeGen(fn).generate(input(LINES), signal());
    expect(calls[1]!.config!.imageConfig?.aspectRatio).toBe("2:3");
    const prompt = lastText(calls[1]!);
    expect(prompt).toContain("1ページ");
    expect(prompt).toContain("横長のコマを4つ");
    expect(prompt).toContain("コマは必ず4つ");
    const imageAll = partsOf(calls[1]!).map((p) => p.text ?? "").join("\n");
    const textAll = JSON.stringify(calls[0]!.contents);
    expect(textAll).toContain("1ページ");
    for (const all of [imageAll, textAll]) {
      for (const w of ["4コマ漫画", "オチ", "起承転結"]) expect(all).not.toContain(w);
    }
  });

  it("完成なら画像の bytes と mimeType・panels を返す", async () => {
    const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), imageResponse("image/jpeg"));
    const r = await makeGen(fn).generate(input(LINES), signal());
    if (r.status !== "done") throw new Error(`done ではない: ${r.status}`);
    expect(Buffer.from(r.image.bytes).equals(PNG_BYTES)).toBe(true);
    expect(r.image.mime).toBe("image/jpeg");
    expect(r.panels).toEqual(PANELS);
  });

  it("parts は説明→キャラ名と設定画→前のページ→本文の指示の順", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const prevImage: ImageData = { bytes: new Uint8Array([7, 7]), mime: "image/png" };
    await makeGen(fn).generate(input(LINES, { prevImage }), signal());
    const parts = partsOf(calls[1]!);
    const kinds = parts.map((p) => (p.inlineData ? "img" : (p.text ?? "").split("\n")[0]));
    expect(kinds).toEqual([
      expect.any(String),
      "キャラ名: ミカン",
      "img",
      "キャラ名: テツ",
      "img",
      "前のページ（話の流れ・絵柄・キャラの見た目をつなぐ）",
      "img",
      expect.stringContaining("縦長の1枚"),
    ]);
    expect(parts[6]!.inlineData).toEqual({ data: Buffer.from([7, 7]).toString("base64"), mimeType: "image/png" });
  });

  it("文章のAIが ok=false なら rejected と日本語の理由（画像のAIは呼ばない）", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: false, reason: "実在の人の名前が含まれています", panels: [] }));
    const r = await makeGen(fn).generate(input(LINES), signal());
    expect(r).toEqual({ status: "rejected", reason: "実在の人の名前が含まれています" });
    expect(calls).toHaveLength(1);
  });

  it("ok=false で理由が空でも日本語の理由を付ける", async () => {
    const { fn } = fakeCall(textResponse({ ok: false, reason: "", panels: [] }));
    const r = await makeGen(fn).generate(input(LINES), signal());
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.reason).toMatch(/[ぁ-んァ-ン一-龯]/);
  });

  it("画像の promptFeedback.blockReason → rejected", async () => {
    const blocked = { promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, candidates: [] } as unknown as GenerateContentResponse;
    const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), blocked);
    expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "rejected", reason: REASON_BLOCKED });
  });

  it.each(["IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "SAFETY", "PROHIBITED_CONTENT", "SPII"])(
    "finishReason %s → rejected",
    async (finishReason) => {
      const res = { candidates: [{ content: { parts: [] }, finishReason }] } as unknown as GenerateContentResponse;
      const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), res);
      expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "rejected", reason: REASON_BLOCKED });
    },
  );

  it.each(["NO_IMAGE", "IMAGE_OTHER", "IMAGE_RECITATION"])("finishReason %s → failed", async (finishReason) => {
    const res = { candidates: [{ content: { parts: [] }, finishReason }] } as unknown as GenerateContentResponse;
    const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), res);
    expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "failed", reason: REASON_NO_IMAGE });
  });

  it("画像が無い返り（文字だけ・候補なし）→ failed", async () => {
    const textOnly = {
      candidates: [{ content: { parts: [{ text: "描けませんでした" }] }, finishReason: "STOP" }],
    } as unknown as GenerateContentResponse;
    const empty = {} as GenerateContentResponse;
    for (const res of [textOnly, empty]) {
      const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), res);
      expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "failed", reason: REASON_NO_IMAGE });
    }
  });

  it("画像の呼び出しの config に seed・temperature・topK・topP が無く、2:3・1K", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const ac = new AbortController();
    await makeGen(fn).generate(input(LINES), ac.signal);
    const config = calls[1]!.config!;
    for (const k of ["seed", "temperature", "topK", "topP", "logprobs", "responseLogprobs", "candidateCount"]) {
      expect(config).not.toHaveProperty(k);
    }
    expect(config.imageConfig).toEqual({ aspectRatio: "2:3", imageSize: "1K" });
    expect(config.responseModalities).toEqual(["TEXT", "IMAGE"]);
    expect(config.abortSignal).toBe(ac.signal);
    // 文章のAIもサンプリング系を渡さず、JSON と thinkingLevel LOW
    const tc = calls[0]!.config!;
    for (const k of ["seed", "temperature", "topK", "topP", "candidateCount", "presencePenalty", "frequencyPenalty"]) {
      expect(tc).not.toHaveProperty(k);
    }
    expect(tc.responseMimeType).toBe("application/json");
    expect(tc.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(tc.abortSignal).toBe(ac.signal);
  });

  it.each([
    ["3つ", PANELS.slice(0, 3)],
    ["5つ", [...PANELS, "おまけ"]],
    ["配列でない", "教室"],
    ["空の文字を含む", ["a", "", "c", "d"]],
  ])("panels が%s → failed（画像のAIは呼ばない）", async (_label, panels) => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels }));
    expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "failed", reason: REASON_BAD_PANELS });
    expect(calls).toHaveLength(1);
  });

  it("文章のAIの返りが JSON でない → failed", async () => {
    const bad = { candidates: [{ content: { parts: [{ text: "はい" }] } }] } as unknown as GenerateContentResponse;
    const { fn } = fakeCall(bad);
    expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "failed", reason: REASON_BAD_PANELS });
  });

  it("設定画のファイルが無いキャラでも落ちず、見た目の文だけ渡す", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const loadSheet = async (c: Character) => {
      if (c.id === "tetsu") return null;
      return SHEET;
    };
    const r = await makeGen(fn, loadSheet).generate(input(LINES), signal());
    expect(r.status).toBe("done");
    const parts = partsOf(calls[1]!);
    const i = parts.findIndex((p) => p.text?.startsWith("キャラ名: テツ"));
    expect(parts[i]!.text).toContain(tetsu.appearance);
    expect(parts[i + 1]!.inlineData).toBeUndefined();
    expect(parts.filter((p) => p.inlineData)).toHaveLength(1);
  });

  it("既定の読み込み（public/ に設定画が無い）でも落ちない", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const gen = new VertexGenerator({ generateContent: fn });
    const ghost: Character = { id: "ghost", name: "ユウレイ", appearance: "白い布", sheetPath: "/characters/__none__.png" };
    const r = await gen.generate(input(LINES, { characters: [ghost] }), signal());
    expect(r.status).toBe("done");
    expect(partsOf(calls[1]!).some((p) => p.inlineData)).toBe(false);
  });

  it("前のページが SVG（fake の残り）なら参照に付けない", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const prevImage: ImageData = { bytes: new TextEncoder().encode("<svg/>"), mime: "image/svg+xml" };
    await makeGen(fn).generate(input(LINES, { prevImage }), signal());
    expect(partsOf(calls[1]!).some((p) => p.text?.startsWith("前のページ"))).toBe(false);
  });

  it("429 → failed（混み合っています）", async () => {
    const err = Object.assign(new Error("Resource exhausted"), { status: 429 });
    const { fn } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }), err);
    expect(await makeGen(fn).generate(input(LINES), signal())).toEqual({ status: "failed", reason: REASON_BUSY });
  });

  it("時間切れで止められたら failed（時間切れ）", async () => {
    const ac = new AbortController();
    const fn: GenerateContentFn = async () => {
      ac.abort();
      throw new Error("aborted");
    };
    expect(await makeGen(fn).generate(input(LINES), ac.signal)).toEqual({ status: "failed", reason: "時間切れ" });
  });
});

describe("VertexGenerator.generate の作品の枠（作品名・物語の軸・絵柄・位置・前のページのセリフ）", () => {
  const SHOJO = ART_STYLES.find((s) => s.id === "shojo")!.prompt;

  function allText(params: GenerateContentParameters): string {
    return partsOf(params)
      .map((p) => p.text ?? "")
      .join("\n");
  }

  async function run(extra: Partial<GenerateInput>, loadSheet?: (c: Character) => Promise<ImageData | null>) {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const r = await makeGen(fn, loadSheet).generate(input(LINES, extra), signal());
    expect(r.status).toBe("done");
    return { text: allText(calls[0]!), image: allText(calls[1]!), last: lastText(calls[1]!) };
  }

  it("artStyle を文章のAIと画像のAIの両方に使い、既定の ART_STYLE は使わない", async () => {
    const { text, image, last } = await run({ artStyle: SHOJO });
    expect(text).toContain(`絵柄: ${SHOJO}`);
    expect(last).toContain(SHOJO);
    for (const t of [text, image]) expect(t).not.toContain(ART_STYLE);
  });

  it("artStyle が無い（空も）なら既定の ART_STYLE を両方に使う", async () => {
    for (const extra of [{}, { artStyle: "  " }]) {
      const { text, last } = await run(extra);
      expect(text).toContain(ART_STYLE);
      expect(last).toContain(ART_STYLE);
    }
  });

  it("設定画を渡す時は「見た目の見本。絵柄は下の指定に合わせる」と絵柄を添える。設定画が無ければ添えない", async () => {
    const withSheet = await run({ artStyle: SHOJO });
    expect(withSheet.image).toContain(SHEET_NOTE);
    expect(withSheet.image.split(SHEET_NOTE)[1]!.split("キャラ名:")[0]).toContain(SHOJO);
    const noSheet = await run({ artStyle: SHOJO }, async () => null);
    expect(noSheet.image).not.toContain(SHEET_NOTE);
  });

  it("作品名と物語の軸（大枠から外れない）を両方に入れる", async () => {
    const { text, last } = await run({ title: "屋上の地図", themeText: "古い地図を追う高校生の冒険" });
    for (const t of [text, last]) {
      expect(t).toContain("作品名: 屋上の地図");
      expect(t).toContain("物語の軸（この作品の大枠。話はこの枠から外れない）: 古い地図を追う高校生の冒険");
    }
  });

  it("作品名が無ければ作品名の行を入れず、物語の軸は入れる", async () => {
    const { text, last } = await run({});
    for (const t of [text, last]) {
      expect(t).not.toContain("作品名: ");
      expect(t).toContain("物語の軸（この作品の大枠。話はこの枠から外れない）: 寝坊の朝");
    }
  });

  it("位置「第N話のMページ目（1話は4ページ）」を両方に入れる。途中のページは添え書き無し", async () => {
    const { text, last } = await run({ position: { episode: 2, pageInEpisode: 3 } });
    for (const t of [text, last]) {
      expect(t).toContain("第2話の3ページ目（1話は4ページ）");
      expect(t).not.toContain(NOTE_LAST_PAGE);
      expect(t).not.toContain(NOTE_FIRST_PAGE);
    }
  });

  it("4ページ目は話の区切りの添え書きを入れる", async () => {
    const { text, last } = await run({ position: { episode: 1, pageInEpisode: 4 } });
    for (const t of [text, last]) {
      expect(t).toContain("第1話の4ページ目");
      expect(t).toContain(NOTE_LAST_PAGE);
    }
  });

  it("第2話以降の1ページ目は新しい話の始まりの添え書き。第1話の1ページ目には入れない", async () => {
    const second = await run({ position: { episode: 2, pageInEpisode: 1 } });
    for (const t of [second.text, second.last]) expect(t).toContain(NOTE_FIRST_PAGE);
    const first = await run({ position: { episode: 1, pageInEpisode: 1 } });
    for (const t of [first.text, first.last]) {
      expect(t).toContain("第1話の1ページ目");
      expect(t).not.toContain(NOTE_FIRST_PAGE);
    }
  });

  it("位置が無ければ位置の行を入れない", async () => {
    const { text, last } = await run({});
    for (const t of [text, last]) expect(t).not.toMatch(/第\d+話/);
  });

  it("前のページのセリフを文章のAIに渡し、話をつなぐように頼む（画像のAIには渡さない）", async () => {
    const prevLines = ["地図の端が破れてる", "", "続きはどこに？", "旧校舎だ"];
    const { text, image } = await run({ prevLines });
    expect(text).toContain("前のページのセリフ:");
    expect(text).toContain("1コマ目: 「地図の端が破れてる」");
    expect(text).toContain("2コマ目: （セリフなし）");
    expect(text).toContain("前のページのセリフから話がつながるように");
    // 今のページのセリフは前のページのセリフの後ろに来る
    expect(text.indexOf("前のページのセリフ:")).toBeLessThan(text.lastIndexOf("セリフ:\n1コマ目: 「おはよう」"));
    expect(image).not.toContain("地図の端が破れてる");
  });

  it("前のページのセリフが無い・空だけなら前のページのセリフの欄を入れない", async () => {
    for (const extra of [{}, { prevLines: [] }, { prevLines: ["", " "] }]) {
      const { text } = await run(extra);
      expect(text).not.toContain("前のページのセリフ:");
      expect(text).not.toContain("前のページのセリフから");
    }
  });

  it("全部入りでも4コマ漫画・オチ・起承転結の言葉が無い", async () => {
    const { text, image } = await run({
      title: "屋上の地図",
      artStyle: SHOJO,
      position: { episode: 3, pageInEpisode: 4 },
      prevLines: ["a", "b", "c", "d"],
    });
    for (const t of [text, image]) for (const w of ["4コマ漫画", "オチ", "起承転結"]) expect(t).not.toContain(w);
  });
});

describe("VertexGenerator.moderateTheme", () => {
  it("ok=true → ok", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "" }));
    expect(await makeGen(fn).moderateTheme("寝坊の朝")).toEqual({ ok: true });
    expect(calls[0]!.model).toBe("text-m");
    expect(JSON.stringify(calls[0]!.contents)).toContain("寝坊の朝");
    expect(calls[0]!.config?.responseMimeType).toBe("application/json");
  });

  it("作品名と物語の軸を確かめる指示（不適切な内容・実在の人・実在の作家・他の作品やキャラの名前）", async () => {
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "" }));
    await makeGen(fn).moderateTheme("屋上の地図\n古い地図を追う高校生の冒険");
    const prompt = JSON.stringify(calls[0]!.contents);
    for (const w of ["作品名と物語の軸", "不適切な内容", "実在の人の名前", "実在の作家", "他の作品", "キャラの名前", "屋上の地図", "古い地図を追う高校生の冒険"]) {
      expect(prompt).toContain(w);
    }
  });

  it("ok=false → 日本語の理由", async () => {
    const { fn } = fakeCall(textResponse({ ok: false, reason: "他の作品のキャラの名前が含まれています" }));
    expect(await makeGen(fn).moderateTheme("x")).toEqual({ ok: false, reason: "他の作品のキャラの名前が含まれています" });
  });

  it("429 → 503 の ApiError（混み合っています）", async () => {
    const err = Object.assign(new Error("Resource exhausted"), { status: 429 });
    const { fn } = fakeCall(err);
    const e = await makeGen(fn).moderateTheme("x").catch((x: unknown) => x);
    expect(isApiError(e)).toBe(true);
    if (isApiError(e)) {
      expect(e.status).toBe(503);
      expect(e.message).toBe(REASON_BUSY);
    }
  });
});

describe("VertexGenerator.generateSheet", () => {
  const sheetInput = { character: { name: "ソラ", appearance: "10代の人間。丸い眼鏡" }, artStyle: "ゆるい線のかわいい絵" };

  it("画像のAIを1回だけ呼ぶ。1:1・1K、画風・名前・見た目と「既存の作品のキャラクターに似せない」を渡す", async () => {
    const { fn, calls } = fakeCall(imageResponse());
    const r = await makeGen(fn).generateSheet(sheetInput, signal());
    expect(r.status).toBe("done");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("image-m");
    expect(calls[0]!.config?.imageConfig).toEqual({ aspectRatio: "1:1", imageSize: "1K" });
    const text = JSON.stringify(calls[0]!.contents);
    expect(text).toContain("ゆるい線のかわいい絵");
    expect(text).toContain("ソラ");
    expect(text).toContain("丸い眼鏡");
    expect(text).toContain("既存の作品");
    expect(text).toContain("似せない");
  });

  it("絵柄が無ければ既定の ART_STYLE", async () => {
    const { fn, calls } = fakeCall(imageResponse());
    await makeGen(fn).generateSheet({ character: sheetInput.character }, signal());
    expect(JSON.stringify(calls[0]!.contents)).toContain(ART_STYLE);
  });

  it("IMAGE_SAFETY → rejected、画像なし → failed、429 → 混み合い、例外 → failed", async () => {
    const safety = { candidates: [{ finishReason: "IMAGE_SAFETY" }] } as unknown as GenerateContentResponse;
    const r1 = await makeGen(fakeCall(safety).fn).generateSheet(sheetInput, signal());
    expect(r1).toEqual({ status: "rejected", reason: REASON_BLOCKED });
    const none = { candidates: [{ content: { role: "model", parts: [{ text: "ごめん" }] }, finishReason: "STOP" }] } as unknown as GenerateContentResponse;
    const r2 = await makeGen(fakeCall(none).fn).generateSheet(sheetInput, signal());
    expect(r2).toEqual({ status: "failed", reason: REASON_NO_IMAGE });
    const r3 = await makeGen(fakeCall(Object.assign(new Error("rate"), { status: 429 })).fn).generateSheet(sheetInput, signal());
    expect(r3).toEqual({ status: "failed", reason: REASON_BUSY });
    const r4 = await makeGen(fakeCall(new Error("boom")).fn).generateSheet(sheetInput, signal());
    expect(r4.status).toBe("failed");
  });

  it("パーツのキャラの確定した設定画（sheetImage）を、ページの参照画像に使う", async () => {
    const custom: Character = { id: "c1", name: "ソラ", appearance: "10代の人間", sheetImage: SHEET };
    const { fn, calls } = fakeCall(textResponse({ ok: true, reason: "", panels: PANELS }));
    const r = await makeGen(fn, async () => null).generate(input(LINES, { characters: [custom] }), signal());
    expect(r.status).toBe("done");
    const inline = (calls[1]!.contents as { parts: Part[] }[])[0]!.parts.filter((p) => p.inlineData);
    expect(inline).toHaveLength(1);
    expect(inline[0]!.inlineData?.data).toBe(Buffer.from(SHEET.bytes).toString("base64"));
  });
});

describe("splitSpeaker", () => {
  const names = ["ミカン", "ハカセ"];

  it("登録名の「セリフ」だけ分ける。登録されていない行はそのまま返す", () => {
    expect(splitSpeaker("ミカン「それだ！」", names)).toEqual({ speaker: "ミカン", text: "それだ！" });
    expect(splitSpeaker("看板には「入口」", names)).toEqual({ speaker: null, text: "看板には「入口」" });
    expect(splitSpeaker("町の人「おはよう」", names)).toEqual({ speaker: null, text: "町の人「おはよう」" });
    expect(splitSpeaker("「大魔法使いの弟子 募集」", names)).toEqual({
      speaker: null,
      text: "「大魔法使いの弟子 募集」",
    });
    expect(splitSpeaker("町じゅうの人が空をとぶ朝", names)).toEqual({ speaker: null, text: "町じゅうの人が空をとぶ朝" });
    const two = "ミカン「行こう」ハカセ「うむ」";
    expect(splitSpeaker(two, names)).toEqual({ speaker: null, text: two });
    expect(splitSpeaker("ミカン「 」", names)).toEqual({ speaker: null, text: "ミカン「 」" });
    expect(splitSpeaker("ミカン先生「それだ！」", ["ミカン", "ミカン先生"])).toEqual({
      speaker: "ミカン先生",
      text: "それだ！",
    });
  });

  it("空白や補助漢字を含む登録名でも分ける（#86）", () => {
    expect(splitSpeaker("山田 太郎「行こう」", ["山田 太郎"])).toEqual({ speaker: "山田 太郎", text: "行こう" });
    expect(splitSpeaker("山田　太郎「行こう」", ["山田　太郎"])).toEqual({ speaker: "山田　太郎", text: "行こう" });
    expect(splitSpeaker("𠮷田「行こう」", ["𠮷田"])).toEqual({ speaker: "𠮷田", text: "行こう" });
    // 長い名前を優先する（補助漢字で UTF-16 の長さが符号位置の数とずれても）
    expect(splitSpeaker("𠮷田先生「行こう」", ["𠮷田", "𠮷田先生"])).toEqual({ speaker: "𠮷田先生", text: "行こう" });
    // 20字（符号位置）。補助漢字だけだと UTF-16 では40単位になる
    const twenty = "𠮷".repeat(20);
    expect([...twenty]).toHaveLength(20);
    expect(twenty.length).toBe(40);
    expect(splitSpeaker(`${twenty}「行こう」`, [twenty])).toEqual({ speaker: twenty, text: "行こう" });
    const twentyMixed = "あ".repeat(10) + "𠮷".repeat(5) + " " + "い".repeat(4);
    expect([...twentyMixed]).toHaveLength(20);
    expect(splitSpeaker(`${twentyMixed}「行こう」`, [twentyMixed])).toEqual({ speaker: twentyMixed, text: "行こう" });
    // 登録名と一致しない（空白の有無が違う）行は分けない
    expect(splitSpeaker("山田太郎「行こう」", ["山田 太郎"])).toEqual({ speaker: null, text: "山田太郎「行こう」" });
    expect(splitSpeaker("山田 太郎「行こう」", ["山田　太郎"])).toEqual({ speaker: null, text: "山田 太郎「行こう」" });
    expect(splitSpeaker("𠮷田「行こう」", ["吉田"])).toEqual({ speaker: null, text: "𠮷田「行こう」" });
  });

  it("セリフの中の入れ子の「」を許す。対応が取れない行は分けない（#87）", () => {
    expect(splitSpeaker("ミカン「「はい」と答えて」", names)).toEqual({ speaker: "ミカン", text: "「はい」と答えて" });
    expect(splitSpeaker("ミカン「「はい」", names)).toEqual({ speaker: null, text: "ミカン「「はい」" });
    expect(splitSpeaker("ミカン『「はい」と答えて』", names)).toEqual({ speaker: "ミカン", text: "「はい」と答えて" });
  });

  it("セリフの中に話す人の名前があっても、吹き出しの文字としては残す", () => {
    expect(splitSpeaker("ミカン「ミカンです」", names)).toEqual({ speaker: "ミカン", text: "ミカンです" });
    const prompt = buildImageInstruction({
      themeText: "自己紹介",
      artStyle: "テスト",
      characters: [mikan, hakase],
      lines: ["ミカン「ミカンです」", "", "", ""],
      panels: ["ミカンが名乗る", "余韻", "余韻", "余韻"],
    });
    expect(prompt).toContain("「ミカンです」");
    expect(prompt).toContain("（この名前を吹き出しに書き足さない。上のセリフの中の文字はそのまま書く）");
    expect(prompt).not.toContain("名前は吹き出しに書かない");
  });

  it("登録名でない「」は、画像の指示でも行全体を残す", () => {
    const prompt = buildImageInstruction({
      themeText: "町の看板",
      artStyle: "テスト",
      characters: [mikan, hakase],
      lines: ["看板には「入口」", "町の人「おはよう」", "ミカン「それだ！」", ""],
      panels: ["看板", "朝", "ミカンが指さす", "余韻"],
    });
    const first = prompt.split("1コマ目")[1]!.split("2コマ目")[0]!;
    expect(first).toContain("「看板には「入口」」");
    expect(first).not.toContain("話す人");
    const second = prompt.split("2コマ目")[1]!.split("3コマ目")[0]!;
    expect(second).toContain("「町の人「おはよう」」");
    expect(second).not.toContain("話す人");
    const third = prompt.split("3コマ目")[1]!.split("4コマ目")[0]!;
    expect(third).toContain("吹き出しのセリフ（この日本語を一字違わず書く）: 「それだ！」");
    expect(third).toContain(`話す人: ミカン${SPEAKER_NOTE}`);
  });
});
