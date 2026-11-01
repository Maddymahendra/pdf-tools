import { describe, expect, it } from "vitest";
import {
  calculateAspectDimensions,
  dimensionsAtPercentage,
  formatBytes,
  mimeForFormat,
  parseTargetBytes,
  reductionPercentage,
  resizedFilename,
  validateDimensions,
  validateTargetBytes
} from "../../src/lib/processing/browser/image-resizer";

describe("image resizer pure logic", () => {
  it("keeps aspect ratio when width changes", () => {
    expect(calculateAspectDimensions({ width: 1600, height: 900 }, { width: 800 }, true)).toEqual({ width: 800, height: 450 });
  });

  it("calculates percentage presets without upscaling surprises", () => {
    expect(dimensionsAtPercentage({ width: 401, height: 201 }, 50)).toEqual({ width: 201, height: 101 });
  });

  it("converts target size units and enforces the 10KB floor", () => {
    expect(parseTargetBytes(10, "KB")).toBe(10240);
    expect(parseTargetBytes(1, "MB")).toBe(1048576);
    expect(validateTargetBytes(9999)).toMatch(/at least/);
    expect(validateTargetBytes(10240)).toBeNull();
  });

  it("validates safe dimensions", () => {
    expect(validateDimensions({ width: 0, height: 20 })).toMatch(/positive/);
    expect(validateDimensions({ width: 12001, height: 20 })).toMatch(/smaller/);
    expect(validateDimensions({ width: 1000, height: 1000 })).toBeNull();
  });

  it("formats bytes and reports reduction without negative savings", () => {
    expect(formatBytes(10240)).toBe("10 KB");
    expect(reductionPercentage(1000, 400)).toBe(60);
    expect(reductionPercentage(1000, 1200)).toBe(0);
  });

  it("maps supported formats and creates a sensible filename", () => {
    expect(mimeForFormat("image/jpg")).toBe("image/jpeg");
    expect(mimeForFormat("image/gif")).toBeNull();
    expect(resizedFilename("holiday.photo.PNG", "image/webp")).toBe("holiday.photo-resized.webp");
  });
});
