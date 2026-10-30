import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { createMalformedPdfFixture, createPdfFixture } from "../fixtures/pdf";
import { readDownloadedPdf } from "./helpers/pdf-output";
import { useLocalPdfPageDependencies } from "./helpers/runtime-cdn";

async function upload(page: Page, bytes: Buffer, name = "sample.pdf") {
  await page.locator("#pdfInput").setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
  await expect(page.locator("#fileSection")).toBeVisible();
  await expect(page.locator("#processBtn")).toBeEnabled();
}

async function downloadedBytes(page: Page, locator: string): Promise<Buffer> {
  const downloadPromise = page.waitForEvent("download");
  await page.locator(locator).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Download did not produce a temporary file.");
  return readFile(path);
}

async function downloadedPath(page: Page, locator: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.locator(locator).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Download did not produce a temporary file.");
  return path;
}

test.describe("new PDF page tools", () => {
  test.beforeEach(async ({ page }) => {
    await useLocalPdfPageDependencies(page);
  });

  test("split PDF creates one valid PDF per page and a ZIP", async ({ page }) => {
    await page.goto("/tools/split-pdf/");
    await upload(page, createPdfFixture(3, "split"));
    await page.locator("#processBtn").click();
    await expect(page.locator("#resultList .file-card")).toHaveCount(3);
    const firstPath = await downloadedPath(page, "#resultList .file-card button:first-of-type");
    const first = await readDownloadedPdf(page, firstPath);
    expect(first.pages).toHaveLength(1);
    const zipBytes = await downloadedBytes(page, "#downloadAll");
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files).sort()).toEqual(["sample-1.pdf", "sample-2.pdf", "sample-3.pdf"]);
  });

  test("split PDF supports selected ranges and reset/repeat", async ({ page }) => {
    await page.goto("/tools/split-pdf/");
    await upload(page, createPdfFixture(4));
    await page.locator("#splitMode").selectOption("ranges");
    await page.locator("#rangeInput").fill("1, 3-4");
    await page.locator("#processBtn").click();
    await expect(page.locator("#resultList .file-card")).toHaveCount(2);
    await page.locator("#resetBtn").click();
    await upload(page, createPdfFixture(1, "again"), "again.pdf");
    await page.locator("#processBtn").click();
    await expect(page.locator("#resultList .file-card")).toHaveCount(1);
  });

  test("PDF to PNG generates one non-empty PNG per page", async ({ page }) => {
    await page.goto("/tools/pdf-to-png/");
    await upload(page, createPdfFixture(2, "png"));
    await page.locator("#scale").selectOption("2.5");
    await page.locator("#processBtn").click();
    await expect(page.locator("#resultList .file-card")).toHaveCount(2);
    const png = await downloadedBytes(page, "#resultList .file-card button:first-of-type");
    expect(png.length).toBeGreaterThan(100);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const zip = await JSZip.loadAsync(await downloadedBytes(page, "#downloadAll"));
    expect(Object.keys(zip.files)).toHaveLength(2);
  });

  test("rotate PDF preserves page count and handles selected pages", async ({ page }) => {
    await page.goto("/tools/rotate-pdf/");
    await upload(page, createPdfFixture(3, "rotate"));
    await page.locator("#rotateScope").selectOption("selected");
    await page.locator("#rangeInput").fill("2");
    await page.locator("#angle").selectOption("180");
    await page.locator("#processBtn").click();
    const pdfPath = await downloadedPath(page, "#resultList .file-card button");
    const pdf = await readDownloadedPdf(page, pdfPath);
    expect(pdf.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.pages).toHaveLength(3);
  });

  for (const kind of ["remove-pages", "extract-pages"] as const) {
    test(`${kind} validates ranges and produces a parseable PDF`, async ({ page }) => {
      await page.goto(`/tools/${kind}/`);
      await upload(page, createPdfFixture(4, kind));
      await page.locator("#rangeInput").fill(kind === "remove-pages" ? "2, 4" : "1, 3-4");
      await page.locator("#processBtn").click();
      const pdfPath = await downloadedPath(page, "#resultList .file-card button");
      const pdf = await readDownloadedPdf(page, pdfPath);
      const header = pdf.bytes.subarray(0, 5).toString("ascii");
      expect(header).toBe("%PDF-");
      expect(pdf.bytes.length).toBeGreaterThan(100);
      expect(pdf.pages).toHaveLength(kind === "remove-pages" ? 2 : 3);
      await page.locator("#resetBtn").click();
      await page.locator("#pdfInput").setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: createMalformedPdfFixture() });
      await expect(page.locator("#processBtn")).toBeDisabled();
      await expect(page.locator("#status")).toContainText("Could not read this PDF");
    });
  }
});
