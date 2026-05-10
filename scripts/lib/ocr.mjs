import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

let cachedTesseract;
let cachedCanvasFactory;
let cachedPdfjs;

const DEFAULT_OCR_LANGUAGES = ["hin", "eng"];
const DEFAULT_OCR_SCALE = 2;
const DEFAULT_TESSDATA_CACHE = path.join(os.tmpdir(), "indian-law-tessdata");

export async function extractPdfTextSectionsViaOcr(buffer, options = {}) {
  const languages = options.languages?.length ? options.languages : DEFAULT_OCR_LANGUAGES;
  const scale = Number(options.scale ?? DEFAULT_OCR_SCALE);
  const maxPages = options.maxPages === undefined ? undefined : Number(options.maxPages);
  const log = typeof options.log === "function" ? options.log : () => {};
  const cachePath = options.tessdataCache ?? process.env.INDIAN_LAW_TESSDATA_CACHE ?? DEFAULT_TESSDATA_CACHE;

  const data = toUint8Array(buffer);
  const pdfjs = await loadPdfjs();
  const { canvasFactory, dispose: disposeCanvasFactory } = await loadCanvasFactory();
  const document = await pdfjs.getDocument({
    data,
    disableWorker: true,
    canvasFactory,
    standardFontDataUrl: pdfjsStandardFontUrl()
  }).promise;
  const pageCount = document.numPages;
  const limit = maxPages !== undefined ? Math.min(pageCount, Math.max(1, maxPages)) : pageCount;
  const sections = [];

  log(`OCR: ${languages.join("+")} on ${limit}/${pageCount} page(s) at scale=${scale}`);
  await mkdir(cachePath, { recursive: true });
  const worker = await createOcrWorker(languages, { cachePath, log });

  try {
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const renderTask = page.render({
          canvasContext: canvas.context,
          viewport,
          canvasFactory
        });
        await renderTask.promise;
        const pngBuffer = canvas.canvas.toBuffer("image/png");
        const recogniseStart = Date.now();
        const { data: recognised } = await worker.recognize(pngBuffer);
        const text = (recognised?.text ?? "").trim();
        log(
          `OCR: page ${pageNumber}/${limit} produced ${text.length} char(s) in ${Date.now() - recogniseStart}ms`
        );
        canvasFactory.destroy(canvas);
        if (!text) {
          continue;
        }
        sections.push({
          kind: "ocr-page",
          sectionId: `pdf-page-${pageNumber}`,
          sectionNo: String(pageNumber),
          orderNo: pageNumber,
          title: `Page ${pageNumber}`,
          content: normaliseOcrText(text),
          footnotes: "",
          sourcePage: pageNumber,
          ocrLanguages: languages.join("+")
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await worker.terminate();
    await document.destroy();
    disposeCanvasFactory?.();
  }

  return { pageCount, sections };
}

async function createOcrWorker(languages, { cachePath, log }) {
  const tesseract = await loadTesseract();
  log(`OCR: creating tesseract worker with cachePath=${cachePath}`);
  const worker = await tesseract.createWorker(languages, undefined, {
    cachePath,
    cacheMethod: "readWrite",
    gzip: true,
    logger: (status) => {
      if (status?.status && typeof status.progress === "number") {
        log(`OCR worker: ${status.status} ${(status.progress * 100).toFixed(0)}%`);
      }
    }
  });
  return worker;
}

async function loadTesseract() {
  if (!cachedTesseract) {
    cachedTesseract = await import("tesseract.js");
  }
  return cachedTesseract;
}

async function loadPdfjs() {
  if (!cachedPdfjs) {
    cachedPdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return cachedPdfjs;
}

async function loadCanvasFactory() {
  if (!cachedCanvasFactory) {
    const napi = await import("@napi-rs/canvas");
    const canvases = new Set();

    cachedCanvasFactory = {
      canvasFactory: {
        create(width, height) {
          const canvas = napi.createCanvas(Math.max(1, width), Math.max(1, height));
          const context = canvas.getContext("2d");
          const handle = { canvas, context };
          canvases.add(handle);
          return handle;
        },
        reset(handle, width, height) {
          handle.canvas.width = Math.max(1, width);
          handle.canvas.height = Math.max(1, height);
        },
        destroy(handle) {
          if (!handle) {
            return;
          }
          handle.canvas.width = 0;
          handle.canvas.height = 0;
          canvases.delete(handle);
        }
      },
      dispose() {
        for (const handle of canvases) {
          handle.canvas.width = 0;
          handle.canvas.height = 0;
        }
        canvases.clear();
      }
    };
  }
  return cachedCanvasFactory;
}

function pdfjsStandardFontUrl() {
  const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return path.join(pdfjsRoot, "standard_fonts") + path.sep;
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

function normaliseOcrText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
