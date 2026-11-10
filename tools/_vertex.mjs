// tools/ の共通部品。Vertex AI を ADC で呼ぶ（APIキーは使わない）。
// 前提: `gcloud auth application-default login` 済み・env GOOGLE_CLOUD_PROJECT を設定済み。
// src/lib の .ts を Node の型の取り除き（Node 22.18 以上・24 は既定で有効）で直接読む。
import { GoogleGenAI } from "@google/genai";

export const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
export const TEXT_MODEL = process.env.TEXT_MODEL ?? "gemini-3.8-flash";
export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? "gemini-nano-banana-2.1";

export function requireProject() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    console.error("GOOGLE_CLOUD_PROJECT を設定してください（例: GOOGLE_CLOUD_PROJECT=my-project node tools/...）");
    process.exit(2);
  }
  return project;
}

export function makeClient() {
  return new GoogleGenAI({ vertexai: true, project: requireProject(), location: LOCATION });
}

/** 返りの最初の画像。無ければ null（finishReason なども返す） */
export function firstImage(res) {
  const cand = res.candidates?.[0];
  const part = (cand?.content?.parts ?? []).find((p) => !p.thought && p.inlineData?.data);
  return {
    image: part
      ? { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType ?? "image/png" }
      : null,
    finishReason: cand?.finishReason ?? null,
    blockReason: res.promptFeedback?.blockReason ?? null,
  };
}

/** PNG・JPEG の縦横（分からなければ null） */
export function imageSize(b) {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** 先頭の数バイトから画像の形式を見る */
export function sniffMime(b) {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

export function extForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export function describeImage(img) {
  const size = imageSize(img.bytes);
  return `${img.mime} ${img.bytes.length} bytes${size ? ` ${size.width}x${size.height}` : ""}`;
}
