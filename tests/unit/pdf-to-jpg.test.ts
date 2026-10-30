import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertPdfToJpg,
  createJpgZip,
  loadPdf,
  type JsZipConstructor,
  type PdfJsModule
} from "../../src/lib/processing/browser/pdf-to-jpg";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPdfJsStub(pageCount: number): PdfJsModule {
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: pageCount,
        getPage: vi.fn(async (pageNumber: number) => ({
          getViewport: () => ({ width: 100 + pageNumber, height: 120 }),
          render: () => ({ promise: Promise.resolve() })
        }))
      })
    }))
  };
}

describe("PDF-to-JPG processing", () => {
  it("loads a PDF as a Uint8Array", async () => {
    const pdfjsLib = createPdfJsStub(1);
    const file = new File([new Uint8Array([37, 80, 68, 70])], "sample.pdf");

    await loadPdf(file, pdfjsLib);

    expect(pdfjsLib.getDocument).toHaveBeenCalledWith({
      data: new Uint8Array([37, 80, 68, 70])
    });
  });

  it("converts every page and reports progress", async () => {
    const pdfjsLib = createPdfJsStub(2);
    const file = new File(["pdf"], "sample.pdf", { type: "application/pdf" });
    const progress: number[] = [];
    const pages: number[] = [];
    const context = {
      fillStyle: "",
      fillRect: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        getContext: () => context,
        width: 0,
        height: 0,
        toBlob: (resolve: (blob: Blob) => void) =>
          resolve(new Blob(["jpg"], { type: "image/jpeg" }))
      }))
    });

    const images = await convertPdfToJpg(
      file,
      1.5,
      pdfjsLib,
      ({ pageNumber }) => progress.push(pageNumber),
      ({ page }) => pages.push(page)
    );

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.blob.type)).toEqual([
      "image/jpeg",
      "image/jpeg"
    ]);
    expect(progress).toEqual([1, 2]);
    expect(pages).toEqual([1, 2]);
  });

  it("creates a ZIP with deterministic JPG entry names", async () => {
    const entries: string[] = [];
    class FakeZip {
      file(name: string) {
        entries.push(name);
      }

      async generateAsync() {
        return new Blob([entries.join("\n")], { type: "application/zip" });
      }
    }

    const zip = await createJpgZip(
      [
        { page: 1, blob: new Blob(["one"], { type: "image/jpeg" }) },
        { page: 2, blob: new Blob(["two"], { type: "image/jpeg" }) }
      ],
      "sample",
      FakeZip as unknown as JsZipConstructor
    );

    expect(entries).toEqual(["sample-page-1.jpg", "sample-page-2.jpg"]);
    expect(zip.type).toBe("application/zip");
  });
});
