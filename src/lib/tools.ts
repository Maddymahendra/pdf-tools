export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: string;
  available: boolean;
  featured?: boolean;
  seoTitle: string;
  seoDescription: string;
  processingMode: "browser" | "server";
  status: "available" | "coming-soon";
}

export const tools: Tool[] = [
  {
    slug: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "PDF pages to JPG images",
    category: "Convert",
    available: true,
    featured: true,
    seoTitle: "PDF to JPG — Free Online Converter | DeshFiles",
    seoDescription: "Convert PDF pages to high-quality JPG images directly in your browser. Fast, private and easy to use.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "JPG & PNG images to PDF",
    category: "Convert",
    available: true,
    seoTitle: "JPG to PDF — Free Online Converter | DeshFiles",
    seoDescription: "Convert JPG and PNG images into a PDF. Arrange images, choose page settings, and create your PDF directly in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine PDFs into one",
    category: "Organize",
    available: true,
    seoTitle: "Merge PDF — Combine PDF Files Online | DeshFiles",
    seoDescription: "Combine multiple PDF files into one PDF quickly and privately in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size",
    category: "Optimize",
    available: false,
    seoTitle: "Compress PDF — Reduce PDF File Size | DeshFiles",
    seoDescription: "Compress PDF files with DeshFiles. This tool is coming soon.",
    processingMode: "browser",
    status: "coming-soon"
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    description: "Split PDF into separate pages",
    category: "Organize",
    available: true,
    seoTitle: "Split PDF — Separate PDF Pages | DeshFiles",
    seoDescription: "Split PDF files into separate documents or pages with DeshFiles. Process files privately in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "pdf-to-png",
    name: "PDF to PNG",
    description: "PDF pages to PNG images",
    category: "Convert",
    available: true,
    seoTitle: "PDF to PNG — Convert PDF Pages to PNG | DeshFiles",
    seoDescription: "Convert PDF pages to crisp PNG images with DeshFiles. Process files privately in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate and save PDF pages",
    category: "Edit",
    available: true,
    seoTitle: "Rotate PDF — Rotate PDF Pages Online | DeshFiles",
    seoDescription: "Rotate all or selected PDF pages with DeshFiles. Process files privately in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "remove-pages",
    name: "Remove PDF Pages",
    description: "Delete unwanted PDF pages",
    category: "Organize",
    available: true,
    seoTitle: "Remove PDF Pages — Edit PDF Files Online | DeshFiles",
    seoDescription: "Remove unwanted pages from PDF files with DeshFiles. Process files privately in your browser.",
    processingMode: "browser",
    status: "available"
  },
  {
    slug: "extract-pages",
    name: "Extract PDF Pages",
    description: "Save selected pages as a PDF",
    category: "Organize",
    available: true,
    seoTitle: "Extract PDF Pages — Create a New PDF | DeshFiles",
    seoDescription: "Extract selected pages from a PDF with DeshFiles. Process files privately in your browser.",
    processingMode: "browser",
    status: "available"
  }
];
