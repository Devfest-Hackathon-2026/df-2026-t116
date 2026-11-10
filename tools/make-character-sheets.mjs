// 各キャラの設定画（正面の全身1人・白い背景・1:1・1K）を Nano Banana 2.1 で作り、public/characters/{id}.png に保存する。
// 支払い設定の後に1回だけ動かす。既にあれば飛ばす。
//
//   GOOGLE_CLOUD_PROJECT=<project> node tools/make-character-sheets.mjs [--force] [--only=mikan,tetsu] [--dry-run]
//
//   --force    既にある設定画も作り直す
//   --only     作るキャラの id（カンマ区切り）
//   --dry-run  呼ばずに、送る指示文だけ出す
// 認証は ADC（`gcloud auth application-default login`）。APIキーは使わない。
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ART_STYLE, CHARACTERS } from "../src/lib/characters.ts";
import { buildSheetPrompt } from "../src/lib/generator/vertexPrompt.ts";
import { IMAGE_MODEL, LOCATION, describeImage, firstImage, makeClient } from "./_vertex.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",").filter(Boolean);

const targets = only ? CHARACTERS.filter((c) => only.includes(c.id)) : CHARACTERS;
if (only && targets.length !== only.length) {
  console.error(`知らない id があります: ${only.filter((id) => !CHARACTERS.some((c) => c.id === id)).join(", ")}`);
  process.exit(2);
}

const ai = dryRun ? null : makeClient();
console.log(`model=${IMAGE_MODEL} location=${LOCATION}${dryRun ? " (dry-run)" : ""}`);

let failed = 0;
for (const c of targets) {
  const out = path.join(root, "public", ...c.sheetPath.split("/").filter(Boolean));
  if (existsSync(out) && !force) {
    console.log(`${c.id}: 既にあるので飛ばす（--force で作り直し） ${path.relative(root, out)}`);
    continue;
  }
  const prompt = buildSheetPrompt(c, ART_STYLE);
  if (dryRun) {
    console.log(`--- ${c.id} → ${path.relative(root, out)}\n${prompt}\n`);
    continue;
  }
  const started = Date.now();
  try {
    const res = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // seed・topK・temperature・topP・logprobs は渡すとエラーなので渡さない
      config: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "1K" } },
    });
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    const { image, finishReason, blockReason } = firstImage(res);
    if (!image) {
      failed++;
      console.error(`${c.id}: 画像が返りませんでした（finishReason=${finishReason} blockReason=${blockReason}） ${sec}s`);
      continue;
    }
    if (image.mime !== "image/png") console.warn(`${c.id}: 返りが ${image.mime}。そのまま ${path.basename(out)} に保存する`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, image.bytes);
    console.log(`${c.id}: 保存 ${path.relative(root, out)} ${describeImage(image)} ${sec}s`);
  } catch (e) {
    failed++;
    console.error(`${c.id}: 失敗 status=${e?.status ?? "-"} ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
