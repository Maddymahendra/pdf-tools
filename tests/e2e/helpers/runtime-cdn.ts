import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { useLocalPdfToJpgDependencies } from "./pdf-to-jpg";

export async function useLocalJpgToPdfDependencies(page: Page): Promise<void> {
  await page.route(
    "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js",
    async (route) => route.fulfill({
      body: await readFile(resolve("node_modules/jspdf/dist/jspdf.umd.min.js")),
      contentType: "text/javascript"
    })
  );
}

export async function useLocalMergePdfDependencies(page: Page): Promise<void> {
  await page.route(
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm",
    async (route) => route.fulfill({
      body: await readFile(resolve("node_modules/pdf-lib/dist/pdf-lib.esm.js")),
      contentType: "text/javascript"
    })
  );
}

export async function useLocalPdfPageDependencies(page: Page): Promise<void> {
  await useLocalPdfToJpgDependencies(page);
  await useLocalMergePdfDependencies(page);
}
