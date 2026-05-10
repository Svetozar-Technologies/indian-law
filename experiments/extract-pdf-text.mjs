#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { extractPdfTextSections } from "../scripts/lib/pdf.mjs";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node experiments/extract-pdf-text.mjs <pdf-path>");
  process.exitCode = 1;
} else {
  const { sections } = await extractPdfTextSections(await readFile(pdfPath));
  for (const section of sections.slice(0, 2)) {
    console.log(`--- page ${section.sourcePage} ---`);
    console.log(section.content);
  }
}
