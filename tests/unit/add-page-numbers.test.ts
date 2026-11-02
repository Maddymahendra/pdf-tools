import { describe, expect, it } from "vitest";
import {
  calculatePlacement,
  formatPageNumber,
  normalizePageRotation,
  pageNumberForPhysicalPage,
  parsePageSelection,
  visibleSize,
  visibleToPagePoint
} from "../../src/lib/processing/browser/add-page-numbers";

const font = {
  widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
  heightAtSize: (size: number) => size
};

describe("add page numbers geometry and semantics", () => {
  it("uses physical-page progression and final-number denominators", () => {
    expect(pageNumberForPhysicalPage(5, 0)).toBe(5);
    expect(pageNumberForPhysicalPage(5, 9)).toBe(14);
    expect(formatPageNumber("number", 7, 14)).toBe("7");
    expect(formatPageNumber("page", 7, 14)).toBe("Page 7");
    expect(formatPageNumber("page-of", 7, 14)).toBe("Page 7 of 14");
  });

  it("normalizes supported rotations and rejects unsupported angles", () => {
    expect(normalizePageRotation(-90)).toBe(270);
    expect(normalizePageRotation(450)).toBe(90);
    expect(() => normalizePageRotation(45)).toThrow("not supported");
  });

  it("maps visible coordinates through all page rotations", () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    expect(visibleSize(box, 0)).toEqual({ width: 600, height: 800 });
    expect(visibleSize(box, 90)).toEqual({ width: 800, height: 600 });
    expect(visibleToPagePoint(box, 0, 0, 0)).toEqual({ x: 10, y: 20 });
    expect(visibleToPagePoint(box, 90, 0, 0)).toEqual({ x: 610, y: 20 });
    expect(visibleToPagePoint(box, 180, 0, 0)).toEqual({ x: 610, y: 820 });
    expect(visibleToPagePoint(box, 270, 0, 0)).toEqual({ x: 10, y: 820 });
  });

  it("aligns text using measured width and CropBox offsets", () => {
    const placement = calculatePlacement(
      { x: 50, y: 75, width: 500, height: 700 },
      0,
      "bottom-right",
      "Page 10",
      font,
      12
    );
    expect(placement.x).toBeCloseTo(484);
    expect(placement.y).toBe(99);
    expect(placement.rotate).toBeCloseTo(0);

    expect(calculatePlacement({ x: 0, y: 0, width: 200, height: 300 }, 90, "bottom-right", "Page 1", font, 12).rotate).toBeCloseTo(90);
    expect(calculatePlacement({ x: 0, y: 0, width: 200, height: 300 }, 180, "bottom-right", "Page 1", font, 12).rotate).toBeCloseTo(180);
    expect(calculatePlacement({ x: 0, y: 0, width: 200, height: 300 }, 270, "bottom-right", "Page 1", font, 12).rotate).toBeCloseTo(270);
  });

  it("keeps every requested position inside the visible page for every rotation", () => {
    const positions = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const position of positions) {
        const placement = calculatePlacement({ x: 20, y: 30, width: 260, height: 360 }, rotation, position, "Page 1 of 5", font, 12);
        expect(placement.x).toBeGreaterThanOrEqual(20);
        expect(placement.x).toBeLessThanOrEqual(280);
        expect(placement.y).toBeGreaterThanOrEqual(30);
        expect(placement.y).toBeLessThanOrEqual(390);
      }
    }
  });

  it("reuses the shared page-range parser", () => {
    expect(parsePageSelection("2-5,8,10", 10)).toEqual([2, 3, 4, 5, 8, 10]);
    expect(() => parsePageSelection("1,,3", 10)).toThrow();
    expect(() => parsePageSelection("1-3,3", 10)).toThrow("appears more than once");
  });
});
