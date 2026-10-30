import { configurePdfJs, loadPdf, type ConvertedImage, type PdfJsModule } from "./pdf-to-jpg";

export async function convertPdfToPng(
  file: File,
  pdfjsLib: PdfJsModule,
  scale: number,
  onPage?: (image: ConvertedImage, completed: number, total: number) => void
): Promise<ConvertedImage[]> {
  configurePdfJs(pdfjsLib);
  const pdf = await loadPdf(file, pdfjsLib);
  const images: ConvertedImage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is not available in this browser.");
    await page.render({ canvasContext: context, viewport }).promise;
    const image = { dataUrl: canvas.toDataURL("image/png"), pageNumber };
    images.push(image);
    onPage?.(image, pageNumber, pdf.numPages);
  }
  return images;
}
