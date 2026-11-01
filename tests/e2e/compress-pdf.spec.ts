import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createEncryptedPdfFixture, createMalformedPdfFixture } from "../fixtures/pdf";
import { createNoisyPngFixture, createTransparentPngFixture } from "../fixtures/images";
import { useLocalPdfToJpgDependencies } from "./helpers/pdf-to-jpg";

async function createImagePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText("DeshFiles compression fixture", { x: 40, y: 740, size: 18, font, color: rgb(0, 0, 0) });
  const image = await document.embedPng(createNoisyPngFixture(240, 160));
  page.drawImage(image, { x: 40, y: 400, width: 520, height: 347 });
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function createOptimizedTextPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText("Already optimized text", { x: 40, y: 740, size: 18, font });
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function createTransparentPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const image = await document.embedPng(createTransparentPngFixture(120, 80));
  const page = document.addPage([612, 792]);
  page.drawImage(image, { x: 40, y: 500, width: 400, height: 267 });
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function upload(page, name: string, buffer: Buffer) {
  await useLocalPdfToJpgDependencies(page);
  await page.goto("/tools/compress-pdf/");
  await page.locator("#compressPdfInput").setInputFiles({ name, mimeType: "application/pdf", buffer });
  await expect(page.getByTestId("compress-status")).toHaveText("PDF ready.");
}

test.describe("Compress PDF", () => {
  test("loads with metadata, privacy copy, and Recommended selected", async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    await page.goto("/tools/compress-pdf/");
    await expect(page).toHaveTitle("Compress PDF Online - Reduce PDF File Size | DeshFiles");
    await expect(page.locator("h1")).toHaveText("Compress PDF");
    await expect(page.getByText("Your PDF is processed locally in your browser and is not uploaded.")).toBeVisible();
    await expect(page.locator("input[value='recommended']")).toBeChecked();
    await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", "https://deshfiles.com/tools/compress-pdf/");
  });

  test("compresses an image PDF, validates the result, and supports download/reset", async ({ page }) => {
    const nonGetRequests: string[] = [];
    const documentDataRequests: string[] = [];
    page.on("request", (request) => {
      const body = request.postData() ?? "";
      if (request.method() !== "GET") nonGetRequests.push(request.url());
      if (request.url().includes("image-heavy.pdf") || request.url().includes("DeshFiles compression fixture") || body.includes("image-heavy.pdf") || body.includes("DeshFiles compression fixture")) documentDataRequests.push(request.url());
    });
    const original = await createImagePdf();
    await upload(page, "image-heavy.pdf", original);
    await expect(page.getByTestId("compress-file-meta")).toContainText("1 page");
    await page.getByTestId("compress-tool").locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-status")).toHaveText("Compression complete.", { timeout: 30_000 });
    const compressedText = await page.locator("[data-result='compressed']").textContent();
    expect(compressedText).toBeTruthy();
    await expect(page.getByTestId("compress-result")).toHaveAttribute("data-output-type", "application/pdf");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-action='download']").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-compressed\.pdf$/);
    const stream = await download.createReadStream();
    expect(stream).toBeTruthy();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(original.length);
    expect(nonGetRequests).toEqual([]);
    expect(documentDataRequests).toEqual([]);
    await page.locator("[data-action='reset']").click();
    await expect(page.getByTestId("compress-file")).toBeHidden();
    await expect(page.getByTestId("compress-status")).toHaveText("Ready for a PDF.");
  });

  test("supports drag and drop and a repeated conversion", async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    const original = await createImagePdf();
    await page.goto("/tools/compress-pdf/");
    await page.evaluate((bytes) => { const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(bytes)], "drop.pdf", { type: "application/pdf" })); document.querySelector("[data-testid='compress-dropzone']")?.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); }, [...original]);
    await expect(page.getByTestId("compress-status")).toHaveText("PDF ready.");
    await page.locator("[data-action='remove']").click();
    await page.locator("#compressPdfInput").setInputFiles({ name: "again.pdf", mimeType: "application/pdf", buffer: original });
    await expect(page.getByTestId("compress-status")).toHaveText("PDF ready.");
  });

  test("rejects invalid and malformed PDFs", async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    await page.goto("/tools/compress-pdf/");
    await page.locator("#compressPdfInput").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not pdf") });
    await expect(page.getByTestId("compress-status")).toContainText("choose a PDF");
    await page.locator("#compressPdfInput").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: createMalformedPdfFixture() });
    await expect(page.getByTestId("compress-status")).toContainText("couldn't read this PDF");
  });

  test("rejects encrypted PDFs before compression", async ({ page }) => {
    await page.goto("/tools/compress-pdf/");
    await page.locator("#compressPdfInput").setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: createEncryptedPdfFixture() });
    await expect(page.getByTestId("compress-status")).toContainText("password protected");
  });

  test("refuses unsafe transparency without producing an opaque JPEG", async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    await page.goto("/tools/compress-pdf/");
    await page.locator("#compressPdfInput").setInputFiles({ name: "transparent.pdf", mimeType: "application/pdf", buffer: await createTransparentPdf() });
    await expect(page.getByTestId("compress-status")).toContainText("transparency that cannot be safely optimized");
    await expect(page.getByTestId("compress-result")).toBeHidden();
  });

  test("reports no benefit for an already optimized text PDF", async ({ page }) => {
    await upload(page, "text.pdf", await createOptimizedTextPdf());
    await page.locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-status")).toContainText("already well optimized", { timeout: 30_000 });
    await expect(page.getByTestId("compress-result")).toBeHidden();
  });

  test("clears a previous result before a failed subsequent attempt", async ({ page }) => {
    const original = await createImagePdf();
    await upload(page, "first.pdf", original);
    await page.locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-result")).toBeVisible({ timeout: 30_000 });
    await page.locator("#compressPdfInput").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: createMalformedPdfFixture() });
    await expect(page.getByTestId("compress-result")).toBeHidden();
    await expect(page.getByTestId("compress-status")).toContainText("couldn't read this PDF");
  });

  test("rejects files over the 50 MB limit before parsing", async ({ page }) => {
    await page.goto("/tools/compress-pdf/");
    const oversized = Buffer.concat([Buffer.from("%PDF-1.7\n", "ascii"), Buffer.alloc(50 * 1024 * 1024)]);
    const folder = await mkdtemp(join(tmpdir(), "deshfiles-compress-"));
    const filePath = join(folder, "oversized.pdf");
    try {
      await writeFile(filePath, oversized);
      await page.locator("#compressPdfInput").setInputFiles(filePath);
      await expect(page.getByTestId("compress-status")).toHaveText("This PDF is larger than the 50 MB limit.");
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  test("is available from the homepage and sitemap", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Compress PDF/ }).first()).toBeVisible();
    const sitemap = await page.request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("https://deshfiles.com/tools/compress-pdf/");
  });
});
