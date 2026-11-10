import { describe, expect, it } from "vitest";
import { TEXT_MAX, TITLE_MAX, step1BlockReason } from "./newThemeSteps";

const axis = "魔法が使えない少年が、魔法の学園で一番の発明家を目指す";

describe("step1BlockReason", () => {
  it("作品名が TITLE_MAX+1 字で軸が収まるとき、作品名の理由を返して進めない", () => {
    const title = "あ".repeat(TITLE_MAX + 1);
    expect([...title].length).toBe(TITLE_MAX + 1);
    expect([...axis].length).toBeLessThanOrEqual(TEXT_MAX);
    expect(step1BlockReason(title, axis)).toBe("作品名が字数を超えています");
  });

  it("作品名が TITLE_MAX 字で軸があるとき、進めてよい", () => {
    expect(step1BlockReason("あ".repeat(TITLE_MAX), axis)).toBeNull();
  });

  it("作品名が空欄で軸があるとき、進めてよい", () => {
    expect(step1BlockReason("", axis)).toBeNull();
    expect(step1BlockReason("   ", axis)).toBeNull();
  });

  it("軸が空のときは、作品名が超過していても軸の理由を返す", () => {
    expect(step1BlockReason("あ".repeat(TITLE_MAX + 1), "  ")).toBe("物語の軸を入れてください");
  });

  it("軸が字数超過のときは、その理由を返す", () => {
    expect(step1BlockReason("短い題", "あ".repeat(TEXT_MAX + 1))).toBe("物語の軸が字数を超えています");
  });
});
