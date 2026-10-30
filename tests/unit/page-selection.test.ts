import { describe, expect, it } from "vitest";
import { PageSelectionError, parsePageRanges, parsePageSelection } from "../../src/lib/processing/page-selection";

describe("page selection parser", () => {
  it("parses pages, ranges, mixed input, and whitespace", () => {
    expect(parsePageSelection(" 1, 3-5, 8 ", 10)).toEqual([1, 3, 4, 5, 8]);
    expect(parsePageRanges("1-3, 5", 10).map((range) => range.pages)).toEqual([[1, 2, 3], [5]]);
  });

  it("rejects duplicates and reversed ranges", () => {
    expect(() => parsePageSelection("1,1", 3)).toThrow("appears more than once");
    expect(() => parsePageSelection("3-1", 3)).toThrow("must start before");
  });

  it("rejects empty, zero, negative, non-numeric, and out-of-range input", () => {
    for (const input of ["", "0", "-1", "abc", "4"]) {
      expect(() => parsePageSelection(input, 3)).toThrow(PageSelectionError);
    }
  });
});
