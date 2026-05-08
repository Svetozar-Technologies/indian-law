#!/usr/bin/env node
import { build as buildBundle } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractIndiaCodeMetadata, extractIndiaCodeSections, parseSectionContentJson } from "./lib/html.mjs";
import { fetchJson, fetchText, sleep } from "./lib/http.mjs";
import { readDataFile, writeDataFile } from "./lib/lino.mjs";
import {
  countLines,
  lawPartFileName,
  normaliseLaw,
  renderMarkdownPart,
  splitSectionsIntoParts
} from "./lib/markdown.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_LINES = 1500;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(ROOT, args.output ?? "docs");
  const manifestPath = path.resolve(ROOT, args.manifest ?? "data/laws.seed.lino");
  const languagePath = path.resolve(ROOT, args.languages ?? "data/languages.lino");
  const regionalPath = path.resolve(ROOT, args["regional-sources"] ?? "data/regional-sources.seed.lino");
  const maxLines = Number(args["max-lines"] ?? DEFAULT_MAX_LINES);
  const delayMs = Number(args["delay-ms"] ?? 1100);
  const fetchLive = Boolean(args.fetch) && !Boolean(args.offline);
  const maxLaws = args["max-laws"] === undefined ? undefined : Number(args["max-laws"]);
  const maxSections = args["max-sections"] === undefined ? undefined : Number(args["max-sections"]);

  const manifest = await readDataFile(manifestPath);
  const languageConfig = await readDataFile(languagePath);
  const regionalSources = await readDataFile(regionalPath);
  const languages = languageConfig.languages;
  const selectedLaws = manifest.laws.slice(0, maxLaws || manifest.laws.length);

  const laws = [];
  for (const rawLaw of selectedLaws) {
    const law = normaliseLaw(rawLaw);
    const preparedLaw = fetchLive ? await fetchLaw(law, { delayMs, maxSections }) : law;
    laws.push(attachRegionalSources(preparedLaw, regionalSources.sources ?? []));
  }

  await writeSite({
    outputDir,
    languages,
    defaultLanguage: languageConfig.defaultLanguage,
    laws,
    maxLines,
    sourceMetadata: {
      generatedFrom: manifest.generatedFrom ?? [],
      lastVerified: manifest.lastVerified ?? regionalSources.lastVerified ?? "",
      regionalLastVerified: regionalSources.lastVerified ?? ""
    }
  });
  console.log(`Generated ${laws.length} law entries in ${path.relative(ROOT, outputDir)}`);
}

async function fetchLaw(seedLaw, options) {
  const sourceUrl =
    seedLaw.sourceUrl ?? `https://www.indiacode.nic.in/handle/123456789/${seedLaw.handle}`;
  const html = await fetchText(sourceUrl);
  const metadata = extractIndiaCodeMetadata(html, sourceUrl);
  const sectionRefs = extractIndiaCodeSections(html);
  const limitedSections = options.maxSections ? sectionRefs.slice(0, options.maxSections) : sectionRefs;
  const sections = [];

  for (const section of limitedSections) {
    const query = new URLSearchParams(section.query);
    const actId = query.get("actid");
    const sectionUrl = new URL("https://www.indiacode.nic.in/SectionPageContent");
    sectionUrl.searchParams.set("actid", actId);
    sectionUrl.searchParams.set("sectionID", section.sectionId);
    const payload = await fetchJson(sectionUrl.toString());
    const parsed = parseSectionContentJson(payload);
    sections.push({
      ...section,
      ...parsed
    });
    await sleep(options.delayMs);
  }

  return normaliseLaw({
    ...seedLaw,
    ...metadata,
    slug: seedLaw.slug || metadata.slug,
    handle: seedLaw.handle || metadata.handle,
    sourceUrl,
    sources: mergeSources(seedLaw.sources, metadata.sources),
    sections
  });
}

async function writeSite({ outputDir, languages, defaultLanguage, laws, maxLines, sourceMetadata }) {
  await mkdir(outputDir, { recursive: true });
  await rm(path.join(outputDir, "laws"), { recursive: true, force: true });
  await rm(path.join(outputDir, "assets"), { recursive: true, force: true });
  await rm(path.join(outputDir, "data"), { recursive: true, force: true });
  await rm(path.join(outputDir, "site.css"), { force: true });
  await rm(path.join(outputDir, "site.js"), { force: true });

  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  await mkdir(path.join(outputDir, "data"), { recursive: true });

  const catalog = await writeMarkdownParts({ outputDir, languages, laws, defaultLanguage, maxLines, sourceMetadata });
  await writeDataFile(path.join(outputDir, "data", "catalog.lino"), catalog);
  await writeFile(path.join(outputDir, "favicon.svg"), FAVICON_SVG);
  await writeFile(path.join(outputDir, "assets", "site.css"), await readFile(path.join(ROOT, "src", "styles.css"), "utf8"));
  await buildBundle({
    entryPoints: [path.join(ROOT, "src", "app.jsx")],
    outfile: path.join(outputDir, "assets", "app.js"),
    bundle: true,
    format: "esm",
    legalComments: "none",
    minify: true,
    platform: "browser",
    target: ["es2020"],
    logLevel: "silent"
  });
  const cssHash = await fileHash(path.join(outputDir, "assets", "site.css"));
  const appHash = await fileHash(path.join(outputDir, "assets", "app.js"));
  await writeFile(path.join(outputDir, "index.html"), renderAppShell({ cssHash, appHash }));
}

async function writeMarkdownParts({ outputDir, languages, laws, defaultLanguage, maxLines, sourceMetadata }) {
  const catalog = {
    title: "Indian Law",
    defaultLanguage,
    maxLines,
    sourceMetadata,
    languages: languages.map((language) => ({
      code: language.code,
      name: language.name,
      nativeName: language.nativeName,
      direction: language.direction ?? "ltr",
      officialSource: language.officialSource ?? "",
      sourceKind: language.sourceKind ?? ""
    })),
    laws: []
  };

  for (const law of laws) {
    const lawEntry = {
      slug: law.slug,
      title: law.title,
      localizedTitles: localizedTitles(law),
      actNumber: law.actNumber ?? "",
      actYear: law.actYear ?? "",
      enactmentDate: law.enactmentDate ?? "",
      ministry: law.ministry ?? "",
      department: law.department ?? "",
      longTitle: law.longTitle ?? "",
      sourceUrl: law.sourceUrl ?? "",
      sources: law.sources ?? {},
      languages: {}
    };

    for (const language of languages) {
      const lawSections = sectionsForLanguage(law, language.code);
      const splitLimit = Math.max(1, maxLines - 60);
      const parts = lawSections.length ? splitSectionsIntoParts(lawSections, { maxLines: splitLimit }) : [];
      const languageParts = [];

      if (parts.length > 0) {
        const lawDir = path.join(outputDir, "laws", language.code, law.slug);
        await mkdir(lawDir, { recursive: true });
        for (let index = 0; index < parts.length; index += 1) {
          const markdown = renderMarkdownPart({
            law,
            language,
            partIndex: index,
            partCount: parts.length,
            sections: parts[index],
            maxLines
          });
          const fileName = `${lawPartFileName(index)}.md`;
          await writeFile(path.join(lawDir, fileName), markdown);
          languageParts.push({
            file: fileName,
            title: `Part ${index + 1}`,
            lineCount: countLines(markdown),
            firstSection: parts[index][0]?.sectionNo ?? "",
            lastSection: parts[index].at(-1)?.sectionNo ?? ""
          });
        }
      }

      const sources = law.sources?.[language.code] ?? [];
      lawEntry.languages[language.code] = {
        enabled: languageParts.length > 0,
        status: languageParts.length > 0 ? "markdown" : sources.length > 0 ? "source-only" : "unavailable",
        parts: languageParts,
        sources
      };
    }

    catalog.laws.push(lawEntry);
  }

  return catalog;
}

function sectionsForLanguage(law, languageCode) {
  if (languageCode === "en") {
    return law.sections ?? [];
  }
  return law.translations?.[languageCode]?.sections ?? [];
}

function mergeSources(seedSources = {}, fetchedSources = {}) {
  const merged = structuredClone(seedSources);
  for (const [language, sources] of Object.entries(fetchedSources)) {
    merged[language] ??= [];
    for (const source of sources) {
      if (source.url && !merged[language].some((entry) => entry.url === source.url)) {
        merged[language].push(source);
      }
    }
  }
  return merged;
}

function attachRegionalSources(law, regionalSources) {
  const merged = normaliseLaw({ ...law, sources: structuredClone(law.sources ?? {}) });
  for (const source of regionalSources) {
    if (source.lawSlug && source.lawSlug !== merged.slug) {
      continue;
    }
    if (!source.lawSlug && !titlesLookRelated(source.title, merged.title)) {
      continue;
    }
    merged.sources[source.language] ??= [];
    if (!merged.sources[source.language].some((entry) => entry.url === source.url)) {
      merged.sources[source.language].push({
        kind: source.kind ?? "pdf",
        url: source.url,
        title: source.title,
        source: source.source
      });
    }
  }
  return merged;
}

function titlesLookRelated(sourceTitle = "", lawTitle = "") {
  const normalise = (value) =>
    String(value)
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\b(act|adhiniyam|sanhita)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const source = normalise(sourceTitle);
  const law = normalise(lawTitle);
  return Boolean(source && law && (source.includes(law) || law.includes(source)));
}

function localizedTitles(law) {
  const titles = {};
  if (law.hindiTitle) {
    titles.hi = law.hindiTitle;
  }
  return titles;
}

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 12);
}

function renderAppShell({ cssHash, appHash }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Indian Law</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/site.css?v=${cssHash}">
  <script type="module" src="assets/app.js?v=${appHash}"></script>
</head>
<body>
  <div id="root">
    <main class="loading-shell">Loading Indian Law</main>
  </div>
</body>
</html>
`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args[rawKey] = argv[index + 1];
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#f6f7f2"/>
  <path d="M18 14h28v36H18z" fill="#fff" stroke="#263238" stroke-width="3"/>
  <path d="M25 23h14M25 31h14M25 39h9" stroke="#1b7f5a" stroke-width="3" stroke-linecap="round"/>
</svg>
`;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
