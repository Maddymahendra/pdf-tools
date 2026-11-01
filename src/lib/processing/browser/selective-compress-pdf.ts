/*
 * DeshFiles selective PDF image compressor.
 *
 * Adapted from compress-pdf-lib 1.0.5 (MIT), using pdf-lib 1.17.1's
 * indirect-object APIs. This local engine exists so transparency-bearing
 * image relationships can be classified before decoding. Images with SMask,
 * Mask, or ImageMask are never decoded or rewritten; supported opaque images
 * are recompressed in place. See vendor/COMPRESS-PDF-LIB-MIT.txt.
 */
import { PDFDocument, PDFName, PDFRawStream, PDFArray, decodePDFRawStream } from "pdf-lib";
// @ts-expect-error compress-pdf-lib ships raw ESM without declarations.
import { CompressionPool } from "compress-pdf-lib";

export interface SelectiveCompressionOptions {
  quality: number;
  scale: number;
  minImageBytes?: number;
  onlyIfSmaller?: boolean;
  useWorker?: boolean;
  workers?: number;
}

function normalizeFilter(value: unknown): string {
  const text = typeof (value as { asString?: () => string })?.asString === "function"
    ? (value as { asString: () => string }).asString()
    : "";
  return text.replace(/^\//, "");
}

function getFilters(context: any, dictionary: any): string[] {
  const filter = dictionary.get(PDFName.of("Filter"));
  if (!filter) return [];
  if (filter instanceof PDFArray) return filter.asArray().map((item: any) => normalizeFilter(context.lookup(item)));
  return [normalizeFilter(context.lookup(filter)) || normalizeFilter(filter)];
}

function isTrue(value: any): boolean {
  return Boolean(value?.asBoolean?.() === true);
}

function imageRefs(pdf: any): any[] {
  return [...pdf.context.enumerateIndirectObjects()]
    .filter(([, object]: [any, any]) => object instanceof PDFRawStream && normalizeFilter(object.dict.get(PDFName.of("Subtype"))) === "Image")
    .map(([ref]: [any, any]) => ref);
}

function unsafeImageRefs(context: any, refs: any[]): Set<string> {
  const unsafe = new Set<string>();
  for (const ref of refs) {
    const stream = context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const dictionary = stream.dict;
    const mask = dictionary.get(PDFName.of("Mask"));
    const softMask = dictionary.get(PDFName.of("SMask"));
    if (mask || softMask || isTrue(dictionary.get(PDFName.of("ImageMask")))) {
      unsafe.add(ref.toString());
      if (softMask?.toString) unsafe.add(softMask.toString());
    }
  }
  return unsafe;
}

function decodeOpaqueSamples(stream: PDFRawStream, context: any): ImageData | null {
  const dictionary = stream.dict;
  const width = dictionary.get(PDFName.of("Width"))?.asNumber?.();
  const height = dictionary.get(PDFName.of("Height"))?.asNumber?.();
  const bits = dictionary.get(PDFName.of("BitsPerComponent"))?.asNumber?.() ?? 8;
  const colorSpace = normalizeFilter(context.lookup(dictionary.get(PDFName.of("ColorSpace"))));
  if (!width || !height || bits !== 8 || !["DeviceRGB", "DeviceGray"].includes(colorSpace)) return null;
  const raw = decodePDFRawStream(stream).decode();
  const components = colorSpace === "DeviceGray" ? 1 : 3;
  if (raw.length < width * height * components) return null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; target < pixels.length; target += 4) {
    const value = raw[source++];
    pixels[target] = value;
    pixels[target + 1] = components === 1 ? value : raw[source++];
    pixels[target + 2] = components === 1 ? value : raw[source++];
    pixels[target + 3] = 255;
  }
  return new ImageData(pixels, width, height);
}

async function bitmapForOpaqueImage(stream: PDFRawStream, context: any, filters: string[]): Promise<ImageBitmap | null> {
  if (filters.length === 1 && filters[0] === "DCTDecode") {
    return createImageBitmap(new Blob([stream.contents], { type: "image/jpeg" }));
  }
  if (filters.length === 1 && filters[0] === "FlateDecode") {
    const imageData = decodeOpaqueSamples(stream, context);
    return imageData ? createImageBitmap(imageData) : null;
  }
  return null;
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number, pool: any): Promise<Uint8Array> {
  if (pool) {
    const result = await pool.run({ type: "compress-image", bitmap, targetWidth: width, targetHeight: height, quality, engine: "native" }, [bitmap]);
    return result.jpeg instanceof ArrayBuffer ? new Uint8Array(result.jpeg) : new Uint8Array(result.jpeg.buffer, result.jpeg.byteOffset, result.jpeg.byteLength);
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) { bitmap.close(); throw new Error("OffscreenCanvas unavailable"); }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 });
  canvas.width = 1; canvas.height = 1;
  return new Uint8Array(await blob.arrayBuffer());
}

async function replaceWithJpeg(context: any, ref: any, bytes: Uint8Array, width: number, height: number): Promise<void> {
  const dictionary = context.obj({ Type: "XObject", Subtype: "Image", Width: width, Height: height, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode" });
  context.assign(ref, PDFRawStream.of(dictionary, bytes));
}

export async function compressPdfSelectively(input: File, options: SelectiveCompressionOptions) {
  const originalBytes = input.size;
  const document = await PDFDocument.load(await input.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
  const refs = imageRefs(document);
  const unsafe = unsafeImageRefs(document.context, refs);
  const pool = options.useWorker && typeof Worker !== "undefined" ? new CompressionPool() : null;
  if (pool) pool.init(Math.max(1, Math.min(options.workers ?? 1, 4)));
  const perImage: Array<Record<string, unknown>> = [];
  let imagesCompressed = 0;
  let imagesSkipped = 0;
  try {
    for (const ref of refs) {
      const entry: Record<string, unknown> = { ref: ref.toString() };
      if (unsafe.has(ref.toString())) {
        entry.skipped = "unsafe-transparency";
        imagesSkipped += 1;
        perImage.push(entry);
        continue;
      }
      const stream = document.context.lookup(ref);
      const filters = getFilters(document.context, stream.dict);
      const width = stream.dict.get(PDFName.of("Width"))?.asNumber?.();
      const height = stream.dict.get(PDFName.of("Height"))?.asNumber?.();
      const originalImageBytes = stream.contents.length;
      if (!width || !height || originalImageBytes < (options.minImageBytes ?? 2048)) {
        entry.skipped = "below-min-size-or-invalid";
        imagesSkipped += 1;
        perImage.push(entry);
        continue;
      }
      let bitmap: ImageBitmap | null = null;
      try { bitmap = await bitmapForOpaqueImage(stream, document.context, filters); }
      catch { bitmap = null; }
      if (!bitmap) {
        entry.skipped = "unsupported-or-unreadable";
        imagesSkipped += 1;
        perImage.push(entry);
        continue;
      }
      const scale = Math.max(0.05, Math.min(options.scale, 1));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const jpegBytes = await encodeJpeg(bitmap, targetWidth, targetHeight, options.quality, pool);
      if (options.onlyIfSmaller !== false && jpegBytes.length >= originalImageBytes) {
        entry.skipped = "recompressed-not-smaller";
        imagesSkipped += 1;
      } else {
        await replaceWithJpeg(document.context, ref, jpegBytes, targetWidth, targetHeight);
        entry.compressed = true;
        entry.originalBytes = originalImageBytes;
        entry.compressedBytes = jpegBytes.length;
        entry.width = width;
        entry.height = height;
        entry.newWidth = targetWidth;
        entry.newHeight = targetHeight;
        imagesCompressed += 1;
      }
      perImage.push(entry);
    }
    const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false });
    const file = new File([bytes], input.name, { type: "application/pdf" });
    return { file, stats: { pages: document.getPageCount(), imagesFound: refs.length, imagesCompressed, imagesSkipped, originalBytes, compressedBytes: file.size, perImage } };
  } finally {
    pool?.destroy();
  }
}
