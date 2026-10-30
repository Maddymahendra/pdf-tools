import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export async function readDownloadedPdf(page: Page, outputPath: string) {
  const bytes = await readFile(outputPath);
  if (bytes.length === 0 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Downloaded file is not a non-empty PDF.");
  }

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true
  }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const documentPage = await pdf.getPage(pageNumber);
    const viewport = documentPage.getViewport({ scale: 1 });
    const text = await documentPage.getTextContent();
    const operatorList = await documentPage.getOperatorList();
    const imageRatios: number[] = [];
    let lastTransform: number[] | null = null;
    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const fn = operatorList.fnArray[index];
      const args = operatorList.argsArray[index] as number[] | null;
      if (fn === pdfjsLib.OPS.transform && args) {
        lastTransform = args;
      }
      if (
        (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) &&
        lastTransform
      ) {
        imageRatios.push(Math.abs(lastTransform[0] / lastTransform[3]));
      }
    }
    pages.push({
      width: viewport.width,
      height: viewport.height,
      text: text.items.map((item) => "str" in item ? item.str : "").join(" "),
      imageRatios
    });
  }
  return { bytes, pages };
}

export async function dropFiles(
  page: Page,
  selector: string,
  files: Array<{ name: string; mimeType: string; bytes: Buffer }>
): Promise<void> {
  await page.locator(selector).evaluate((element, fileData) => {
    const dataTransfer = new DataTransfer();
    for (const file of fileData) {
      const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
      dataTransfer.items.add(new File([bytes], file.name, { type: file.mimeType }));
    }
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, files.map((file) => ({ ...file, base64: file.bytes.toString("base64") })));
}
