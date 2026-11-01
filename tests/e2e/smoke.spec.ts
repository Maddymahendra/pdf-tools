import { expect, test } from "@playwright/test";
import { useLocalPdfToJpgDependencies } from "./helpers/pdf-to-jpg";
import { useLocalJpgToPdfDependencies, useLocalMergePdfDependencies } from "./helpers/runtime-cdn";

const routes = [
  {
    path: "/",
    heading: "PDF work, made simple.",
    title: /DeshFiles — Free Online File & PDF Tools/
  },
  {
    path: "/tools/pdf-to-jpg/",
    heading: "PDF to JPG",
    title: /PDF to JPG/
  },
  {
    path: "/tools/jpg-to-pdf/",
    heading: "JPG to PDF",
    title: /JPG to PDF/
  },
  {
    path: "/tools/merge-pdf/",
    heading: "Merge PDF",
    title: /Merge PDF/
  },
  {
    path: "/tools/compress-pdf/",
    heading: "Compress PDF",
    title: /Compress PDF/
  }
];

for (const route of routes) {
  test(`${route.path} loads successfully`, async ({ page }) => {
    await useLocalPdfToJpgDependencies(page);
    await useLocalJpgToPdfDependencies(page);
    await useLocalMergePdfDependencies(page);
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto(route.path, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(route.title);
    await expect(page.locator("h1")).toHaveText(route.heading);
    expect(pageErrors).toEqual([]);
  });
}
