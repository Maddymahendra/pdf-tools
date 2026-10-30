import { Buffer } from "node:buffer";

function escapePdfText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function createPdfFixture(pageCount: number, label = "DeshFiles test"): Buffer {
  if (pageCount < 1) {
    throw new Error("A PDF fixture must contain at least one page.");
  }

  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + pageCount;
  const fontObject = contentObjectStart + pageCount;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${pageObjectStart + index} 0 R`).join(" ")}] /Count ${pageCount} >>`
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const contentObject = contentObjectStart + index;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Contents ${contentObject} 0 R /Resources << /Font << /F1 ${fontObject} 0 R >> >> >>`
    );
  }

  for (let index = 0; index < pageCount; index += 1) {
    const text = escapePdfText(`${label} page ${index + 1}`);
    const stream = `BT /F1 18 Tf 24 80 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
  }

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(chunks.join(""), "ascii"));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const startXref = Buffer.byteLength(chunks.join(""), "ascii");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "ascii");
}

export function createMalformedPdfFixture(): Buffer {
  return Buffer.from("%PDF-1.4\nThis is not a valid PDF document.\n", "ascii");
}
