#!/usr/bin/env node
// Quick smoke test: download one image-only Hindi PDF, render with @napi-rs/canvas,
// and OCR with tesseract.js (hin). Verifies the OCR pipeline before wiring it
// into build-site.mjs.

import { fetchBuffer } from "../scripts/lib/http.mjs";
import { extractPdfTextSectionsViaOcr } from "../scripts/lib/ocr.mjs";

const url = process.argv[2] ?? "https://www.indiacode.nic.in/bitstream/123456789/19621/2/h20233.pdf";
const maxPages = Number(process.argv[3] ?? 2);

console.log(`Downloading ${url}`);
const buffer = await fetchBuffer(url);
console.log(`Downloaded ${buffer.length} bytes; running OCR on first ${maxPages} page(s)`);

const result = await extractPdfTextSectionsViaOcr(buffer, {
  languages: ["hin", "eng"],
  scale: 2,
  maxPages,
  log: (message) => console.log(message)
});
console.log(`pageCount=${result.pageCount}, sections=${result.sections.length}`);
for (const section of result.sections) {
  console.log(`---- ${section.title} (${section.content.length} chars) ----`);
  console.log(section.content.slice(0, 400));
}
