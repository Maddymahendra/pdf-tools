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
    description: "Convert PDF pages into JPG images.",
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
    description: "Turn JPG and PNG images into a PDF.",
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
    description: "Combine multiple PDF files into one.",
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
    description: "Reduce PDF file size without unnecessary complexity.",
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
    description: "Split a PDF into separate files or pages.",
    category: "Organize",
    available: false,
    seoTitle: "Split PDF — Separate PDF Pages | DeshFiles",
    seoDescription: "Split PDF files into separate documents or pages with DeshFiles. This tool is coming soon.",
    processingMode: "browser",
    status: "coming-soon"
  },
  {
    slug: "pdf-to-png",
    name: "PDF to PNG",
    description: "Convert PDF pages into PNG images.",
    category: "Convert",
    available: false,
    seoTitle: "PDF to PNG — Convert PDF Pages to PNG | DeshFiles",
    seoDescription: "Convert PDF pages to PNG images with DeshFiles. This tool is coming soon.",
    processingMode: "browser",
    status: "coming-soon"
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate PDF pages and save the result.",
    category: "Edit",
    available: false,
    seoTitle: "Rotate PDF — Rotate PDF Pages Online | DeshFiles",
    seoDescription: "Rotate PDF pages with DeshFiles. This tool is coming soon.",
    processingMode: "browser",
    status: "coming-soon"
  },
  {
    slug: "remove-pages",
    name: "Remove PDF Pages",
    description: "Remove unwanted pages from a PDF.",
    category: "Organize",
    available: false,
    seoTitle: "Remove PDF Pages — Edit PDF Files Online | DeshFiles",
    seoDescription: "Remove unwanted pages from PDF files with DeshFiles. This tool is coming soon.",
    processingMode: "browser",
    status: "coming-soon"
  }
];
