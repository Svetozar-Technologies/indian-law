import { createRequire } from "node:module";
import path from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const PDFJS_ROOT = path.dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONT_DATA_URL = path.join(PDFJS_ROOT, "standard_fonts") + path.sep;

export async function extractPdfTextSections(buffer) {
  const data = toUint8Array(buffer);
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const sections = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      let content;
      try {
        const textContent = await page.getTextContent({ includeMarkedContent: false });
        content = textContentToPlainText(textContent.items);
      } finally {
        page.cleanup();
      }
      if (!content) {
        continue;
      }
      sections.push({
        kind: "page",
        sectionId: `pdf-page-${pageNumber}`,
        sectionNo: String(pageNumber),
        orderNo: pageNumber,
        title: `Page ${pageNumber}`,
        content,
        footnotes: "",
        sourcePage: pageNumber
      });
    }
  } finally {
    await document.destroy();
  }

  return { pageCount, sections };
}

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) {
    return new Uint8Array(buffer);
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  return new Uint8Array(Buffer.from(buffer));
}

function textContentToPlainText(items) {
  const lines = [];
  let currentLine = [];

  for (const item of items ?? []) {
    if (typeof item.str !== "string") {
      continue;
    }
    const text = item.str.replace(/\s+/g, " ").trim();
    if (text) {
      currentLine.push(text);
    }
    if (item.hasEOL) {
      pushLine(lines, currentLine);
      currentLine = [];
    }
  }

  pushLine(lines, currentLine);
  return lines.join("\n").trim();
}

function pushLine(lines, words) {
  const line = words
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?।])/g, "$1")
    .trim();
  if (line) {
    lines.push(line);
  }
}
