export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type QualityPreset = "high" | "balanced" | "smaller";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ResizeOptions {
  dimensions: ImageDimensions;
  outputType: ImageMimeType;
  quality?: QualityPreset;
  targetBytes?: number;
}

export interface ResizeResult {
  blob: Blob;
  dimensions: ImageDimensions;
  mimeType: ImageMimeType;
  quality?: number;
}

const QUALITY_VALUES: Record<QualityPreset, number> = {
  high: 0.92,
  balanced: 0.78,
  smaller: 0.58
};

export const MIN_TARGET_BYTES = 10 * 1024;
export const MAX_DIMENSION = 12000;
export const MAX_PIXELS = 100_000_000;

export function mimeForFormat(format: string): ImageMimeType | null {
  if (format === "image/jpeg" || format === "image/jpg") return "image/jpeg";
  if (format === "image/png") return "image/png";
  if (format === "image/webp") return "image/webp";
  return null;
}

export function formatLabel(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime === "image/webp") return "WebP";
  return "Image";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseTargetBytes(value: number, unit: "KB" | "MB"): number {
  return Math.round(value * (unit === "MB" ? 1024 * 1024 : 1024));
}

export function validateTargetBytes(bytes: number, minimum = MIN_TARGET_BYTES): string | null {
  if (!Number.isFinite(bytes) || bytes < minimum) {
    return `Target size must be at least ${formatBytes(minimum)}.`;
  }
  return null;
}

export function dimensionsAtPercentage(source: ImageDimensions, percentage: number): ImageDimensions {
  const scale = Math.max(1, percentage) / 100;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  };
}

export function calculateAspectDimensions(
  source: ImageDimensions,
  requested: Partial<ImageDimensions>,
  lockAspect = true
): ImageDimensions {
  const width = Math.max(1, Math.round(requested.width ?? source.width));
  const height = Math.max(1, Math.round(requested.height ?? source.height));
  if (!lockAspect || !source.width || !source.height) return { width, height };
  if (requested.width !== undefined && requested.height === undefined) {
    return { width, height: Math.max(1, Math.round(width * source.height / source.width)) };
  }
  if (requested.height !== undefined && requested.width === undefined) {
    return { width: Math.max(1, Math.round(height * source.width / source.height)), height };
  }
  return { width, height };
}

export function validateDimensions(dimensions: ImageDimensions): string | null {
  if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) {
    return "Enter positive whole-number dimensions.";
  }
  if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    return `Each dimension must be ${MAX_DIMENSION.toLocaleString()} px or smaller.`;
  }
  if (dimensions.width * dimensions.height > MAX_PIXELS) {
    return "That image would be too large to process in this browser.";
  }
  return null;
}

export function reductionPercentage(originalBytes: number, resultBytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.max(0, Math.round((1 - resultBytes / originalBytes) * 100));
}

export function resizedFilename(originalName: string, mimeType: ImageMimeType): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return `${base}-resized.${extension}`;
}

function qualityForPreset(preset: QualityPreset): number {
  return QUALITY_VALUES[preset];
}

function drawToCanvas(image: CanvasImageSource, dimensions: ImageDimensions, outputType: ImageMimeType): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create an image canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (outputType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
  }
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, outputType: ImageMimeType, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode this image.")), outputType, quality);
  });
}

async function encode(image: CanvasImageSource, dimensions: ImageDimensions, outputType: ImageMimeType, quality?: number): Promise<Blob> {
  return canvasBlob(drawToCanvas(image, dimensions, outputType), outputType, quality);
}

async function bestUnderTarget(image: CanvasImageSource, source: ImageDimensions, outputType: ImageMimeType, targetBytes: number): Promise<ResizeResult> {
  let dimensions = { ...source };
  for (let dimensionAttempt = 0; dimensionAttempt < 10; dimensionAttempt += 1) {
    let low = outputType === "image/png" ? 1 : 0.35;
    let high = 0.98;
    let best: { blob: Blob; quality: number } | null = null;
    const attempts = outputType === "image/png" ? 1 : 8;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const quality = outputType === "image/png" ? 1 : (low + high) / 2;
      const blob = await encode(image, dimensions, outputType, quality);
      if (blob.size <= targetBytes) {
        best = { blob, quality };
        low = quality;
      } else {
        high = quality;
      }
    }
    if (best) return { blob: best.blob, dimensions, mimeType: outputType, quality: best.quality };
    if (dimensions.width <= 64 || dimensions.height <= 64) break;
    dimensions = {
      width: Math.max(64, Math.round(dimensions.width * 0.78)),
      height: Math.max(64, Math.round(dimensions.height * 0.78))
    };
  }
  throw new Error("This image cannot be reduced to the requested size while keeping it usable. Try a larger target or a different format.");
}

export async function decodeImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string; dimensions: ImageDimensions }> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This file is not a valid browser-readable image."));
      image.src = objectUrl;
    });
    return { image, objectUrl, dimensions: { width: image.naturalWidth, height: image.naturalHeight } };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function resizeImageFile(file: File, options: ResizeOptions): Promise<ResizeResult> {
  const decoded = await decodeImage(file);
  try {
    if (options.targetBytes !== undefined) {
      return await bestUnderTarget(decoded.image, decoded.dimensions, options.outputType, options.targetBytes);
    }
    const quality = options.outputType === "image/png" ? undefined : qualityForPreset(options.quality ?? "balanced");
    const blob = await encode(decoded.image, options.dimensions, options.outputType, quality);
    return { blob, dimensions: options.dimensions, mimeType: options.outputType, quality };
  } finally {
    URL.revokeObjectURL(decoded.objectUrl);
  }
}
