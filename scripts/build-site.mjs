#!/usr/bin/env node
import { build as buildBundle } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractIndiaCodeMetadata, extractIndiaCodeSections, parseSectionContentJson } from "./lib/html.mjs";
import { fetchJson, fetchText, sleep } from "./lib/http.mjs";
import { readDataFile, writeDataFile } from "./lib/lino.mjs";
import { createLogger } from "./lib/logging.mjs";
import {
  countLines,
  lawPartFileName,
  normaliseLaw,
  renderMarkdownPart,
  splitSectionsIntoParts
} from "./lib/markdown.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_LINES = 1500;
const DEFAULT_CACHE_TTL_DAYS = 30;
const DEFAULT_PROGRESS_INTERVAL_MS = 30000;
const PARTIAL_REFRESH_EXIT_CODE = 75;

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
  const cacheDir = args["cache-dir"] === undefined ? undefined : path.resolve(ROOT, args["cache-dir"]);
  const cacheTtlDays = Number(args["cache-ttl-days"] ?? DEFAULT_CACHE_TTL_DAYS);
  const maxRuntimeMs = args["max-runtime-ms"] === undefined ? undefined : Number(args["max-runtime-ms"]);
  const progressIntervalMs = Number(args["progress-interval-ms"] ?? DEFAULT_PROGRESS_INTERVAL_MS);
  const quiet = Boolean(args.quiet);
  const verbose = !quiet;
  const logProgress = fetchLive && !Boolean(args.quiet);
  const startedAt = Date.now();
  const logger = createLogger("build-site", { quiet });
  const httpLogger = createLogger("http", { quiet });

  logger.info(`Starting site build in ${fetchLive ? "live fetch" : "offline"} mode`);
  logger.info(
    `Inputs: manifest=${path.relative(ROOT, manifestPath)}, languages=${path.relative(
      ROOT,
      languagePath
    )}, regionalSources=${path.relative(ROOT, regionalPath)}, output=${path.relative(ROOT, outputDir)}`
  );
  logger.info(
    `Options: maxLines=${maxLines}, delayMs=${delayMs}, maxLaws=${maxLaws ?? "all"}, maxSections=${
      maxSections ?? "all"
    }, cacheDir=${cacheDir ? path.relative(ROOT, cacheDir) : "none"}, cacheTtlDays=${cacheTtlDays}, maxRuntimeMs=${
      maxRuntimeMs ?? "none"
    }, progressIntervalMs=${progressIntervalMs}, verboseDefault=${verbose}`
  );

  logger.info(`Reading manifest from ${path.relative(ROOT, manifestPath)}`);
  const manifest = await readDataFile(manifestPath);
  logger.info(`Reading language config from ${path.relative(ROOT, languagePath)}`);
  const languageConfig = await readDataFile(languagePath);
  logger.info(`Reading regional sources from ${path.relative(ROOT, regionalPath)}`);
  const regionalSources = await readDataFile(regionalPath);
  const languages = languageConfig.languages;
  const selectedLaws = manifest.laws.slice(0, maxLaws || manifest.laws.length);
  logger.info(
    `Loaded ${manifest.laws.length} manifest law(s), ${languages.length} language(s), ${
      regionalSources.sources?.length ?? 0
    } regional source record(s)`
  );
  logger.info(`Selected ${selectedLaws.length} law(s) for this run`);

  const laws = [];
  let partialRefresh = false;
  for (let index = 0; index < selectedLaws.length; index += 1) {
    logRuntimeBudget(index, selectedLaws.length, startedAt, maxRuntimeMs, { logger, verbose });
    if (fetchLive && runtimeBudgetExhausted(startedAt, maxRuntimeMs)) {
      partialRefresh = true;
      logger.warn(
        `Runtime checkpoint reached after ${formatDuration(Date.now() - startedAt)}; writing partial site output.`
      );
      break;
    }

    const rawLaw = selectedLaws[index];
    const law = normaliseLaw(rawLaw);
    logVerbose(
      `Preparing law ${index + 1}/${selectedLaws.length}: ${law.title} (${fetchLive ? "cache/live fetch" : "seed data"})`,
      { logger, verbose }
    );
    const preparedLaw = fetchLive
      ? await fetchLawWithCache(law, {
          cacheDir,
          cacheTtlDays,
          delayMs,
          httpLogger,
          index,
          logger,
          logProgress,
          maxSections,
          progressIntervalMs,
          total: selectedLaws.length,
          verbose
        })
      : law;
    laws.push(attachRegionalSources(preparedLaw, regionalSources.sources ?? []));
  }

  if (partialRefresh) {
    logger.info(`Filling ${selectedLaws.length - laws.length} pending law(s) from seed data for partial output`);
    for (let index = laws.length; index < selectedLaws.length; index += 1) {
      laws.push(attachRegionalSources(normaliseLaw(selectedLaws[index]), regionalSources.sources ?? []));
    }
  }

  await writeSite({
    outputDir,
    logger,
    languages,
    defaultLanguage: languageConfig.defaultLanguage,
    laws,
    maxLines,
    sourceMetadata: {
      generatedFrom: manifest.generatedFrom ?? [],
      lastVerified: manifest.lastVerified ?? regionalSources.lastVerified ?? "",
      regionalLastVerified: regionalSources.lastVerified ?? "",
      partialRefresh,
      refreshStartedAt: fetchLive ? new Date(startedAt).toISOString() : ""
    }
  });
  const outputLabel = path.relative(ROOT, outputDir);
  if (partialRefresh) {
    logger.warn(`Generated partial ${laws.length} law entries in ${outputLabel}`);
    process.exitCode = PARTIAL_REFRESH_EXIT_CODE;
  } else {
    logger.info(`Site build completed in ${formatDuration(Date.now() - startedAt)}`);
    console.log(`Generated ${laws.length} law entries in ${outputLabel}`);
  }
}

async function fetchLawWithCache(seedLaw, options) {
  const cachePath = options.cacheDir ? path.join(options.cacheDir, `${cacheKey(seedLaw)}.json`) : undefined;
  const progressPrefix = `[${options.index + 1}/${options.total}]`;

  logVerbose(
    `${progressPrefix} Cache decision for ${seedLaw.title}: ${cachePath ? path.relative(ROOT, cachePath) : "no cache dir"}`,
    options
  );
  if (cachePath) {
    const cachedLaw = await readFreshCachedLaw(cachePath, options);
    if (cachedLaw) {
      logProgress(
        `${progressPrefix} Using cached ${seedLaw.title} (${cachedLaw.sections?.length ?? 0} sections, fetched ${cachedLaw.fetchedAt})`,
        options
      );
      return cachedLaw;
    }
  }

  logProgress(`${progressPrefix} Fetching ${seedLaw.title} from ${seedLaw.sourceUrl}`, options);
  const fetchedLaw = await fetchLaw(seedLaw, options);
  logProgress(`${progressPrefix} Fetched ${fetchedLaw.sections?.length ?? 0} sections for ${fetchedLaw.title}`, options);

  if (cachePath) {
    await writeLawCache(cachePath, fetchedLaw, options);
    logVerbose(`${progressPrefix} Wrote cache ${path.relative(ROOT, cachePath)}`, options);
  }

  return fetchedLaw;
}

async function fetchLaw(seedLaw, options) {
  const sourceUrl =
    seedLaw.sourceUrl ?? `https://www.indiacode.nic.in/handle/123456789/${seedLaw.handle}`;
  logVerbose(`Fetching law landing page for ${seedLaw.title}: ${sourceUrl}`, options);
  const html = await fetchText(sourceUrl, { logger: options.httpLogger });
  logVerbose(`Fetched law landing page for ${seedLaw.title}: ${html.length} character(s)`, options);
  const metadata = extractIndiaCodeMetadata(html, sourceUrl);
  const sectionRefs = extractIndiaCodeSections(html);
  const limitedSections = options.maxSections ? sectionRefs.slice(0, options.maxSections) : sectionRefs;
  const sections = [];
  let lastProgressAt = Date.now();

  logVerbose(
    `Found ${sectionRefs.length} section reference(s) for ${seedLaw.title}; fetching ${
      limitedSections.length
    } section(s) after maxSections=${options.maxSections ?? "all"}`,
    options
  );

  for (let index = 0; index < limitedSections.length; index += 1) {
    const section = limitedSections[index];
    const query = new URLSearchParams(section.query);
    const actId = query.get("actid");
    const sectionUrl = new URL("https://www.indiacode.nic.in/SectionPageContent");
    sectionUrl.searchParams.set("actid", actId);
    sectionUrl.searchParams.set("sectionID", section.sectionId);
    logVerbose(
      `Fetching section ${index + 1}/${limitedSections.length} for ${seedLaw.title}: sectionId=${
        section.sectionId
      }, sectionNo=${section.sectionNo}, actid=${actId}`,
      options
    );
    const payload = await fetchJson(sectionUrl.toString(), { logger: options.httpLogger });
    const parsed = parseSectionContentJson(payload);
    logVerbose(
      `Parsed section ${index + 1}/${limitedSections.length} for ${seedLaw.title}: content=${
        parsed.content.length
      } chars, footnotes=${parsed.footnotes.length} chars`,
      options
    );
    sections.push({
      ...section,
      ...parsed
    });
    if (shouldLogSectionProgress(index, limitedSections.length, lastProgressAt, options.progressIntervalMs)) {
      logProgress(`  ${seedLaw.title}: fetched ${index + 1}/${limitedSections.length} sections`, options);
      lastProgressAt = Date.now();
    }
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

async function readFreshCachedLaw(cachePath, options) {
  let cache;
  try {
    logVerbose(`Reading law cache ${path.relative(ROOT, cachePath)}`, options);
    cache = JSON.parse(await readFile(cachePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      options.logger?.warn(`Ignoring unreadable law cache ${path.relative(ROOT, cachePath)}: ${error.message}`);
    } else {
      logVerbose(`No law cache found at ${path.relative(ROOT, cachePath)}`, options);
    }
    return undefined;
  }

  if (!cache?.law || !cache.fetchedAt) {
    logVerbose(`Ignoring incomplete law cache ${path.relative(ROOT, cachePath)}`, options);
    return undefined;
  }
  if (!cacheIsFresh(cache.fetchedAt, options.cacheTtlDays)) {
    logVerbose(`Ignoring stale law cache ${path.relative(ROOT, cachePath)} fetched ${cache.fetchedAt}`, options);
    return undefined;
  }
  if (!cacheSatisfiesRequest(cache, options)) {
    logVerbose(`Ignoring limited law cache ${path.relative(ROOT, cachePath)} for full refresh request`, options);
    return undefined;
  }

  const law = structuredClone(cache.law);
  if (options.maxSections !== undefined) {
    law.sections = (law.sections ?? []).slice(0, options.maxSections);
  }
  const normalised = normaliseLaw(law);
  normalised.fetchedAt = cache.fetchedAt;
  logVerbose(`Accepted fresh law cache ${path.relative(ROOT, cachePath)} fetched ${cache.fetchedAt}`, options);
  return normalised;
}

async function writeLawCache(cachePath, law, options) {
  logVerbose(`Creating cache directory ${path.relative(ROOT, path.dirname(cachePath))}`, options);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    `${JSON.stringify(
      {
        cacheVersion: 1,
        fetchedAt: new Date().toISOString(),
        sourceUrl: law.sourceUrl ?? "",
        completeFetch: options.maxSections === undefined,
        maxSections: options.maxSections ?? null,
        law
      },
      null,
      2
    )}\n`
  );
}

function cacheKey(law) {
  return normaliseLaw(law).slug.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || `handle-${law.handle}`;
}

function cacheIsFresh(fetchedAt, ttlDays) {
  const fetchedTime = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedTime)) {
    return false;
  }
  return Date.now() - fetchedTime <= ttlDays * 24 * 60 * 60 * 1000;
}

function cacheSatisfiesRequest(cache, options) {
  if (options.maxSections === undefined) {
    return cache.completeFetch === true || (cache.completeFetch !== false && cache.maxSections == null);
  }
  return (
    cache.completeFetch === true ||
    cache.maxSections == null ||
    Number(cache.maxSections ?? 0) >= options.maxSections ||
    (cache.law.sections?.length ?? 0) >= options.maxSections
  );
}

function runtimeBudgetExhausted(startedAt, maxRuntimeMs) {
  return maxRuntimeMs !== undefined && Date.now() - startedAt >= maxRuntimeMs;
}

function shouldLogSectionProgress(index, total, lastProgressAt, progressIntervalMs) {
  return (
    index === 0 ||
    index === total - 1 ||
    Date.now() - lastProgressAt >= progressIntervalMs
  );
}

function logRuntimeBudget(index, total, startedAt, maxRuntimeMs, options) {
  if (!options.verbose || maxRuntimeMs === undefined) {
    return;
  }
  const elapsed = Date.now() - startedAt;
  const remaining = Math.max(0, maxRuntimeMs - elapsed);
  options.logger?.info(
    `Runtime budget before law ${index + 1}/${total}: elapsed=${formatDuration(elapsed)}, remaining=${formatDuration(
      remaining
    )}, limit=${formatDuration(maxRuntimeMs)}`
  );
}

function logProgress(message, options) {
  if (options.logProgress) {
    options.logger?.info(message);
  }
}

function logVerbose(message, options) {
  if (options.verbose) {
    options.logger?.info(message);
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

async function writeSite({ outputDir, logger, languages, defaultLanguage, laws, maxLines, sourceMetadata }) {
  logger?.info(`Writing site output to ${path.relative(ROOT, outputDir)}`);
  await mkdir(outputDir, { recursive: true });
  logger?.info("Removing generated laws/assets/data output from previous build");
  await rm(path.join(outputDir, "laws"), { recursive: true, force: true });
  await rm(path.join(outputDir, "assets"), { recursive: true, force: true });
  await rm(path.join(outputDir, "data"), { recursive: true, force: true });
  await rm(path.join(outputDir, "site.css"), { force: true });
  await rm(path.join(outputDir, "site.js"), { force: true });

  logger?.info("Creating output asset and data directories");
  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  await mkdir(path.join(outputDir, "data"), { recursive: true });

  const catalog = await writeMarkdownParts({ outputDir, logger, languages, laws, defaultLanguage, maxLines, sourceMetadata });
  logger?.info(`Writing catalog with ${catalog.laws.length} law entries`);
  await writeDataFile(path.join(outputDir, "data", "catalog.lino"), catalog);
  logger?.info("Writing favicon");
  await writeFile(path.join(outputDir, "favicon.svg"), FAVICON_SVG);
  logger?.info("Copying stylesheet");
  await writeFile(path.join(outputDir, "assets", "site.css"), await readFile(path.join(ROOT, "src", "styles.css"), "utf8"));
  logger?.info("Bundling React application with esbuild");
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
  logger?.info(`Computed asset hashes: site.css=${cssHash}, app.js=${appHash}`);
  logger?.info("Writing application shell");
  await writeFile(path.join(outputDir, "index.html"), renderAppShell({ cssHash, appHash }));
}

async function writeMarkdownParts({ outputDir, logger, languages, laws, defaultLanguage, maxLines, sourceMetadata }) {
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
    logger?.info(`Cataloging law ${law.slug}: ${law.title}`);
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
      const sources = law.sources?.[language.code] ?? [];
      logger?.info(
        `Language decision for ${law.slug}/${language.code}: sections=${lawSections.length}, parts=${
          parts.length
        }, sources=${sources.length}, status=${parts.length > 0 ? "markdown" : sources.length > 0 ? "source-only" : "unavailable"}`
      );

      if (parts.length > 0) {
        const lawDir = path.join(outputDir, "laws", language.code, law.slug);
        logger?.info(`Creating markdown directory ${path.relative(ROOT, lawDir)}`);
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
          const markdownPath = path.join(lawDir, fileName);
          logger?.info(
            `Writing markdown part ${path.relative(ROOT, markdownPath)} with ${parts[index].length} section(s) and ${countLines(
              markdown
            )} line(s)`
          );
          await writeFile(markdownPath, markdown);
          languageParts.push({
            file: fileName,
            title: `Part ${index + 1}`,
            lineCount: countLines(markdown),
            firstSection: parts[index][0]?.sectionNo ?? "",
            lastSection: parts[index].at(-1)?.sectionNo ?? ""
          });
        }
      }

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
