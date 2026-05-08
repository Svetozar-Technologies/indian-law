#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractIndiaCodeMetadata, extractIndiaCodeSections, parseSectionContentJson } from "./lib/html.mjs";
import { fetchJson, fetchText, sleep } from "./lib/http.mjs";
import {
  lawPartFileName,
  normaliseLaw,
  renderMarkdownPart,
  splitSectionsIntoParts
} from "./lib/markdown.mjs";
import {
  renderHome,
  renderLanguageIndex,
  renderLawIndex,
  renderPartHtml
} from "./lib/site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_LINES = 1500;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(ROOT, args.output ?? "docs");
  const manifestPath = path.resolve(ROOT, args.manifest ?? "data/laws.seed.json");
  const languagePath = path.resolve(ROOT, args.languages ?? "data/languages.json");
  const regionalPath = path.resolve(ROOT, args["regional-sources"] ?? "data/regional-sources.seed.json");
  const maxLines = Number(args["max-lines"] ?? DEFAULT_MAX_LINES);
  const delayMs = Number(args["delay-ms"] ?? 1100);
  const fetchLive = Boolean(args.fetch) && !Boolean(args.offline);
  const maxLaws = args["max-laws"] === undefined ? undefined : Number(args["max-laws"]);
  const maxSections = args["max-sections"] === undefined ? undefined : Number(args["max-sections"]);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const languageConfig = JSON.parse(await readFile(languagePath, "utf8"));
  const regionalSources = JSON.parse(await readFile(regionalPath, "utf8"));
  const languages = languageConfig.languages;
  const selectedLaws = manifest.laws.slice(0, maxLaws || manifest.laws.length);

  const laws = [];
  for (const rawLaw of selectedLaws) {
    const law = normaliseLaw(rawLaw);
    const preparedLaw = fetchLive ? await fetchLaw(law, { delayMs, maxSections }) : law;
    laws.push(attachRegionalSources(preparedLaw, regionalSources.sources ?? []));
  }

  await writeSite({ outputDir, languages, defaultLanguage: languageConfig.defaultLanguage, laws, maxLines });
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

async function writeSite({ outputDir, languages, defaultLanguage, laws, maxLines }) {
  await mkdir(outputDir, { recursive: true });
  await rm(path.join(outputDir, "laws"), { recursive: true, force: true });
  await writeFile(path.join(outputDir, "site.css"), SITE_CSS);
  await writeFile(path.join(outputDir, "site.js"), SITE_JS);
  await writeFile(path.join(outputDir, "favicon.svg"), FAVICON_SVG);
  await writeFile(path.join(outputDir, "index.html"), renderHome({ languages, laws, defaultLanguage }));

  for (const language of languages) {
    const languageDir = path.join(outputDir, "laws", language.code);
    await mkdir(languageDir, { recursive: true });
    await writeFile(path.join(languageDir, "index.html"), renderLanguageIndex({ language, languages, laws }));

    for (const law of laws) {
      const lawDir = path.join(languageDir, law.slug);
      await mkdir(lawDir, { recursive: true });
      const lawSections = sectionsForLanguage(law, language.code);
      const splitLimit = Math.max(1, maxLines - 60);
      const parts = lawSections.length ? splitSectionsIntoParts(lawSections, { maxLines: splitLimit }) : [];
      await writeFile(path.join(lawDir, "index.html"), renderLawIndex({ law, language, parts }));

      for (let index = 0; index < parts.length; index += 1) {
        const markdown = renderMarkdownPart({
          law,
          language,
          partIndex: index,
          partCount: parts.length,
          sections: parts[index],
          maxLines
        });
        const fileName = lawPartFileName(index);
        await writeFile(path.join(lawDir, `${fileName}.md`), markdown);
        await writeFile(
          path.join(lawDir, `${fileName}.html`),
          renderPartHtml({ law, language, markdown, partIndex: index, partCount: parts.length })
        );
      }
    }
  }
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

const SITE_JS = `const supported = [...document.querySelectorAll("[data-language]")].map((node) => node.dataset.language);
const preferred = navigator.languages?.map((value) => value.split("-")[0]).find((code) => supported.includes(code)) || "en";
document.documentElement.dataset.preferredLanguage = preferred;
const preferredLink = document.querySelector("#preferred-language-link");
if (preferredLink) preferredLink.href = \`laws/\${preferred}/index.html\`;
`;

const SITE_CSS = `:root {
  color-scheme: light;
  --ink: #1f2933;
  --muted: #5d6b78;
  --line: #d7dde3;
  --paper: #ffffff;
  --surface: #f5f7f8;
  --accent: #1b7f5a;
  --accent-2: #b45309;
  --link: #155e75;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: var(--ink);
  background: var(--surface);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.55;
}

a {
  color: var(--link);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem clamp(1rem, 4vw, 3rem);
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 2;
}

.brand {
  color: var(--ink);
  font-weight: 800;
  text-decoration: none;
}

.topnav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.topnav a {
  color: var(--muted);
  font-size: 0.95rem;
  text-decoration: none;
}

main {
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}

.intro,
.compact-heading,
.law-heading,
.table-section,
.parts,
.sources {
  padding: clamp(0.75rem, 2vw, 1.5rem) 0;
  margin-bottom: 1rem;
}

.law-document {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: clamp(1rem, 3vw, 2rem);
  margin-bottom: 1rem;
}

.intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 260px);
  gap: 2rem;
  align-items: end;
}

.kicker {
  color: var(--accent-2);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0 0 0.5rem;
  text-transform: uppercase;
}

h1,
h2,
h3 {
  letter-spacing: 0;
  line-height: 1.2;
}

h1 {
  font-size: 2.6rem;
  margin: 0;
}

h2 {
  font-size: 1.25rem;
  margin: 0 0 1rem;
}

.summary {
  color: var(--muted);
  max-width: 68ch;
}

.source-panel {
  border-left: 4px solid var(--accent);
  padding-left: 1rem;
}

.metric {
  display: block;
  font-size: 2.5rem;
  font-weight: 800;
}

.metric-label {
  display: block;
  color: var(--muted);
  margin-bottom: 0.5rem;
}

.language-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.language-link,
.part-link {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 72px;
  padding: 0.85rem;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  text-decoration: none;
}

.language-link:hover,
.part-link:hover {
  border-color: var(--accent);
}

.language-link small,
.part-link small {
  color: var(--muted);
}

.section-heading,
.document-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.button-link,
.status {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #eef7f3;
  color: var(--accent);
  text-decoration: none;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 0.75rem;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--muted);
  font-size: 0.85rem;
}

.language-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.language-switcher a {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  text-decoration: none;
}

.law-heading dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}

.law-heading dt {
  color: var(--muted);
  font-size: 0.8rem;
}

.law-heading dd {
  margin: 0;
  font-weight: 700;
}

.part-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.sources ul {
  padding-left: 1.2rem;
}

.sources li span {
  display: inline-block;
  width: 2.5rem;
  color: var(--muted);
}

.document-nav {
  border-bottom: 1px solid var(--line);
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
}

.law-document {
  max-width: 860px;
}

.law-document h1 {
  font-size: 2rem;
}

.law-document blockquote {
  border-left: 4px solid var(--accent);
  color: var(--muted);
  margin-left: 0;
  padding-left: 1rem;
}

.empty-state {
  color: var(--muted);
  margin: 0;
}

@media (max-width: 720px) {
  h1 {
    font-size: 2rem;
  }

  .intro {
    grid-template-columns: 1fr;
  }

  .topbar,
  .section-heading,
  .document-nav {
    align-items: flex-start;
    flex-direction: column;
  }

  .table-wrap {
    overflow: visible;
  }

  table,
  thead,
  tbody,
  tr,
  th,
  td {
    display: block;
    min-width: 0;
  }

  thead {
    display: none;
  }

  tr {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 0.75rem;
    padding: 0.75rem;
  }

  td {
    border-bottom: 0;
    padding: 0.2rem 0;
  }

  td:nth-child(2)::before {
    content: "Year: ";
    color: var(--muted);
    font-weight: 700;
  }

  td:nth-child(3)::before {
    content: "Act: ";
    color: var(--muted);
    font-weight: 700;
  }

  td:nth-child(4)::before {
    content: "Ministry: ";
    color: var(--muted);
    font-weight: 700;
  }
}
`;

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#f5f7f8"/>
  <path d="M18 14h28v36H18z" fill="#fff" stroke="#1f2933" stroke-width="3"/>
  <path d="M25 23h14M25 31h14M25 39h9" stroke="#1b7f5a" stroke-width="3" stroke-linecap="round"/>
</svg>
`;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
