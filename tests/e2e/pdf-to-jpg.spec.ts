import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { createMalformedPdfFixture, createPdfFixture } from "../fixtures/pdf";
import {
  convert,
  isJpeg,
  previewDimensions,
  uploadPdf,
  useLocalPdfToJpgDependencies
} from "./helpers/pdf-to-jpg";

test.beforeEach(async ({ page }) => {
  await useLocalPdfToJpgDependencies(page);
  await page.goto("/tools/pdf-to-jpg/", { waitUntil: "domcontentloaded" });
});

test("uploads a single-page PDF, reports its page count, and creates one preview", async ({ page }) => {
  await uploadPdf(page, "single-page.pdf", createPdfFixture(1));

  await expect(page.locator("#pageCount")).toHaveText("1 page");
  await convert(page, "2");

  await expect(page.locator("img.preview")).toHaveCount(1);
  await expect.poll(() => page.locator("#progressBar").evaluate((bar) => (bar as HTMLElement).style.width)).toBe("100%");
  await expect(page.locator("img.preview").first()).toHaveAttribute("alt", "Converted page 1");
});

test("uploads a multi-page PDF and generates previews progressively", async ({ page }) => {
  await uploadPdf(page, "three-pages.pdf", createPdfFixture(3));
  await expect(page.locator("#pageCount")).toHaveText("3 pages");

  await page.evaluate(() => {
    const counts: number[] = [];
    const list = document.querySelector("#resultList")!;
    const observer = new MutationObserver(() => {
      counts.push(list.querySelectorAll("img.preview").length);
    });
    observer.observe(list, { childList: true, subtree: true });
    (window as Window & { __previewCounts?: number[]; __previewObserver?: MutationObserver }).__previewCounts = counts;
    (window as Window & { __previewCounts?: number[]; __previewObserver?: MutationObserver }).__previewObserver = observer;
  });

  await convert(page, "2");
  await expect(page.locator("img.preview")).toHaveCount(3);

  const counts = await page.evaluate(() => {
    const state = window as Window & { __previewCounts?: number[]; __previewObserver?: MutationObserver };
    state.__previewObserver?.disconnect();
    return state.__previewCounts ?? [];
  });
  expect(counts.at(-1)).toBe(3);
  expect(counts.some((count) => count > 0 && count < 3)).toBe(true);
});

test("supports standard, high, and very high quality settings", async ({ page }) => {
  const dimensions: Array<{ width: number; height: number }> = [];

  for (const quality of ["1.5", "2", "2.5"]) {
    await uploadPdf(page, `quality-${quality}.pdf`, createPdfFixture(1));
    await convert(page, quality);
    dimensions.push(await previewDimensions(page));
    await page.locator("#removeBtn").click();
    await expect(page.locator("#fileSection")).toBeHidden();
  }

  expect(dimensions[0].width).toBeLessThan(dimensions[1].width);
  expect(dimensions[1].width).toBeLessThan(dimensions[2].width);
  expect(dimensions[0].height).toBeLessThan(dimensions[1].height);
  expect(dimensions[1].height).toBeLessThan(dimensions[2].height);
});

test("downloads a valid JPG for an individual page", async ({ page }, testInfo) => {
  await uploadPdf(page, "download-test.pdf", createPdfFixture(1));
  await convert(page, "2");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".download-btn").click();
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(outputPath);
  const bytes = await readFile(outputPath);

  expect(bytes.length).toBeGreaterThan(0);
  expect(isJpeg(bytes)).toBe(true);
  const decoded = await page.evaluate(async (base64) => {
    const response = await fetch(`data:image/jpeg;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, bytes.toString("base64"));
  expect(decoded.width).toBeGreaterThan(0);
  expect(decoded.height).toBeGreaterThan(0);
});

test("downloads a valid ZIP containing every JPG page", async ({ page }, testInfo) => {
  await uploadPdf(page, "archive-test.pdf", createPdfFixture(3));
  await convert(page, "2");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadAll").click();
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(outputPath);
  const bytes = await readFile(outputPath);

  expect(bytes.length).toBeGreaterThan(0);
  const archive = await JSZip.loadAsync(bytes);
  const names = Object.keys(archive.files).sort();
  expect(names).toEqual([
    "archive-test-page-1.jpg",
    "archive-test-page-2.jpg",
    "archive-test-page-3.jpg"
  ]);

  for (const name of names) {
    const jpg = await archive.file(name)!.async("nodebuffer");
    expect(jpg.length).toBeGreaterThan(0);
    expect(isJpeg(jpg)).toBe(true);
  }
});

test("can reset and complete a second conversion", async ({ page }) => {
  await uploadPdf(page, "first.pdf", createPdfFixture(1));
  await convert(page, "2");
  await page.locator("#removeBtn").click();

  await expect(page.locator("#fileSection")).toBeHidden();
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#progressBar")).toHaveCSS("width", "0%");

  await uploadPdf(page, "second.pdf", createPdfFixture(2));
  await expect(page.locator("#pageCount")).toHaveText("2 pages");
  await convert(page, "1.5");
  await expect(page.locator("img.preview")).toHaveCount(2);
});

test("rejects a non-PDF file before processing", async ({ page }) => {
  const dialogPromise = page.waitForEvent("dialog");
  const uploadPromise = page.locator("#pdfInput").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a PDF")
  });
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe("Please select a PDF file.");
  await dialog.accept();
  await uploadPromise;
  await expect(page.locator("#fileSection")).toBeHidden();
});

test("reports malformed PDF input without producing results", async ({ page }) => {
  await page.locator("#pdfInput").setInputFiles({
    name: "malformed.pdf",
    mimeType: "application/pdf",
    buffer: createMalformedPdfFixture()
  });

  await expect(page.locator("#status")).toHaveText("Unable to read this PDF.");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#results")).toBeHidden();
});
