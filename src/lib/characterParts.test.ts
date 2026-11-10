import { describe, expect, it } from "vitest";
import { PART_KINDS, PART_OPTIONS, buildAppearance, validateParts, type CharacterParts } from "./characterParts";

const PARTS: CharacterParts = {
  hairStyle: "bob",
  hairColor: "brown",
  body: "small",
  outfit: "uniform",
  outfitColor: "blue",
  age: "teen",
  species: "human",
};

describe("characterParts の選択肢", () => {
  it("どの種類も 5〜8 個で、id が重複せず、指示文がある", () => {
    for (const k of PART_KINDS) {
      const opts = PART_OPTIONS[k];
      expect(opts.length).toBeGreaterThanOrEqual(5);
      expect(opts.length).toBeLessThanOrEqual(8);
      expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
      for (const o of opts) {
        expect(o.label).not.toBe("");
        expect(o.prompt).not.toBe("");
        expect(o.prompt).not.toMatch(/左|右/);
      }
    }
  });
});

describe("validateParts", () => {
  it("全種類が既知の id なら true", () => {
    expect(validateParts(PARTS)).toBe(true);
  });
  it("知らない id・足りない種類・余計な種類・形の違いは false", () => {
    expect(validateParts({ ...PARTS, hairColor: "rainbow" })).toBe(false);
    const { age: _age, ...lack } = PARTS;
    expect(validateParts(lack)).toBe(false);
    expect(validateParts({ ...PARTS, extra: "x" })).toBe(false);
    expect(validateParts({ ...PARTS, body: 1 })).toBe(false);
    expect(validateParts(null)).toBe(false);
    expect(validateParts([])).toBe(false);
    expect(validateParts("bob")).toBe(false);
  });
});

describe("buildAppearance", () => {
  it("パーツの指示文を含み、左右を書かない", () => {
    const s = buildAppearance(PARTS);
    for (const w of ["10代の人間", "小柄で細め", "肩までのボブ", "茶色", "青色のブレザーの制服"]) {
      expect(s).toContain(w);
    }
    expect(s).not.toMatch(/左|右/);
  });
  it("自由記入があれば末尾に足し、空白だけなら足さない", () => {
    expect(buildAppearance(PARTS, " 丸い眼鏡をかけている ")).toMatch(/ほかの特徴: 丸い眼鏡をかけている$/);
    expect(buildAppearance(PARTS, "  ")).toBe(buildAppearance(PARTS));
  });
});
