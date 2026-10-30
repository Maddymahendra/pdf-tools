import { expect, test } from "@playwright/test";
import { createMalformedPdfFixture, createPdfFixture } from "../fixtures/pdf";
import { readDownloadedPdf, dropFiles } from "./helpers/pdf-output";
import { useLocalMergePdfDependencies } from "./helpers/runtime-cdn";

type PdfFile = { name: string; mimeType: string; buffer: Buffer };

async function uploadPdfs(page, files: PdfFile[]) {
  await page.locator("#pdf-input").setInputFiles(files);
  await expect(page.locator("#file-count")).toHaveText(`${files.length} ${files.length === 1 ? "file" : "files"}`);
}

async function mergeAndRead(page, testInfo) {
  await page.locator("#merge-button").click();
  await expect(page.locator("#result-area")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(outputPath);
  return readDownloadedPdf(page, outputPath);
}

test.beforeEach(async ({ page }) => {
  await useLocalMergePdfDependencies(page);
  await page.goto("/tools/merge-pdf/", { waitUntil: "domcontentloaded" });
});

test("requires at least two PDFs, then merges multiple PDFs", async ({ page, }, testInfo) => {
  const first = { name: "first.pdf", mimeType: "application/pdf", buffer: createPdfFixture(1, "First") };
  const second = { name: "second.pdf", mimeType: "application/pdf", buffer: createPdfFixture(2, "Second") };

  await uploadPdfs(page, [first]);
  await expect(page.locator("#merge-button")).toBeDisabled();
  await page.locator("#pdf-input").setInputFiles([second]);
  await expect(page.locator("#file-count")).toHaveText("2 files");
  await expect(page.locator("#merge-button")).toBeEnabled();

  const result = await mergeAndRead(page, testInfo);
  expect(result.pages).toHaveLength(3);
  expect(result.pages.map((page) => page.text)).toEqual([
    expect.stringContaining("First page 1"),
    expect.stringContaining("Second page 1"),
    expect.stringContaining("Second page 2")
  ]);
});

test("supports drag and drop and removing a PDF", async ({ page }) => {
  const first = { name: "drop-one.pdf", mimeType: "application/pdf", bytes: createPdfFixture(1) };
  const second = { name: "drop-two.pdf", mimeType: "application/pdf", bytes: createPdfFixture(1) };
  await dropFiles(page, "#upload-area", [first, second]);
  await expect(page.locator("#file-count")).toHaveText("2 files");
  await expect(page.locator("#merge-button")).toBeEnabled();

  await page.locator(".remove-file").first().click();
  await expect(page.locator("#file-count")).toHaveText("1 file");
  await expect(page.locator("#merge-button")).toBeDisabled();
});

test("clears the selection and can merge again after reset", async ({ page, }, testInfo) => {
  const first = { name: "before-reset.pdf", mimeType: "application/pdf", buffer: createPdfFixture(1) };
  const second = { name: "after-reset.pdf", mimeType: "application/pdf", buffer: createPdfFixture(1) };

  await uploadPdfs(page, [first, second]);
  const firstResult = await mergeAndRead(page, testInfo);
  expect(firstResult.pages).toHaveLength(2);

  await page.locator("#clear-button").click();
  await expect(page.locator("#file-section")).toBeHidden();
  await expect(page.locator("#merge-button")).toBeDisabled();

  await uploadPdfs(page, [first, second]);
  const secondResult = await mergeAndRead(page, testInfo);
  expect(secondResult.pages).toHaveLength(2);
});

test("reorders PDFs and preserves the selected page order", async ({ page }, testInfo) => {
  const first = { name: "first.pdf", mimeType: "application/pdf", buffer: createPdfFixture(1, "First") };
  const second = { name: "second.pdf", mimeType: "application/pdf", buffer: createPdfFixture(2, "Second") };
  await uploadPdfs(page, [first, second]);

  await page.locator(".file-item").first().evaluate((item) => {
    const target = item.parentElement!.querySelectorAll(".file-item")[1]!;
    const dataTransfer = new DataTransfer();
    item.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    item.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
  });

  await expect(page.locator(".file-item strong").nth(0)).toHaveText("second.pdf");
  await expect(page.locator(".file-item strong").nth(1)).toHaveText("first.pdf");
  const result = await mergeAndRead(page, testInfo);
  expect(result.pages.map((pdfPage) => pdfPage.text)).toEqual([
    expect.stringContaining("Second page 1"),
    expect.stringContaining("Second page 2"),
    expect.stringContaining("First page 1")
  ]);
});

test("ignores non-PDF files and reports malformed PDFs", async ({ page }) => {
  await page.locator("#pdf-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a PDF")
  });
  await expect(page.locator("#file-section")).toBeHidden();

  const valid = { name: "valid.pdf", mimeType: "application/pdf", buffer: createPdfFixture(1) };
  const malformed = { name: "malformed.pdf", mimeType: "application/pdf", buffer: createMalformedPdfFixture() };
  await uploadPdfs(page, [valid, malformed]);
  const dialogMessagePromise = new Promise<string>((resolve) => {
    page.once("dialog", async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
  await page.locator("#merge-button").click();
  expect(await dialogMessagePromise).toContain("couldn't merge these PDF files");
  await expect(page.locator("#result-area")).toBeHidden();
});
