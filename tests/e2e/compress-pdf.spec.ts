import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, rgb } from "pdf-lib";
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

async function createMixedPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([612, 792]);
  page.drawText("DeshFiles mixed transparency fixture", { x: 40, y: 740, size: 18, font });
  const opaque = await document.embedPng(createNoisyPngFixture(240, 160));
  const transparent = await document.embedPng(createTransparentPngFixture(120, 80));
  page.drawImage(opaque, { x: 40, y: 400, width: 520, height: 347 });
  page.drawImage(transparent, { x: 80, y: 300, width: 180, height: 120 });
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function createSharedTransparentMixedPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const transparent = await document.embedPng(createTransparentPngFixture(120, 80));
  const opaque = await document.embedPng(createNoisyPngFixture(240, 160));
  for (let index = 0; index < 2; index += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Shared transparency page ${index + 1}`, { x: 40, y: 740, size: 18, font });
    page.drawImage(transparent, { x: 80, y: 300, width: 180, height: 120 });
    page.drawImage(opaque, { x: 40, y: 400, width: 520, height: 347 });
  }
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function createNestedFormMixedPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const transparent = await document.embedPng(createTransparentPngFixture(120, 80));
  const opaque = await document.embedPng(createNoisyPngFixture(240, 160));
  const formContent = Buffer.from("q 120 0 0 80 0 0 cm /Im1 Do Q q 420 0 0 280 140 120 cm /Im2 Do Q", "ascii");
  const formDictionary = document.context.obj({
    Type: "XObject", Subtype: "Form", BBox: [0, 0, 560, 500],
    Resources: document.context.obj({ XObject: document.context.obj({ Im1: transparent.ref, Im2: opaque.ref }) })
  });
  const formRef = document.context.register(PDFRawStream.of(formDictionary, formContent));
  const page = document.addPage([612, 792]);
  const pageContent = Buffer.from("q /Fm1 Do Q", "ascii");
  const pageStream = document.context.register(PDFRawStream.of(document.context.obj({ Length: pageContent.length }), pageContent));
  (page as any).node.set(PDFName.of("Resources"), document.context.obj({ XObject: document.context.obj({ Fm1: formRef }) }));
  (page as any).node.set(PDFName.of("Contents"), pageStream);
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function createMaskedPdf(imageMask: boolean): Promise<Buffer> {
  const document = await PDFDocument.create();
  const page = document.addPage([240, 160]);
  const values: Record<string, unknown> = { Type: "XObject", Subtype: "Image", Width: imageMask ? 8 : 1, Height: 1, BitsPerComponent: imageMask ? 1 : 8, Filter: "FlateDecode" };
  if (imageMask) values.ImageMask = true;
  else { values.ColorSpace = "DeviceRGB"; values.Mask = [0, 0]; }
  const data = imageMask ? Buffer.from([0]) : Buffer.from([0, 0, 0]);
  const imageRef = document.context.register(PDFRawStream.of(document.context.obj(values), deflateSync(data)));
  const content = Buffer.from("q 200 0 0 120 20 20 cm /Im1 Do Q", "ascii");
  const contentRef = document.context.register(PDFRawStream.of(document.context.obj({ Length: content.length }), content));
  (page as any).node.set(PDFName.of("Resources"), document.context.obj({ XObject: document.context.obj({ Im1: imageRef }) }));
  (page as any).node.set(PDFName.of("Contents"), contentRef);
  return Buffer.from(await document.save({ useObjectStreams: true }));
}

async function inspectImageObjects(bytes: Buffer): Promise<{ softMasks: number; jpegImages: number }> {
  const document = await PDFDocument.load(bytes);
  let softMasks = 0;
  let jpegImages = 0;
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of("Subtype"))?.asString?.().replace(/^\//, "") !== "Image") continue;
    if (object.dict.get(PDFName.of("SMask"))) softMasks += 1;
    if (object.dict.get(PDFName.of("Filter"))?.asString?.().replace(/^\//, "") === "DCTDecode") jpegImages += 1;
  }
  return { softMasks, jpegImages };
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
    const original = await createMixedPdf();
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
    const objects = await inspectImageObjects(bytes);
    expect(objects.softMasks).toBeGreaterThan(0);
    expect(objects.jpegImages).toBeGreaterThan(0);
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
    await upload(page, "transparent.pdf", await createTransparentPdf());
    await page.locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-status")).toContainText("already well optimized", { timeout: 30_000 });
    await expect(page.getByTestId("compress-result")).toBeHidden();
  });

  test("preserves a shared transparent image while compressing another image", async ({ page }) => {
    const original = await createSharedTransparentMixedPdf();
    await upload(page, "shared.pdf", original);
    await page.locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-status")).toHaveText("Compression complete.", { timeout: 30_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-action='download']").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(2);
    const objects = await inspectImageObjects(bytes);
    expect(objects.softMasks).toBeGreaterThan(0);
    expect(objects.jpegImages).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThan(original.length);
  });

  test("preserves transparency nested inside a Form XObject", async ({ page }) => {
    const original = await createNestedFormMixedPdf();
    await upload(page, "nested-form.pdf", original);
    await page.locator("[data-action='compress']").click();
    await expect(page.getByTestId("compress-status")).toHaveText("Compression complete.", { timeout: 30_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-action='download']").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect((await inspectImageObjects(bytes)).softMasks).toBeGreaterThan(0);
    expect((await inspectImageObjects(bytes)).jpegImages).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThan(original.length);
  });

  for (const [label, imageMask] of [["color-key mask", false], ["image mask", true]] as const) {
    test(`preserves ${label} objects without JPEG replacement`, async ({ page }) => {
      const original = await createMaskedPdf(imageMask);
      await upload(page, `${imageMask ? "image-mask" : "color-mask"}.pdf`, original);
      await page.locator("[data-action='compress']").click();
      await expect.poll(() => page.getByTestId("compress-status").textContent(), { timeout: 30_000 }).toMatch(/Compression complete\.|already well optimized/);
      if ((await page.getByTestId("compress-status").textContent()) === "Compression complete.") {
        const downloadPromise = page.waitForEvent("download");
        await page.locator("[data-action='download']").click();
        const download = await downloadPromise;
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        expect((await inspectImageObjects(Buffer.concat(chunks))).jpegImages).toBe(0);
      }
    });
  }

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
