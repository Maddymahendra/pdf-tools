import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { useLocalPdfPageDependencies } from "./helpers/runtime-cdn";
import { useLocalPdfToJpgDependencies } from "./helpers/pdf-to-jpg";

async function createNumberingFixture(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const angle of [0, 90, 180, 270]) {
    const page = document.addPage([260, 360]);
    page.setCropBox(20, 30, 200, 300);
    page.setRotation(degrees(angle));
    page.drawText(`Original ${angle}`, { x: 50, y: 160, size: 12, font });
  }
  return Buffer.from(await document.save());
}

async function createTextFixture(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= 3; index += 1) {
    const page = document.addPage([300, 400]);
    page.drawText(`Original page ${index}`, { x: 40, y: 200, size: 16, font });
  }
  return Buffer.from(await document.save());
}

async function downloadResult(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("add-page-numbers-result").getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function renderDarkBounds(page, bytes: Buffer) {
  return page.evaluate(async (input) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true }).promise;
    const bounds = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const current = await document.getPage(index);
      const viewport = current.getViewport({ scale: 1 });
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await current.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] < 180 && pixels[offset + 1] < 180 && pixels[offset + 2] < 180) {
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
        }
      }
      bounds.push({ width: canvas.width, height: canvas.height, minX, minY, maxX, maxY });
    }
    return bounds;
  }, [...bytes]);
}

async function extractText(page, bytes: Buffer) {
  return page.evaluate(async (input) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true }).promise;
    const pages = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const text = await (await document.getPage(index)).getTextContent();
      pages.push(text.items.map((item: any) => item.str).join(" "));
    }
    return pages;
  }, [...bytes]);
}

async function extractNumberingAngles(page, bytes: Buffer) {
  return page.evaluate(async (input) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true }).promise;
    const angles = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const content = await (await document.getPage(index)).getTextContent();
      const item = content.items.find((entry: any) => entry.str.startsWith("Page ")) as any;
      if (!item) throw new Error(`Page number text was not found on page ${index}.`);
      angles.push(Math.atan2(item.transform[1], item.transform[0]) * 180 / Math.PI);
    }
    return angles;
  }, [...bytes]);
}

async function extractRenderedRects(page, bytes: Buffer) {
  return page.evaluate(async (input) => {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true }).promise;
    return Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const current = await document.getPage(index + 1);
      const viewport = current.getViewport({ scale: 1 });
      const content = await current.getTextContent();
      const item = content.items.find((entry: any) => entry.str.startsWith("Page ")) as any;
      const [a, b, c, d, e, f] = item.transform;
      const textWidthInGlyphUnits = item.width / Math.hypot(a, b);
      const textHeightInGlyphUnits = item.height / Math.hypot(c, d);
      const points = [[0, 0], [textWidthInGlyphUnits, 0], [0, textHeightInGlyphUnits], [textWidthInGlyphUnits, textHeightInGlyphUnits]].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
      const transformed = points.map(([x, y]) => [viewport.transform[0] * x + viewport.transform[2] * y + viewport.transform[4], viewport.transform[1] * x + viewport.transform[3] * y + viewport.transform[5]]);
      return { viewport: [viewport.width, viewport.height], points: transformed };
    }));
  }, [...bytes]);
}

function assertVisiblePosition(rect: { viewport: number[]; points: number[][] }, position: string) {
  const xs = rect.points.map(([x]) => x);
  const ys = rect.points.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = rect.viewport[0] - Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = rect.viewport[1] - Math.max(...ys);
  if (position.endsWith("left")) expect(Math.abs(left - 24)).toBeLessThan(1.5);
  if (position.endsWith("right")) expect(Math.abs(right - 24)).toBeLessThan(1.5);
  if (position.endsWith("center")) expect(Math.abs((left - right) / 2)).toBeLessThan(1);
  if (position.startsWith("top")) expect(Math.abs(top - 24)).toBeLessThan(1.5);
  if (position.startsWith("bottom")) expect(Math.abs(bottom - 24)).toBeLessThan(1.5);
}

test.describe("Add Page Numbers", () => {
  test("loads with approved defaults and preserves privacy", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.method() !== "GET") requests.push(request.url()); });
    await useLocalPdfPageDependencies(page);
    await page.goto("/tools/add-page-numbers/");
    await expect(page).toHaveTitle("Add Page Numbers to PDF Online Free | DeshFiles");
    await expect(page.locator("h1")).toHaveText("Add Page Numbers");
    await expect(page.locator("#startingNumber")).toHaveValue("1");
    await expect(page.locator("#fontSize")).toHaveValue("12");
    await expect(page.locator("input[value='page']")).toBeChecked();
    await expect(page.locator("input[value='all']")).toBeChecked();
    expect(requests).toEqual([]);
  });

  test("places Bottom Right numbers correctly across rotations and CropBox offsets", async ({ page }) => {
    const original = await createNumberingFixture();
    await useLocalPdfPageDependencies(page);
    await page.goto("/tools/add-page-numbers/");
    await page.locator("#addPageNumbersInput").setInputFiles({ name: "rotations.pdf", mimeType: "application/pdf", buffer: original });
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("PDF ready.");
    await page.locator("#numberPosition").selectOption("bottom-right");
    await page.getByTestId("add-page-numbers-tool").locator("[data-action='process']").click();
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("Page numbers added.", { timeout: 30_000 });
    const output = await downloadResult(page);
    const bounds = await renderDarkBounds(page, output);
    const angles = await extractNumberingAngles(page, output);
    const renderedRects = await extractRenderedRects(page, output);
    expect(bounds).toHaveLength(4);
    for (const [index, angle] of angles.entries()) {
      const visualAngle = ((angle - [0, 90, 180, 270][index] + 540) % 360) - 180;
      expect(Math.abs(visualAngle)).toBeLessThan(1);
    }
    for (const bound of bounds) {
      expect(bound.maxX).toBeGreaterThan(bound.width * 0.6);
      expect(bound.maxY).toBeGreaterThan(bound.height * 0.6);
      expect(bound.minX).toBeGreaterThanOrEqual(0);
      expect(bound.minY).toBeGreaterThanOrEqual(0);
    }
    for (const rect of renderedRects) {
      const xs = rect.points.map(([x]) => x);
      const ys = rect.points.map(([, y]) => y);
      expect(rect.viewport[0] - Math.max(...xs)).toBeCloseTo(24, 0);
      expect(rect.viewport[1] - Math.max(...ys)).toBeCloseTo(24, 0);
    }
  });

  test("uses physical progression for custom pages and preserves original text", async ({ page }) => {
    const original = await createTextFixture();
    await useLocalPdfPageDependencies(page);
    await page.goto("/tools/add-page-numbers/");
    await page.locator("#addPageNumbersInput").setInputFiles({ name: "custom.pdf", mimeType: "application/pdf", buffer: original });
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("PDF ready.");
    await page.locator("input[value='page-of']").check();
    await page.locator("input[value='custom']").check();
    await page.locator("#pageRange").fill("2-3");
    await page.locator("#startingNumber").fill("5");
    await page.getByTestId("add-page-numbers-tool").locator("[data-action='process']").click();
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("Page numbers added.", { timeout: 30_000 });
    const text = await extractText(page, await downloadResult(page));
    expect(text[0]).toContain("Original page 1");
    expect(text[0]).not.toContain("Page 5 of 7");
    expect(text[1]).toContain("Original page 2");
    expect(text[1]).toContain("Page 6 of 7");
    expect(text[2]).toContain("Original page 3");
    expect(text[2]).toContain("Page 7 of 7");
  });

  test("keeps all six positions at the same visible margin across rotations", async ({ page }) => {
    const original = await createNumberingFixture();
    await useLocalPdfPageDependencies(page);
    await page.goto("/tools/add-page-numbers/");
    await page.locator("#addPageNumbersInput").setInputFiles({ name: "positions.pdf", mimeType: "application/pdf", buffer: original });
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("PDF ready.");

    for (const position of ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]) {
      await page.locator("#numberPosition").selectOption(position);
      await page.getByTestId("add-page-numbers-tool").locator("[data-action='process']").click();
      await expect(page.getByTestId("add-page-numbers-status")).toHaveText("Page numbers added.", { timeout: 30_000 });
      const output = await downloadResult(page);
      for (const rect of await extractRenderedRects(page, output)) assertVisiblePosition(rect, position);
      await page.getByTestId("add-page-numbers-tool").locator("[data-action='reset']").click();
      if (position !== "bottom-right") {
        await page.locator("#addPageNumbersInput").setInputFiles({ name: "positions.pdf", mimeType: "application/pdf", buffer: original });
        await expect(page.getByTestId("add-page-numbers-status")).toHaveText("PDF ready.");
      }
    }
  });

  test("reports invalid custom ranges and can reset", async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    await page.goto("/tools/add-page-numbers/");
    await page.locator("#addPageNumbersInput").setInputFiles({ name: "range.pdf", mimeType: "application/pdf", buffer: await createTextFixture() });
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("PDF ready.");
    await page.locator("input[value='custom']").check();
    await page.locator("#pageRange").fill("1,,3");
    await page.getByTestId("add-page-numbers-tool").locator("[data-action='process']").click();
    await expect(page.getByTestId("add-page-numbers-status")).toContainText("Invalid page selection");
    await page.getByTestId("add-page-numbers-tool").locator("[data-action='reset']").click();
    await expect(page.getByTestId("add-page-numbers-file")).not.toHaveClass(/visible/);
    await expect(page.getByTestId("add-page-numbers-status")).toHaveText("Ready for another PDF.");
  });
});
