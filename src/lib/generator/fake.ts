// 本物の生成の代わり。漫画の1ページ分の SVG（512x768＝2:3、横長のコマ4つを縦に並べる）を作る。
import type {
  ComicGenerator,
  GenerateInput,
  GenerateResult,
  GenerateSheetInput,
  GenerateSheetResult,
  ModerationResult,
} from "./types";

const W = 512;
const PANEL = 192; // 768 / 4

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 日本語を1行あたり n 文字で折り返す */
function wrap(text: string, n: number): string[] {
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += n) out.push(chars.slice(i, i + n).join(""));
  return out.length ? out : [""];
}

const LABELS = ["1", "2", "3", "4"];

export function renderFakeSvg(input: GenerateInput): string {
  const names = input.characters.map((c) => c.name).join("・");
  const panels = input.lines.map((line, i) => {
    const y = i * PANEL;
    const textLines = wrap(line, 18)
      .map(
        (t, j) =>
          `<text x="${W / 2}" y="${y + 110 + j * 30}" font-size="24" text-anchor="middle">${escapeXml(t)}</text>`,
      )
      .join("");
    return [
      `<rect x="8" y="${y + 8}" width="${W - 16}" height="${PANEL - 16}" fill="#fff" stroke="#000" stroke-width="6"/>`,
      `<text x="24" y="${y + 44}" font-size="22" font-weight="bold">${LABELS[i]}</text>`,
      `<text x="${W / 2}" y="${y + 70}" font-size="20" text-anchor="middle" fill="#555">${escapeXml(names)}</text>`,
      textLines,
    ].join("");
  });
  // デモで見分けやすいように、上の端に「第N話 Mページ」を小さく描く
  const pos = input.position
    ? `<text x="${W - 24}" y="40" font-size="16" text-anchor="end" fill="#888">第${input.position.episode}話 ${input.position.pageInEpisode}ページ</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PANEL * 4}" viewBox="0 0 ${W} ${PANEL * 4}" font-family="sans-serif"><rect width="100%" height="100%" fill="#eee"/>${panels.join("")}${pos}</svg>`;
}

/** 設定画の代わりの正方形の SVG（名前だけ描く） */
export function renderFakeSheetSvg(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" font-family="sans-serif"><rect width="100%" height="100%" fill="#fff"/><circle cx="256" cy="190" r="90" fill="#eee" stroke="#000" stroke-width="6"/><rect x="176" y="290" width="160" height="170" fill="#eee" stroke="#000" stroke-width="6"/><text x="256" y="490" font-size="24" text-anchor="middle">${escapeXml(name)}</text></svg>`;
}

export class FakeGenerator implements ComicGenerator {
  constructor(private readonly delayMs = 500) {}

  async moderateTheme(text: string): Promise<ModerationResult> {
    if (text.includes("NG")) return { ok: false, reason: "お題に使えない言葉が含まれています" };
    return { ok: true };
  }

  async generate(input: GenerateInput, signal: AbortSignal): Promise<GenerateResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (signal.aborted) return { status: "failed", reason: "時間切れ" };
    if (input.lines.some((l) => l.includes("NG"))) {
      return { status: "rejected", reason: "続きに使えない言葉が含まれています" };
    }
    const svg = renderFakeSvg(input);
    return {
      status: "done",
      image: { bytes: new TextEncoder().encode(svg), mime: "image/svg+xml" },
      panels: input.lines.map((l, i) => `コマ${i + 1}: ${l || "（セリフなし）"}`),
    };
  }

  async generateSheet(input: GenerateSheetInput, signal: AbortSignal): Promise<GenerateSheetResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (signal.aborted) return { status: "failed", reason: "時間切れ" };
    return {
      status: "done",
      image: { bytes: new TextEncoder().encode(renderFakeSheetSvg(input.character.name)), mime: "image/svg+xml" },
    };
  }
}
