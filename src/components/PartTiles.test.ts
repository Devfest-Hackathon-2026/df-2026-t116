import { describe, expect, it } from "vitest";
import { BODY_SHAPE } from "./PartTiles";

function headTop(shape: { h: number; w: number }): number {
  const headR = Math.max(3, shape.w / 4);
  const bodyTop = 38 - shape.h;
  return bodyTop - 2 * headR + 1;
}

describe("BodyGlyph", () => {
  it("どの体型も頭の上端が viewBox の内側にある", () => {
    const clipped = Object.entries(BODY_SHAPE)
      .filter(([, shape]) => headTop(shape) < 0)
      .map(([id, shape]) => `${id}:${headTop(shape)}`);
    expect(clipped).toEqual([]);
  });
});
