// 両モデル（文章のAI・画像のAI）を1回ずつ呼んで、つながるか確かめる（#22 の確認用）。
// 作品の枠（作品名・物語の軸・絵柄・第何話の何ページ目・前のページのセリフ）とキャラ1体＋4行の例で漫画の1ページ（4コマ分）を1枚作り、tmp/ に保存する。
//
//   GOOGLE_CLOUD_PROJECT=<project> node tools/smoke-vertex.mjs [--dry-run]
//
//   --dry-run  呼ばずに、送る指示文と config だけ出す
// 認証は ADC（`gcloud auth application-default login`）。APIキーは使わない。
// アプリと同じ指示文（src/lib/generator/vertexPrompt.ts）・同じ config の形で呼ぶ。
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ThinkingLevel, Type } from "@google/genai";
import { artStylePrompt } from "../src/lib/artStyles.ts";
import { CHARACTERS } from "../src/lib/characters.ts";
import { buildImageParts, buildPanelsPrompt } from "../src/lib/generator/vertexPrompt.ts";
import { IMAGE_MODEL, LOCATION, TEXT_MODEL, describeImage, extForMime, firstImage, makeClient, sniffMime } from "./_vertex.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

const TITLE = "屋上の地図";
const THEME = "放課後の屋上で見つけた古い地図を手がかりに、高校生が学校に隠された秘密を探す。明るく少し不思議な冒険";
/** 絵柄（src/lib/artStyles.ts の1つ） */
const ART_STYLE = artStylePrompt("shonen");
/** 第1話の4ページ目（話の区切りのページ） */
const POSITION = { episode: 1, pageInEpisode: 4 };
const PREV_LINES = ["地図の端に旧校舎の印がある", "", "今夜、確かめに行こう", "……誰かに見られてる？"];
const character = CHARACTERS[0];
const LINES = ["この印、旧校舎のほうだ…", "誰かの足音！？", "", "隠れてる場合じゃない。行こう"];
/** 文章のAIが失敗した時に画像のAIへ渡す絵の指示（画像のAIも必ず1回試すため） */
const FALLBACK_PANELS = [
  `夕方の学校の屋上。古い地図を広げて真剣な顔で見つめる${character.name}。引きの絵で遠くに旧校舎`,
  `階段のほうを振り向き、はっと目を見開く${character.name}の顔の寄り`,
  `給水塔の陰に身を縮めて息をひそめる${character.name}。床に長い影が伸びる`,
  `地図を握りしめ、決意した顔で屋上の扉へ駆け出す${character.name}。夕日を背にした見上げの構図`,
];

const textConfig = {
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      ok: { type: Type.BOOLEAN },
      reason: { type: Type.STRING },
      panels: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["ok", "reason", "panels"],
    propertyOrdering: ["ok", "reason", "panels"],
  },
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
};
// seed・topK・temperature・topP・logprobs は渡すとエラーなので渡さない
const imageConfig = { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "2:3", imageSize: "1K" } };

const frame = { themeText: THEME, title: TITLE, artStyle: ART_STYLE, position: POSITION };
const textPrompt = buildPanelsPrompt({ ...frame, characters: [character], lines: LINES, prevLines: PREV_LINES });
if (dryRun) {
  console.log(`[dry-run] text model=${TEXT_MODEL} location=${LOCATION}`);
  console.log(`config=${JSON.stringify(textConfig)}\n${textPrompt}\n`);
}

const ai = dryRun ? null : makeClient();
let ok = true;

// ① 文章のAI
let panels = FALLBACK_PANELS;
if (!dryRun) {
  const t0 = Date.now();
  try {
    const res = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: textPrompt }] }],
      config: textConfig,
    });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const v = JSON.parse(res.text ?? "");
    const good = v.ok === true && Array.isArray(v.panels) && v.panels.length === 4;
    console.log(`text  ${good ? "OK  " : "NG  "} model=${TEXT_MODEL} location=${LOCATION} ${sec}s ok=${v.ok} panels=${Array.isArray(v.panels) ? v.panels.length : "-"}${v.reason ? ` reason=${v.reason}` : ""}`);
    if (good) panels = v.panels;
    else ok = false;
  } catch (e) {
    ok = false;
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`text  FAIL model=${TEXT_MODEL} location=${LOCATION} ${sec}s status=${e?.status ?? "-"} ${e instanceof Error ? e.message : e}`);
  }
}

// ② 画像のAI
const sheetFile = path.join(root, "public", ...character.sheetPath.split("/").filter(Boolean));
const sheetBytes = existsSync(sheetFile) ? await readFile(sheetFile) : null;
const sheet = sheetBytes ? { bytes: sheetBytes, mime: sniffMime(sheetBytes) } : null;
const parts = buildImageParts({
  ...frame,
  characters: [character],
  lines: LINES,
  panels,
  sheets: [sheet],
});
if (dryRun) {
  console.log(`[dry-run] image model=${IMAGE_MODEL} location=${LOCATION} 設定画=${sheet ? "あり" : "なし"}`);
  console.log(`config=${JSON.stringify(imageConfig)}`);
  for (const p of parts) console.log(p.inlineData ? `<画像 ${p.inlineData.mimeType}>` : p.text);
  process.exit(0);
}

const t1 = Date.now();
try {
  const res = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: imageConfig,
  });
  const sec = ((Date.now() - t1) / 1000).toFixed(1);
  const { image, finishReason, blockReason } = firstImage(res);
  if (!image) {
    ok = false;
    console.log(`image NG   model=${IMAGE_MODEL} location=${LOCATION} ${sec}s 画像なし finishReason=${finishReason} blockReason=${blockReason}`);
  } else {
    const dir = path.join(root, "tmp");
    await mkdir(dir, { recursive: true });
    const out = path.join(dir, `smoke-page-${new Date().toISOString().replace(/[:.]/g, "-")}.${extForMime(image.mime)}`);
    await writeFile(out, image.bytes);
    console.log(`image OK   model=${IMAGE_MODEL} location=${LOCATION} ${sec}s ${describeImage(image)} 漫画の1ページ（4コマ分） 設定画=${sheet ? "あり" : "なし"} → ${path.relative(root, out)}`);
  }
} catch (e) {
  ok = false;
  const sec = ((Date.now() - t1) / 1000).toFixed(1);
  console.log(`image FAIL model=${IMAGE_MODEL} location=${LOCATION} ${sec}s status=${e?.status ?? "-"} ${e instanceof Error ? e.message : e}`);
}
process.exit(ok ? 0 : 1);
