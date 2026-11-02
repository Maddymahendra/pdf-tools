import { parsePageSelection } from "../page-selection";

export type PageNumberFormat = "number" | "page" | "page-of";
export type PageNumberPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export const MAX_PAGE_NUMBER_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PAGE_NUMBER_PAGES = 200;
export const MIN_STARTING_NUMBER = 1;
export const MAX_STARTING_NUMBER = 1_000_000;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;
export const DEFAULT_MARGIN = 24;

export interface PdfLibModule {
  PDFDocument: {
    load(bytes: ArrayBuffer | Uint8Array, options?: { ignoreEncryption?: boolean; updateMetadata?: boolean }): Promise<PdfDocumentLike>;
  };
  StandardFonts: { Helvetica: string };
  degrees(value: number): unknown;
}

export interface PdfFontLike {
  widthOfTextAtSize(text: string, size: number): number;
  heightAtSize(size: number): number;
}

export interface PdfPageLike {
  getCropBox(): PageBox;
  getMediaBox(): PageBox;
  getRotation(): { angle: number };
  drawText(text: string, options: { x: number; y: number; size: number; font: PdfFontLike; rotate: unknown }): void;
}

export interface PdfDocumentLike {
  getPages(): PdfPageLike[];
  embedFont(font: string): Promise<PdfFontLike>;
  save(options?: { updateFieldAppearances?: boolean }): Promise<Uint8Array>;
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisibleSize {
  width: number;
  height: number;
}

export interface VisiblePoint {
  x: number;
  y: number;
}

export interface NumberPlacement {
  x: number;
  y: number;
  rotate: number;
  text: string;
}

export interface AddPageNumbersOptions {
  format: PageNumberFormat;
  position: PageNumberPosition;
  startingNumber: number;
  pages: number[];
  fontSize: number;
  margin?: number;
}

export interface NumberedPdfInspection {
  bytes: ArrayBuffer;
  document: PdfDocumentLike;
  pages: PdfPageLike[];
  pageCount: number;
  boxes: PageBox[];
  rotations: number[];
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`This PDF contains an invalid ${label}.`);
}

export function normalizePageRotation(angle: number): 0 | 90 | 180 | 270 {
  assertFinite(angle, "page rotation");
  const normalized = ((angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) {
    throw new Error("This PDF contains a page rotation that is not supported.");
  }
  return normalized as 0 | 90 | 180 | 270;
}

export function visibleSize(box: PageBox, rotation: number): VisibleSize {
  validatePageBox(box);
  const normalized = normalizePageRotation(rotation);
  return normalized === 90 || normalized === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

export function validatePageBox(box: PageBox): void {
  assertFinite(box.x, "page box origin");
  assertFinite(box.y, "page box origin");
  assertFinite(box.width, "page box width");
  assertFinite(box.height, "page box height");
  if (box.width <= 0 || box.height <= 0) throw new Error("This PDF contains a page with invalid dimensions.");
}

export function visibleToPagePoint(box: PageBox, rotation: number, u: number, v: number): VisiblePoint {
  validatePageBox(box);
  const normalized = normalizePageRotation(rotation);
  if (normalized === 0) return { x: box.x + u, y: box.y + v };
  if (normalized === 90) return { x: box.x + box.width - v, y: box.y + u };
  if (normalized === 180) return { x: box.x + box.width - u, y: box.y + box.height - v };
  return { x: box.x + v, y: box.y + box.height - u };
}

export function formatPageNumber(format: PageNumberFormat, displayNumber: number, lastPhysicalNumber: number): string {
  if (format === "number") return String(displayNumber);
  if (format === "page") return `Page ${displayNumber}`;
  return `Page ${displayNumber} of ${lastPhysicalNumber}`;
}

export function pageNumberForPhysicalPage(startingNumber: number, zeroBasedPhysicalIndex: number): number {
  return startingNumber + zeroBasedPhysicalIndex;
}

export function calculatePlacement(
  box: PageBox,
  rotation: number,
  position: PageNumberPosition,
  text: string,
  font: PdfFontLike,
  fontSize: number,
  margin = DEFAULT_MARGIN
): NumberPlacement {
  validatePageBox(box);
  const normalized = normalizePageRotation(rotation);
  const size = visibleSize(box, normalized);
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);
  assertFinite(textWidth, "text width");
  assertFinite(textHeight, "text height");
  assertFinite(margin, "margin");
  if (margin <= 0 || textWidth > size.width - margin * 2 || textHeight > size.height - margin * 2) {
    throw new Error("The page is too small to place the requested page number safely.");
  }

  const horizontal = position.endsWith("left")
    ? margin
    : position.endsWith("right")
      ? size.width - margin - textWidth
      : (size.width - textWidth) / 2;
  const vertical = position.startsWith("top")
    ? size.height - margin - textHeight
    : margin;
  const point = visibleToPagePoint(box, normalized, horizontal, vertical);
  // pdf-lib's text matrix uses positive angles counter-clockwise in page
  // coordinates, while a PDF viewer applies /Rotate clockwise to the page.
  // Counter-rotate the page content by the same positive angle so the two
  // transforms cancel visually and the new label remains upright.
  return { x: point.x, y: point.y, rotate: normalized, text };
}

function validateNumberingOptions(options: AddPageNumbersOptions, pageCount: number): void {
  if (!Number.isInteger(options.startingNumber) || options.startingNumber < MIN_STARTING_NUMBER || options.startingNumber > MAX_STARTING_NUMBER) {
    throw new Error(`Starting number must be a whole number from ${MIN_STARTING_NUMBER} to ${MAX_STARTING_NUMBER}.`);
  }
  if (!Number.isInteger(options.fontSize) || options.fontSize < MIN_FONT_SIZE || options.fontSize > MAX_FONT_SIZE) {
    throw new Error(`Font size must be a whole number from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE} pt.`);
  }
  if (!Array.isArray(options.pages) || options.pages.length === 0 || options.pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error("Choose at least one valid PDF page.");
  }
}

export async function inspectPdfForPageNumbers(file: File, PDFLib: PdfLibModule): Promise<NumberedPdfInspection> {
  if (file.size > MAX_PAGE_NUMBER_FILE_BYTES) throw new Error("This PDF is larger than the 50 MB limit.");
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(bytes).subarray(0, 5)) !== "%PDF-") throw new Error("Please choose a valid PDF file.");
  let document: PdfDocumentLike;
  try {
    document = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password|encrypted|encryption|needpassword|incorrectpassword/i.test(message)) {
      throw new Error("This PDF is password protected. Password-protected PDFs aren't supported yet.");
    }
    throw new Error("This PDF could not be read. It may be corrupted or unsupported.");
  }
  const pages = document.getPages();
  if (pages.length < 1) throw new Error("The PDF must contain at least one page.");
  if (pages.length > MAX_PAGE_NUMBER_PAGES) throw new Error(`This PDF has more than ${MAX_PAGE_NUMBER_PAGES} pages.`);
  const boxes = pages.map((page) => page.getCropBox());
  const rotations = pages.map((page) => normalizePageRotation(page.getRotation().angle));
  boxes.forEach(validatePageBox);
  return { bytes, document, pages, pageCount: pages.length, boxes, rotations };
}

export async function addPageNumbers(
  file: File,
  PDFLib: PdfLibModule,
  options: AddPageNumbersOptions
): Promise<Uint8Array> {
  const inspection = await inspectPdfForPageNumbers(file, PDFLib);
  validateNumberingOptions(options, inspection.pageCount);
  const font = await inspection.document.embedFont(PDFLib.StandardFonts.Helvetica);
  const selected = new Set(options.pages);
  const lastPhysicalNumber = pageNumberForPhysicalPage(options.startingNumber, inspection.pageCount - 1);

  for (let index = 0; index < inspection.pages.length; index += 1) {
    if (!selected.has(index + 1)) continue;
    const displayNumber = pageNumberForPhysicalPage(options.startingNumber, index);
    const text = formatPageNumber(options.format, displayNumber, lastPhysicalNumber);
    const placement = calculatePlacement(
      inspection.boxes[index],
      inspection.rotations[index],
      options.position,
      text,
      font,
      options.fontSize,
      options.margin ?? DEFAULT_MARGIN
    );
    inspection.pages[index].drawText(text, {
      x: placement.x,
      y: placement.y,
      size: options.fontSize,
      font,
      rotate: PDFLib.degrees(placement.rotate)
    });
  }

  const output = await inspection.document.save({ updateFieldAppearances: false });
  if (output.length < 5 || new TextDecoder().decode(output.subarray(0, 5)) !== "%PDF-") {
    throw new Error("The numbered PDF could not be validated.");
  }
  const outputInspection = await inspectPdfForPageNumbers(new File([output], file.name, { type: "application/pdf" }), PDFLib);
  if (outputInspection.pageCount !== inspection.pageCount ||
      outputInspection.boxes.some((box, index) => box.x !== inspection.boxes[index].x || box.y !== inspection.boxes[index].y || box.width !== inspection.boxes[index].width || box.height !== inspection.boxes[index].height) ||
      outputInspection.rotations.some((rotation, index) => rotation !== inspection.rotations[index])) {
    throw new Error("The numbered PDF changed its page structure and could not be safely downloaded.");
  }
  return output;
}

export { parsePageSelection };
