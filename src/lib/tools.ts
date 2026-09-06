export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: string;
  available: boolean;
  featured?: boolean;
}

export const tools: Tool[] = [
  {
    slug: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "Convert PDF pages into JPG images.",
    category: "Convert",
    available: true,
    featured: true
  },
  {
    slug: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "Turn JPG and PNG images into a PDF.",
    category: "Convert",
    available: true
  },
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine multiple PDF files into one.",
    category: "Organize",
    available: false
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size without unnecessary complexity.",
    category: "Optimize",
    available: false
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    description: "Split a PDF into separate files or pages.",
    category: "Organize",
    available: false
  },
  {
    slug: "pdf-to-png",
    name: "PDF to PNG",
    description: "Convert PDF pages into PNG images.",
    category: "Convert",
    available: false
  },
  {
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate PDF pages and save the result.",
    category: "Edit",
    available: false
  },
  {
    slug: "remove-pages",
    name: "Remove PDF Pages",
    description: "Remove unwanted pages from a PDF.",
    category: "Organize",
    available: false
  }
];