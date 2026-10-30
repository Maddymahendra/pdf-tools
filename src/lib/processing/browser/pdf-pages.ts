import { parsePageRanges, parsePageSelection, type PageRange } from "../page-selection";

interface LoadedPdf {
  getPageIndices(): number[];
  getPage(index: number): { getRotation(): { angle: number }; setRotation(rotation: unknown): void };
}

interface CreatedPdf {
  copyPages(pdf: LoadedPdf, indices: number[]): Promise<Array<unknown>>;
  addPage(page: unknown): void;
  save(): Promise<Uint8Array>;
}

export interface PdfLibModule {
  PDFDocument: {
    load(bytes: ArrayBuffer): Promise<LoadedPdf>;
    create(): Promise<CreatedPdf>;
  };
  degrees(value: number): unknown;
}

export async function loadPdfDocument(file: File, PDFLib: PdfLibModule): Promise<LoadedPdf> {
  return PDFLib.PDFDocument.load(await file.arrayBuffer());
}

async function createPdfFromIndices(
  source: LoadedPdf,
  indices: number[],
  PDFLib: PdfLibModule
): Promise<Uint8Array> {
  const target = await PDFLib.PDFDocument.create();
  const pages = await target.copyPages(source, indices);
  pages.forEach((page) => target.addPage(page));
  return target.save();
}

export async function splitPdf(
  file: File,
  ranges: PageRange[],
  PDFLib: PdfLibModule
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const source = await loadPdfDocument(file, PDFLib);
  const baseName = file.name.replace(/\.pdf$/i, "");
  const outputs: Array<{ name: string; bytes: Uint8Array }> = [];

  for (const [index, range] of ranges.entries()) {
    outputs.push({
      name: `${baseName}-${range.label || index + 1}.pdf`,
      bytes: await createPdfFromIndices(source, range.pages.map((page) => page - 1), PDFLib)
    });
  }
  return outputs;
}

export async function splitEveryPage(file: File, PDFLib: PdfLibModule) {
  const source = await loadPdfDocument(file, PDFLib);
  const baseName = file.name.replace(/\.pdf$/i, "");
  const outputs: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const index of source.getPageIndices()) {
    outputs.push({
      name: `${baseName}-${index + 1}.pdf`,
      bytes: await createPdfFromIndices(source, [index], PDFLib)
    });
  }
  return outputs;
}

export async function extractPdf(file: File, pages: number[], PDFLib: PdfLibModule): Promise<Uint8Array> {
  const source = await loadPdfDocument(file, PDFLib);
  return createPdfFromIndices(source, pages.map((page) => page - 1), PDFLib);
}

export async function removePdfPages(file: File, pagesToRemove: number[], PDFLib: PdfLibModule): Promise<Uint8Array> {
  const source = await loadPdfDocument(file, PDFLib);
  const removed = new Set(pagesToRemove);
  const remaining = source.getPageIndices().filter((index) => !removed.has(index + 1));
  return createPdfFromIndices(source, remaining, PDFLib);
}

export async function rotatePdf(
  file: File,
  pages: number[],
  angle: number,
  PDFLib: PdfLibModule
): Promise<Uint8Array> {
  const source = await loadPdfDocument(file, PDFLib);
  const selected = new Set(pages);
  for (const index of source.getPageIndices()) {
    if (selected.has(index + 1)) {
      const page = source.getPage(index);
      page.setRotation(PDFLib.degrees(page.getRotation().angle + angle));
    }
  }
  const target = await PDFLib.PDFDocument.create();
  const copied = await target.copyPages(source, source.getPageIndices());
  copied.forEach((page) => target.addPage(page));
  return target.save();
}

export { parsePageRanges, parsePageSelection };
