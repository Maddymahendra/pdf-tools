export interface PdfJsModule {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument(options: { data: Uint8Array }): {
    promise: Promise<PdfDocument>;
  };
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): {
    promise: Promise<void>;
  };
}

interface PdfViewport {
  width: number;
  height: number;
}

export interface ConvertedImage {
  page: number;
  blob: Blob;
}

export interface ConversionProgress {
  pageNumber: number;
  pageCount: number;
  percent: number;
}

export interface JsZipConstructor {
  new (): JsZip;
}

interface JsZip {
  file(name: string, data: Blob): void;
  generateAsync(options: { type: "blob" }): Promise<Blob>;
}

export function configurePdfJs(pdfjsLib: PdfJsModule) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs";
}

export async function loadPdf(
  file: File,
  pdfjsLib: PdfJsModule
): Promise<PdfDocument> {
  const buffer = await file.arrayBuffer();

  return pdfjsLib.getDocument({
    data: new Uint8Array(buffer)
  }).promise;
}

export async function convertPdfToJpg(
  file: File,
  quality: number,
  pdfjsLib: PdfJsModule,
  onProgress: (progress: ConversionProgress) => void,
  onPage: (image: ConvertedImage) => void
): Promise<ConvertedImage[]> {
  const pdf = await loadPdf(file, pdfjsLib);
  const convertedImages: ConvertedImage[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    onProgress({
      pageNumber,
      pageCount: pdf.numPages,
      percent: Math.round((pageNumber / pdf.numPages) * 100)
    });

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({
      scale: quality
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false
    });

    if (!context) {
      throw new Error("Unable to create JPG image.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      throw new Error("Unable to create JPG image.");
    }

    const image = {
      page: pageNumber,
      blob
    };

    convertedImages.push(image);
    onPage(image);
  }

  return convertedImages;
}

export async function createJpgZip(
  images: ConvertedImage[],
  baseName: string,
  JSZip: JsZipConstructor
): Promise<Blob> {
  const zip = new JSZip();

  images.forEach((image) => {
    zip.file(
      `${baseName}-page-${image.page}.jpg`,
      image.blob
    );
  });

  return zip.generateAsync({
    type: "blob"
  });
}
