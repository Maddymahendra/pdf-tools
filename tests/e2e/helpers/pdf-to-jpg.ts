import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pdfJsVersion = "6.3.289";

export async function useLocalPdfToJpgDependencies(page: Page): Promise<void> {
  const pdfJsPath = resolve("node_modules/pdfjs-dist/build/pdf.min.mjs");
  const pdfWorkerPath = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
  const jsZipPath = resolve("node_modules/jszip/dist/jszip.min.js");

  await page.route(
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.min.mjs`,
    async (route) => route.fulfill({
      body: await readFile(pdfJsPath),
      contentType: "text/javascript"
    })
  );
  await page.route(
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/build/pdf.worker.min.mjs`,
    async (route) => route.fulfill({
      body: await readFile(pdfWorkerPath),
      contentType: "text/javascript"
    })
  );
  await page.route(
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    async (route) => route.fulfill({
      body: await readFile(jsZipPath),
      contentType: "text/javascript"
    })
  );
}

export async function uploadPdf(page: Page, fileName: string, bytes: Buffer): Promise<void> {
  await page.locator("#pdfInput").setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: bytes
  });
  await expect(page.locator("#settings")).toBeVisible();
}

export async function convert(page: Page, quality: string): Promise<void> {
  await page.locator("#quality").selectOption(quality);
  await page.locator("#convertBtn").click();
  await expect(page.locator("#status")).toHaveText("Conversion complete!", { timeout: 30_000 });
}

export async function previewDimensions(page: Page): Promise<{ width: number; height: number }> {
  const preview = page.locator("img.preview").first();
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return preview.evaluate((image) => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight
  }));
}

export function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
}
