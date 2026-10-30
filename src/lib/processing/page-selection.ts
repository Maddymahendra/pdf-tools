export class PageSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageSelectionError";
  }
}

export interface PageRange {
  pages: number[];
  label: string;
}

function validatePageNumber(value: number, totalPages: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new PageSelectionError("Page numbers must be positive whole numbers.");
  }
  if (value > totalPages) {
    throw new PageSelectionError(`Page ${value} is outside this PDF's ${totalPages} pages.`);
  }
}

export function parsePageRanges(input: string, totalPages: number): PageRange[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw new PageSelectionError("The PDF must contain at least one page.");
  }

  const value = input.trim();
  if (!value) {
    throw new PageSelectionError("Enter at least one page or range.");
  }

  const seen = new Set<number>();
  return value.split(",").map((part) => {
    const token = part.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) {
      throw new PageSelectionError(`Invalid page selection: “${token}”.`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    validatePageNumber(start, totalPages);
    validatePageNumber(end, totalPages);
    if (end < start) {
      throw new PageSelectionError(`Range “${token}” must start before it ends.`);
    }

    const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    for (const page of pages) {
      if (seen.has(page)) {
        throw new PageSelectionError(`Page ${page} appears more than once.`);
      }
      seen.add(page);
    }

    return { pages, label: token.replace(/\s+/g, "") };
  });
}

export function parsePageSelection(input: string, totalPages: number): number[] {
  return parsePageRanges(input, totalPages).flatMap((range) => range.pages);
}
