import { expect, test } from "@playwright/test";
import { dropFiles, readDownloadedPdf } from "./helpers/pdf-output";
import { useLocalJpgToPdfDependencies } from "./helpers/runtime-cdn";
import { createJpegFixture, createPngFixture } from "../fixtures/images";

async function uploadImages(page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.locator("#fileInput").setInputFiles(files);
  await expect(page.locator("#imageCount")).toHaveText(`${files.length} ${files.length === 1 ? "image" : "images"}`);
}

async function createPdf(page, testInfo) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#createButton").click();
  await expect(page.locator("#status")).toHaveText("PDF created successfully.");
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(outputPath);
  return readDownloadedPdf(page, outputPath);
}

test.beforeEach(async ({ page }) => {
  await useLocalJpgToPdfDependencies(page);
  await page.goto("/tools/jpg-to-pdf/", { waitUntil: "domcontentloaded" });
});

test("uploads JPG and PNG images and creates previews", async ({ page }) => {
  await uploadImages(page, [
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: createJpegFixture() },
    { name: "wide.png", mimeType: "image/png", buffer: createPngFixture(200, 100) }
  ]);

  await expect(page.locator(".image-card")).toHaveCount(2);
  await expect(page.locator("img.preview")).toHaveCount(2);
  await expect(page.locator("#createButton")).toBeEnabled();
});

test("supports drag and drop for image upload", async ({ page }) => {
  await dropFiles(page, "#uploadArea", [{
    name: "drop.png",
    mimeType: "image/png",
    bytes: createPngFixture(100, 200)
  }]);
  await expect(page.locator("#imageCount")).toHaveText("1 image");
  await expect(page.locator("img.preview")).toHaveCount(1);
});

test("removes an individual image and clears the tool", async ({ page }) => {
  await uploadImages(page, [
    { name: "one.png", mimeType: "image/png", buffer: createPngFixture(100, 100) },
    { name: "two.png", mimeType: "image/png", buffer: createPngFixture(120, 80) }
  ]);

  await page.locator(".remove-image").first().click();
  await expect(page.locator("#imageCount")).toHaveText("1 image");
  await expect(page.locator(".image-card")).toHaveCount(1);

  await page.locator("#clearButton").click();
  await expect(page.locator("#imageCount")).toHaveText("0 images");
  await expect(page.locator("#imagesSection")).toBeHidden();
  await expect(page.locator("#createButton")).toBeDisabled();
});

test("creates a one-image-per-page A4 portrait PDF with a 10 mm margin", async ({ page }, testInfo) => {
  await uploadImages(page, [
    { name: "portrait.png", mimeType: "image/png", buffer: createPngFixture(100, 200) }
  ]);
  await page.locator("#pageSize").selectOption("a4");
  await page.locator("#orientation").selectOption("portrait");
  await page.locator("#margin").selectOption("10");
  await page.locator("#layout").selectOption("single");

  const result = await createPdf(page, testInfo);
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].width).toBeCloseTo(595.28, 0);
  expect(result.pages[0].height).toBeCloseTo(841.89, 0);
});

test("creates a multi-image-per-page Letter landscape PDF with a 5 mm margin", async ({ page }, testInfo) => {
  await uploadImages(page, [
    { name: "left.png", mimeType: "image/png", buffer: createPngFixture(200, 100) },
    { name: "right.png", mimeType: "image/png", buffer: createPngFixture(100, 200) }
  ]);
  await page.locator("#pageSize").selectOption("letter");
  await page.locator("#orientation").selectOption("landscape");
  await page.locator("#margin").selectOption("5");
  await page.locator("#layout").selectOption("multiple");

  const result = await createPdf(page, testInfo);
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].width).toBeCloseTo(792, 0);
  expect(result.pages[0].height).toBeCloseTo(612, 0);
  expect(result.pages[0].imageRatios.some((ratio) => Math.abs(ratio - 2) < 0.01)).toBe(true);
  expect(result.pages[0].imageRatios.some((ratio) => Math.abs(ratio - 0.5) < 0.01)).toBe(true);
});

test("supports image-size mode with auto orientation and no margin", async ({ page }, testInfo) => {
  await uploadImages(page, [
    { name: "wide.png", mimeType: "image/png", buffer: createPngFixture(200, 100) },
    { name: "tall.png", mimeType: "image/png", buffer: createPngFixture(100, 200) }
  ]);
  await page.locator("#pageSize").selectOption("image");
  await page.locator("#orientation").selectOption("auto");
  await page.locator("#margin").selectOption("0");
  await page.locator("#layout").selectOption("multiple");

  const result = await createPdf(page, testInfo);
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0].width).toBeGreaterThan(result.pages[0].height);
  expect(result.pages[1].height).toBeGreaterThan(result.pages[1].width);
});

test("can create a second PDF after clearing the first selection", async ({ page }, testInfo) => {
  await uploadImages(page, [
    { name: "first.png", mimeType: "image/png", buffer: createPngFixture(100, 100) }
  ]);
  const first = await createPdf(page, testInfo);
  expect(first.pages).toHaveLength(1);

  await page.locator("#clearButton").click();
  await expect(page.locator("#createButton")).toBeDisabled();
  await uploadImages(page, [
    { name: "second.png", mimeType: "image/png", buffer: createPngFixture(200, 100) },
    { name: "third.png", mimeType: "image/png", buffer: createPngFixture(100, 200) }
  ]);
  const second = await createPdf(page, testInfo);
  expect(second.pages).toHaveLength(2);
});

test("ignores unsupported image files", async ({ page }) => {
  await page.locator("#fileInput").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image")
  });

  await expect(page.locator("#imageCount")).toHaveText("0 images");
  await expect(page.locator("#createButton")).toBeDisabled();
});
