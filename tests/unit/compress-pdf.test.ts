import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  calculateSavedPercent,
  formatFileSize,
  getCompressionSettings,
  hasCompressionBenefit,
  isPdfSignature,
  validateFileSize,
  MAX_COMPRESS_FILE_BYTES
} from "../../src/lib/processing/browser/compress-pdf";
import { createEncryptedPdfFixture } from "../fixtures/pdf";
import { createTransparentPngFixture } from "../fixtures/images";

describe("Compress PDF processing helpers", () => {
  it("maps the three levels to the approved settings", () => {
    expect(getCompressionSettings("better")).toEqual({ quality: 93, scale: 1 });
    expect(getCompressionSettings("recommended")).toEqual({ quality: 85, scale: 1 });
    expect(getCompressionSettings("maximum")).toEqual({ quality: 55, scale: 0.75 });
  });

  it("only reports a benefit when the output is smaller", () => {
    expect(hasCompressionBenefit(1000, 900)).toBe(true);
    expect(hasCompressionBenefit(1000, 1000)).toBe(false);
    expect(hasCompressionBenefit(1000, 1100)).toBe(false);
    expect(calculateSavedPercent(1000, 900)).toBe(10);
    expect(calculateSavedPercent(1000, 1100)).toBe(0);
  });

  it("recognizes signatures, formats sizes, and enforces the file limit", () => {
    expect(isPdfSignature(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(isPdfSignature(new TextEncoder().encode("not pdf"))).toBe(false);
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
    expect(() => validateFileSize(MAX_COMPRESS_FILE_BYTES + 1)).toThrow("50 MB");
  });

  it("rejects an encrypted PDF during the PDF-level safety preflight", async () => {
    const { compressPdf, inspectPdfSafety } = await import("../../src/lib/processing/browser/compress-pdf");
    const file = new File([createEncryptedPdfFixture()], "locked.pdf");
    await expect(inspectPdfSafety(file)).rejects.toThrow("password protected");
    const engine = vi.fn();
    await expect(compressPdf(file, "recommended", { pageCount: 1, totalPixels: 1, textSample: "" }, {}, engine as never)).rejects.toThrow("password protected");
    expect(engine).not.toHaveBeenCalled();
  });

  it("detects soft-mask PDFs for selective image skipping", async () => {
    const document = await PDFDocument.create();
    const image = await document.embedPng(createTransparentPngFixture(20, 20));
    const page = document.addPage([100, 100]);
    page.drawImage(image, { x: 10, y: 10, width: 80, height: 80 });
    const file = new File([await document.save({ useObjectStreams: true })], "transparent.pdf");
    const { compressPdf, inspectPdfSafety } = await import("../../src/lib/processing/browser/compress-pdf");
    await expect(inspectPdfSafety(file)).resolves.toEqual({ hasSoftMask: true });
    expect((await inspectPdfSafety(file)).hasSoftMask).toBe(true);
  });
});
