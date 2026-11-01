// The engine is pinned to 1.0.5. Keep its private pdf-lib behavior behind this API.
import { compressPDF as compressPdfEngine } from "compress-pdf-lib";
import { PDFDocument, PDFName } from "pdf-lib";

export const MAX_COMPRESS_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_COMPRESS_PAGES = 200;
export const MAX_COMPRESS_PIXELS = 100_000_000;
export const MAX_COMPRESS_PAGE_DIMENSION = 8_000;

export type CompressionLevel = "better" | "recommended" | "maximum";

export interface CompressionSettings {
  quality: number;
  scale: number;
}

export interface PdfValidation {
  pageCount: number;
  totalPixels: number;
  textSample: string;
}

export interface CompressionOutcome {
  file: Blob;
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  savedPercent: number;
  pageCount: number;
}

export type CompressionEngine = typeof compressPdfEngine;

export const COMPRESSION_SETTINGS: Record<CompressionLevel, CompressionSettings> = {
  better: { quality: 0.9, scale: 1 },
  recommended: { quality: 0.75, scale: 1 },
  maximum: { quality: 0.55, scale: 0.75 }
};

export function getCompressionSettings(level: CompressionLevel): CompressionSettings {
  return COMPRESSION_SETTINGS[level];
}

export function isPdfSignature(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

export function calculateSavedPercent(originalBytes: number, compressedBytes: number): number {
  if (originalBytes <= 0 || compressedBytes >= originalBytes) return 0;
  return Math.round(((originalBytes - compressedBytes) / originalBytes) * 100);
}

export function hasCompressionBenefit(originalBytes: number, compressedBytes: number): boolean {
  return compressedBytes < originalBytes;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function validateFileSize(bytes: number): void {
  if (bytes > MAX_COMPRESS_FILE_BYTES) {
    throw new Error("This PDF is larger than the 50 MB limit.");
  }
}

export function classifyPdfError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/password|encrypted|needpassword|incorrectpassword/i.test(message)) {
    return "This PDF is password protected. Password-protected PDFs aren't supported yet.";
  }
  if (/memory|allocation|array buffer|out of bounds/i.test(message)) {
    return "This PDF is too complex for this browser to process safely.";
  }
  return "We couldn't read this PDF. Please choose a valid, uncorrupted PDF.";
}

export async function inspectPdfSafety(file: File): Promise<{ hasSoftMask: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    let hasSoftMask = false;
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      const dictionary = (object as { dict?: { get?: (name: PDFName) => unknown } }).dict ?? object as { get?: (name: PDFName) => unknown };
      if (typeof dictionary.get === "function" && dictionary.get(PDFName.of("SMask"))) {
        hasSoftMask = true;
        break;
      }
    }
    return { hasSoftMask };
  } catch (error) {
    if (/encrypted|encrypt/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error("This PDF is password protected. Password-protected PDFs aren't supported yet.");
    }
    throw error;
  }
}

async function assertPdfSafety(file: File): Promise<void> {
  const { hasSoftMask } = await inspectPdfSafety(file);
  if (hasSoftMask) {
    throw new Error("This PDF contains transparency that cannot be safely optimized yet. The original PDF was left unchanged.");
  }
}

export async function validatePdfForCompression(file: File, pdfjsLib: any): Promise<PdfValidation> {
  validateFileSize(file.size);
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!isPdfSignature(bytes)) throw new Error("Please choose a valid PDF file.");
  try { await assertPdfSafety(file); }
  catch (error) { throw new Error(error instanceof Error ? error.message : classifyPdfError(error)); }

  let pdf: any;
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (error) {
    throw new Error(classifyPdfError(error));
  }
  if (pdf.numPages > MAX_COMPRESS_PAGES) throw new Error(`This PDF has more than ${MAX_COMPRESS_PAGES} pages.`);

  let totalPixels = 0;
  let textSample = "";
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    if (viewport.width > MAX_COMPRESS_PAGE_DIMENSION || viewport.height > MAX_COMPRESS_PAGE_DIMENSION) {
      throw new Error("This PDF contains a page that is too large to process safely.");
    }
    totalPixels += viewport.width * viewport.height;
    if (totalPixels > MAX_COMPRESS_PIXELS) throw new Error("This PDF contains too many pixels to process safely.");
    if (index === 1) {
      const content = await page.getTextContent();
      textSample = content.items.map((item: { str?: string }) => item.str ?? "").join(" ").slice(0, 400);
    }
  }
  return { pageCount: pdf.numPages, totalPixels, textSample };
}

export async function validateCompressedOutput(bytes: Uint8Array, expectedPages: number, textSample: string, pdfjsLib: any): Promise<void> {
  if (!isPdfSignature(bytes)) throw new Error("The compressed file was not a valid PDF.");
  let pdf: any;
  try { pdf = await pdfjsLib.getDocument({ data: bytes }).promise; }
  catch { throw new Error("The compressed PDF could not be opened for validation."); }
  if (pdf.numPages !== expectedPages) throw new Error("The compressed PDF changed the page count.");
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.15 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    if (textSample) {
      const outputText = (await page.getTextContent()).items.map((item: { str?: string }) => item.str ?? "").join(" ");
      const firstWords = textSample.trim().split(/\s+/).slice(0, 2).join(" ");
      if (firstWords && !outputText.includes(firstWords)) throw new Error("Text validation failed for the compressed PDF.");
    }
  } finally {
    canvas.width = 1; canvas.height = 1;
  }
}

export async function compressPdf(file: File, level: CompressionLevel, validation: PdfValidation, pdfjsLib: any, engine: CompressionEngine = compressPdfEngine): Promise<CompressionOutcome> {
  validateFileSize(file.size);
  await assertPdfSafety(file);
  const settings = getCompressionSettings(level);
  const result = await engine(file, {
    quality: settings.quality,
    scale: settings.scale,
    onlyIfSmaller: true,
    useWorker: typeof Worker !== "undefined",
    workers: typeof Worker !== "undefined" ? 1 : 0,
    minImageBytes: 2_048
  });
  const outputBytes = new Uint8Array(await result.file.arrayBuffer());
  // PDF.js may transfer/detach the input buffer to its worker during validation.
  // Validate a copy so the original bytes remain available for the download Blob.
  await validateCompressedOutput(outputBytes.slice(), validation.pageCount, validation.textSample, pdfjsLib);
  const originalBytes = file.size;
  const compressedBytes = outputBytes.length;
  if (!hasCompressionBenefit(originalBytes, compressedBytes)) {
    throw new Error("This PDF is already well optimized. We couldn't reduce the file size without making the document unnecessarily larger.");
  }
  return { file: new Blob([outputBytes], { type: "application/pdf" }), originalBytes, compressedBytes, savedBytes: originalBytes - compressedBytes, savedPercent: calculateSavedPercent(originalBytes, compressedBytes), pageCount: validation.pageCount };
}
