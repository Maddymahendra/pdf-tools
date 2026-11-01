import { expect, test } from "@playwright/test";
import { createJpegFixture, createPngFixture } from "../fixtures/images";

const route = "/tools/image-resizer/";

async function upload(page, name: string, mimeType: string, buffer: Buffer) {
  await page.goto(route);
  await page.locator("#imageInput").setInputFiles({ name, mimeType, buffer });
  await expect(page.locator("#fileSection")).toBeVisible();
  await expect(page.locator("#optionsSection")).toBeVisible();
}

async function downloadBytes(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadBtn").click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return { bytes: await (await import("node:fs/promises")).readFile(path!), filename: download.suggestedFilename() };
}

test.describe("Image Resizer", () => {
  test("loads with the correct route, metadata, and privacy copy", async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveTitle("Image Resizer — Resize Images Online | DeshFiles");
    await expect(page.locator("h1")).toHaveText("Image Resizer");
    await expect(page.getByText("Your image stays on your device.")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://deshfiles.com/tools/image-resizer/");
  });

  test("accepts a PNG, shows dimensions, and resizes by percentage", async ({ page }) => {
    await upload(page, "sample.png", "image/png", createPngFixture(80, 40, [220, 80, 40, 255]));
    await expect(page.locator("#fileMeta")).toContainText("80 × 40 px");
    await page.locator("#percentagePreset").selectOption("50");
    await expect(page.locator("#widthInput")).toHaveValue("40");
    await expect(page.locator("#heightInput")).toHaveValue("20");
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultSection")).toBeVisible();
    await expect(page.locator("#resultMeta")).toContainText("40 × 20 px");
    const { bytes, filename } = await downloadBytes(page);
    expect(filename).toBe("sample-resized.png");
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.length).toBeGreaterThan(0);
  });

  test("keeps aspect ratio by default and supports unlocked dimensions", async ({ page }) => {
    await upload(page, "photo.jpg", "image/jpeg", createJpegFixture());
    await page.locator("#widthInput").fill("200");
    await expect(page.locator("#heightInput")).toHaveValue("200");
    await page.locator("#lockAspect").uncheck();
    await page.locator("#heightInput").fill("100");
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultMeta")).toContainText("200 × 100 px");
  });

  test("supports explicit JPG output and uses a JPG download signature", async ({ page }) => {
    await upload(page, "source.png", "image/png", createPngFixture(40, 30, [20, 180, 120, 255]));
    await page.locator("#outputFormat").selectOption("image/jpeg");
    await expect(page.locator("#formatWarning")).toBeVisible();
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultSection")).toBeVisible();
    const { bytes, filename } = await downloadBytes(page);
    expect(filename).toBe("source-resized.jpg");
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  });

  test("accepts a deterministic browser-generated WebP and preserves its format", async ({ page }) => {
    await page.goto(route);
    const webpBase64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 24; canvas.height = 16;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#1766e8"; context.fillRect(0, 0, 24, 16);
      return canvas.toDataURL("image/webp").split(",")[1];
    });
    await page.locator("#imageInput").setInputFiles({ name: "sample.webp", mimeType: "image/webp", buffer: Buffer.from(webpBase64, "base64") });
    await expect(page.locator("#fileSection")).toBeVisible();
    await expect(page.locator("#fileMeta")).toContainText("WebP");
    await page.locator("#resizeBtn").click();
    const { bytes, filename } = await downloadBytes(page);
    expect(filename).toBe("sample-resized.webp");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  test("optimizes a large input to the 10KB target without fragile size comparisons", async ({ page }) => {
    const padded = Buffer.concat([createJpegFixture(), Buffer.alloc(30 * 1024, 7)]);
    await upload(page, "large.jpg", "image/jpeg", padded);
    await page.locator("#fileSizeTab").click();
    await expect(page.locator("#fileSizePanel")).toBeVisible();
    await page.locator("#targetPreset").selectOption("10-KB");
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultSection")).toBeVisible();
    const resultBytes = Number(await page.locator("#resultMeta").getAttribute("data-result-bytes"));
    expect(resultBytes).toBeGreaterThan(0);
    expect(resultBytes).toBeLessThanOrEqual(10 * 1024);
    const { bytes } = await downloadBytes(page);
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  });

  test("supports drag and drop, reset, and a repeated conversion", async ({ page }) => {
    await page.goto(route);
    const buffer = createPngFixture(32, 32, [40, 90, 220, 255]);
    await page.evaluate((bytes) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([Uint8Array.from(bytes)], "drop.png", { type: "image/png" }));
      document.querySelector("#uploadArea")?.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    }, [...buffer]);
    await expect(page.locator("#fileSection")).toBeVisible();
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultSection")).toBeVisible();
    await page.locator("#resultResetBtn").click();
    await expect(page.locator("#fileSection")).toBeHidden();
    await upload(page, "again.png", "image/png", buffer);
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#resultSection")).toBeVisible();
  });

  test("rejects unsupported and malformed files with a useful error", async ({ page }) => {
    await page.goto(route);
    await page.locator("#imageInput").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await expect(page.locator("#errorMessage")).toContainText("valid JPG, PNG or WebP");
    await page.locator("#imageInput").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await expect(page.locator("#errorMessage")).toContainText("could not be decoded");
  });

  test("rejects a target below the 10KB minimum", async ({ page }) => {
    await upload(page, "small.jpg", "image/jpeg", createJpegFixture());
    await page.locator("#fileSizeTab").click();
    await page.locator("#targetSize").fill("9");
    await page.locator("#resizeBtn").click();
    await expect(page.locator("#errorMessage")).toContainText("at least 10 KB");
  });
});
