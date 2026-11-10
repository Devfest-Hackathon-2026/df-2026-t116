// Vertex AI（Gemini 3.8 Flash ＋ Nano Banana 2.1）での生成（docs/design-d-4koma.md 3節）。
// server.ts から GENERATOR=vertex の時だけ動的に読む。呼び出し（generateContent）は外から差し替えられる。
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema,
} from "@google/genai";
import { ART_STYLE, type Character } from "../characters";
import type { ImageData } from "../images/types";
import { ApiError } from "../types";
import type {
  ComicGenerator,
  GenerateInput,
  GenerateResult,
  GenerateSheetInput,
  GenerateSheetResult,
  ModerationResult,
} from "./types";
import { buildImageParts, buildModerationPrompt, buildPanelsPrompt, buildSheetPrompt, type StoryFrame } from "./vertexPrompt";
import { gcpProject } from "../gcpProject";

/** GoogleGenAI の models.generateContent と同じ形 */
export type GenerateContentFn = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

export interface VertexGeneratorOptions {
  /** 省くと ADC で GoogleGenAI を作る（初めて呼ぶ時に作る） */
  generateContent?: GenerateContentFn;
  textModel?: string;
  imageModel?: string;
  /** 設定画を読む。無ければ null。省くと public/ から読む */
  loadSheet?: (character: Character) => Promise<ImageData | null>;
}

export const DEFAULT_TEXT_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";

export const REASON_BLOCKED = "内容の確認で止められました";
export const REASON_BUSY = "混み合っています。少し待ってもう一度";
export const REASON_NO_IMAGE = "画像を作れませんでした。もう一度試してください";
export const REASON_BAD_PANELS = "絵の指示を作れませんでした。もう一度試してください";
export const REASON_FAILED = "生成に失敗しました";
export const REASON_TIMEOUT = "時間切れ";
const REASON_DEFAULT_REJECT = "続きに使えない内容が含まれています";
const REASON_DEFAULT_THEME_REJECT = "作品名か物語の軸に使えない内容が含まれています";

const REJECT_FINISH = new Set<string>([
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);
const FAIL_FINISH = new Set<string>([FinishReason.NO_IMAGE, FinishReason.IMAGE_OTHER, FinishReason.IMAGE_RECITATION]);

const MODERATION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ok: { type: Type.BOOLEAN },
    reason: { type: Type.STRING, description: "ok が false の時の理由（日本語で短く）。ok が true なら空の文字" },
  },
  required: ["ok", "reason"],
  propertyOrdering: ["ok", "reason"],
};

const PANELS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ok: { type: Type.BOOLEAN },
    reason: { type: Type.STRING, description: "ok が false の時の理由（日本語で短く）。ok が true なら空の文字" },
    panels: {
      type: Type.ARRAY,
      description: "漫画の1ページ（4コマ分）の各コマの絵の指示（場面・表情・動き・背景・カメラの寄り引き）。セリフは入れない",
      items: { type: Type.STRING },
    },
  },
  required: ["ok", "reason", "panels"],
  propertyOrdering: ["ok", "reason", "panels"],
};

/** 文章のAIの config。temperature などのサンプリング系は渡さない */
export function textConfig(schema: Schema, abortSignal?: AbortSignal): GenerateContentConfig {
  return {
    responseMimeType: "application/json",
    responseSchema: schema,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    ...(abortSignal ? { abortSignal } : {}),
  };
}

/** 画像のAIの config。seed・topK・temperature・topP・logprobs は渡すとエラーなので渡さない */
export function imageConfig(abortSignal?: AbortSignal, aspectRatio = "2:3"): GenerateContentConfig {
  return {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio, imageSize: "1K" },
    ...(abortSignal ? { abortSignal } : {}),
  };
}

/** 考えた途中（thought）を除いた本文の text を集める */
function responseText(res: GenerateContentResponse): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

function parseJson(res: GenerateContentResponse): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(responseText(res));
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function reasonOf(v: Record<string, unknown>, def: string): string {
  return typeof v.reason === "string" && v.reason.trim() ? v.reason.trim() : def;
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

/** 画像のAIの返りを結果に直す */
export function readImageResponse(res: GenerateContentResponse): { ok: true; image: ImageData } | { ok: false; result: GenerateResult } {
  if (res.promptFeedback?.blockReason) {
    return { ok: false, result: { status: "rejected", reason: REASON_BLOCKED } };
  }
  const cand = res.candidates?.[0];
  const finish = cand?.finishReason;
  if (finish && REJECT_FINISH.has(finish)) {
    return { ok: false, result: { status: "rejected", reason: REASON_BLOCKED } };
  }
  if (finish && FAIL_FINISH.has(finish)) {
    return { ok: false, result: { status: "failed", reason: REASON_NO_IMAGE } };
  }
  const part = (cand?.content?.parts ?? []).find((p) => !p.thought && p.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) return { ok: false, result: { status: "failed", reason: REASON_NO_IMAGE } };
  return {
    ok: true,
    image: { bytes: Buffer.from(data, "base64"), mime: part.inlineData?.mimeType ?? "image/png" },
  };
}

/** 先頭の数バイトから画像の形式を見る（設定画が .png でも中身が JPEG の事がある） */
export function sniffImageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && Buffer.from(b.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(b.subarray(8, 12)).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

async function loadSheetFromPublic(character: Character): Promise<ImageData | null> {
  // パーツで作ったキャラは設定画がまだ無い（参照画像なし）
  if (!character.sheetPath) return null;
  try {
    const file = path.join(process.cwd(), "public", ...character.sheetPath.split("/").filter(Boolean));
    const bytes = await readFile(file);
    return { bytes, mime: sniffImageMime(bytes) ?? "image/png" };
  } catch {
    return null;
  }
}

export class VertexGenerator implements ComicGenerator {
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly loadSheet: (character: Character) => Promise<ImageData | null>;
  private call: GenerateContentFn | undefined;

  constructor(opts: VertexGeneratorOptions = {}) {
    this.textModel = opts.textModel ?? process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
    this.imageModel = opts.imageModel ?? process.env.IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;
    this.loadSheet = opts.loadSheet ?? loadSheetFromPublic;
    this.call = opts.generateContent;
  }

  private generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
    if (!this.call) {
      const ai = new GoogleGenAI({
        vertexai: true,
        project: gcpProject(),
        location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
      });
      this.call = (p) => ai.models.generateContent(p);
    }
    return this.call(params);
  }

  async moderateTheme(text: string): Promise<ModerationResult> {
    let res: GenerateContentResponse;
    try {
      res = await this.generateContent({
        model: this.textModel,
        contents: [{ role: "user", parts: [{ text: buildModerationPrompt(text) }] }],
        config: textConfig(MODERATION_SCHEMA),
      });
    } catch (e) {
      if (statusOf(e) === 429) throw new ApiError(503, REASON_BUSY);
      throw e;
    }
    if (res.promptFeedback?.blockReason) return { ok: false, reason: REASON_BLOCKED };
    const v = parseJson(res);
    if (!v || typeof v.ok !== "boolean") throw new Error("moderateTheme: 文章のAIの返りが読めません");
    return v.ok ? { ok: true } : { ok: false, reason: reasonOf(v, REASON_DEFAULT_THEME_REJECT) };
  }

  async generate(input: GenerateInput, signal: AbortSignal): Promise<GenerateResult> {
    try {
      return await this.generateInner(input, signal);
    } catch (e) {
      if (signal.aborted) return { status: "failed", reason: REASON_TIMEOUT };
      if (statusOf(e) === 429) return { status: "failed", reason: REASON_BUSY };
      console.error("vertex generate failed", e instanceof Error ? e.message : e);
      return { status: "failed", reason: REASON_FAILED };
    }
  }

  /** 設定画を画像のAIで1回描く（1:1・1K）。止められた・失敗の扱いはページ生成と同じ */
  async generateSheet(input: GenerateSheetInput, signal: AbortSignal): Promise<GenerateSheetResult> {
    try {
      const prompt = buildSheetPrompt(input.character, input.artStyle?.trim() || ART_STYLE);
      const res = await this.generateContent({
        model: this.imageModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: imageConfig(signal, "1:1"),
      });
      const read = readImageResponse(res);
      if (!read.ok) {
        const r = read.result;
        return r.status === "done" ? { status: "failed", reason: REASON_NO_IMAGE } : r;
      }
      return { status: "done", image: read.image };
    } catch (e) {
      if (signal.aborted) return { status: "failed", reason: REASON_TIMEOUT };
      if (statusOf(e) === 429) return { status: "failed", reason: REASON_BUSY };
      console.error("vertex generateSheet failed", e instanceof Error ? e.message : e);
      return { status: "failed", reason: REASON_FAILED };
    }
  }

  private async generateInner(input: GenerateInput, signal: AbortSignal): Promise<GenerateResult> {
    // 作品の枠（絵柄は作品の指定。無ければ既定の ART_STYLE）
    const frame: StoryFrame = {
      themeText: input.themeText,
      title: input.title,
      artStyle: input.artStyle?.trim() || ART_STYLE,
      position: input.position,
    };
    // ① 文章のAI: 確かめと絵の指示
    const panelsPrompt = buildPanelsPrompt({
      ...frame,
      characters: input.characters,
      lines: input.lines,
      prevLines: input.prevLines,
    });
    const textRes = await this.generateContent({
      model: this.textModel,
      contents: [{ role: "user", parts: [{ text: panelsPrompt }] }],
      config: textConfig(PANELS_SCHEMA, signal),
    });
    if (textRes.promptFeedback?.blockReason) return { status: "rejected", reason: REASON_BLOCKED };
    const v = parseJson(textRes);
    if (!v || typeof v.ok !== "boolean") return { status: "failed", reason: REASON_BAD_PANELS };
    if (!v.ok) return { status: "rejected", reason: reasonOf(v, REASON_DEFAULT_REJECT) };
    const panels = v.panels;
    if (
      !Array.isArray(panels) ||
      panels.length !== 4 ||
      !panels.every((p): p is string => typeof p === "string" && p.trim().length > 0)
    ) {
      return { status: "failed", reason: REASON_BAD_PANELS };
    }
    if (signal.aborted) return { status: "failed", reason: REASON_TIMEOUT };

    // ② 画像のAI を1回
    // パーツで作ったキャラは確定した設定画の画像（sheetImage）を使う。例のキャラは public の設定画
    const sheets = await Promise.all(
      input.characters.map((c) => (c.sheetImage ? Promise.resolve(c.sheetImage) : this.loadSheet(c).catch(() => null))),
    );
    const parts = buildImageParts({
      ...frame,
      characters: input.characters,
      lines: input.lines,
      panels,
      sheets,
      prevImage: input.prevImage,
    });
    const imageRes = await this.generateContent({
      model: this.imageModel,
      contents: [{ role: "user", parts }],
      config: imageConfig(signal),
    });
    const read = readImageResponse(imageRes);
    if (!read.ok) return read.result;
    return { status: "done", image: read.image, panels };
  }
}
