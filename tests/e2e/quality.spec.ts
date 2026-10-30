import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { useLocalJpgToPdfDependencies, useLocalMergePdfDependencies } from "./helpers/runtime-cdn";
import { useLocalPdfToJpgDependencies } from "./helpers/pdf-to-jpg";

const pages = [
  { path: "/", heading: "PDF work, made simple." },
  { path: "/tools/pdf-to-jpg/", heading: "PDF to JPG" },
  { path: "/tools/jpg-to-pdf/", heading: "JPG to PDF" },
  { path: "/tools/merge-pdf/", heading: "Merge PDF" },
  { path: "/tools/split-pdf/", heading: "Split PDF" },
  { path: "/tools/pdf-to-png/", heading: "PDF to PNG" },
  { path: "/tools/rotate-pdf/", heading: "Rotate PDF" },
  { path: "/tools/remove-pages/", heading: "Remove PDF Pages" },
  { path: "/tools/extract-pages/", heading: "Extract PDF Pages" }
];

async function preparePage(page) {
  await useLocalPdfToJpgDependencies(page);
  await useLocalJpgToPdfDependencies(page);
  await useLocalMergePdfDependencies(page);
}

test.describe("accessibility", () => {
  for (const route of pages) {
    test(`${route.path} has no serious or critical Axe violations`, async ({ page }) => {
      await preparePage(page);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical"
      );
      expect(seriousOrCritical).toEqual([]);
    });

    test(`${route.path} has usable headings, labels, names, and keyboard focus`, async ({ page }) => {
      await preparePage(page);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).not.toHaveText("");

      const fileInputLabels = await page.locator('input[type="file"]').evaluateAll((inputs) =>
        inputs.map((input) => input.labels?.length ?? 0)
      );
      expect(fileInputLabels.every((count) => count > 0)).toBe(true);

      const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
        buttons.filter((button) => {
          const name = button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title");
          return !name;
        }).length
      );
      expect(unnamedButtons).toBe(0);

      const firstInteractive = page.locator("a:visible, button:visible").first();
      await firstInteractive.focus();
      await expect(firstInteractive).toBeFocused();
    });
  }
});

test.describe("responsive layout", () => {
  const viewports = [
    { name: "mobile", width: 375, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 }
  ];

  for (const viewport of viewports) {
    for (const route of pages) {
      test(`${route.path} renders without overflow at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await preparePage(page);
        await page.goto(route.path, { waitUntil: "domcontentloaded" });

        await expect(page.locator("h1")).toHaveText(route.heading);
        await expect(page.locator("header")).toBeVisible();
        await expect(page.locator("footer")).toBeVisible();

        const layout = await page.evaluate(() => {
          const viewportWidth = window.innerWidth;
          const visibleRect = (element: Element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          };
          const primary = Array.from(document.querySelectorAll(
            "main, .tool-card, .upload-area, .upload, #createButton, #merge-button, #convertBtn"
          )).filter((element) => {
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
          });
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth,
            primaryRects: primary.map(visibleRect)
          };
        });

        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        for (const rect of layout.primaryRects) {
          expect(rect.left).toBeGreaterThanOrEqual(-1);
          expect(rect.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
        }
      });
    }
  }
});

test.describe("SEO and metadata", () => {
  for (const route of pages) {
    test(`${route.path} has valid page metadata`, async ({ page }) => {
      await preparePage(page);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });

      const expectedCanonical = `https://deshfiles.com${route.path}`;
      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expectedCanonical);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /.+/);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", expectedCanonical);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", /.+/);

      const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(structuredData.length).toBeGreaterThan(0);
      for (const json of structuredData) {
        expect(() => JSON.parse(json)).not.toThrow();
      }
    });
  }

  test("available tool pages have distinct titles and descriptions", async ({ page }) => {
    const metadata: Array<{ title: string; description: string }> = [];
    for (const route of pages) {
      await preparePage(page);
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      metadata.push({
        title: await page.title(),
        description: await page.locator('meta[name="description"]').getAttribute("content") ?? ""
      });
    }
    expect(new Set(metadata.map((item) => item.title)).size).toBe(metadata.length);
    expect(new Set(metadata.map((item) => item.description)).size).toBe(metadata.length);
  });
});

test.describe("sitemap, robots, and internal links", () => {
  test("sitemap contains only the current available tools", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    const sitemap = await response.text();
    for (const path of ["/", ...pages.slice(1).map((route) => route.path)]) {
      expect(sitemap).toContain(`https://deshfiles.com${path}`);
    }
    for (const slug of ["compress-pdf"]) {
      expect(sitemap).not.toContain(`/tools/${slug}/`);
    }
    expect(sitemap).not.toContain("/pdf-tools/");
  });

  test("robots permits crawling and references the canonical sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const robots = await response.text();
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Allow:\s*\//i);
    expect(robots).toContain("Sitemap: https://deshfiles.com/sitemap.xml");
  });

  test("favicon route returns valid SVG content", async ({ request }) => {
    const response = await request.get("/favicon.svg");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/image\/svg\+xml/);
    const svg = await response.text();
    expect(svg.trimStart()).toMatch(/^<svg\b/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test("homepage links to available tools and current internal links resolve", async ({ page, request }) => {
    await preparePage(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const path of pages.slice(1).map((route) => route.path)) {
      await expect(page.locator(`a[href="${path}"]`)).toHaveCount(1);
    }

    for (const route of pages) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      const hrefs = await page.locator("a[href]").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? "")
          .filter((href) => href.startsWith("/"))
      );
      for (const href of new Set(hrefs)) {
        expect(href).not.toContain("/pdf-tools/");
        const response = await request.get(href);
        expect(response.status(), `${route.path} -> ${href}`).toBeLessThan(400);
      }
    }
  });
});
