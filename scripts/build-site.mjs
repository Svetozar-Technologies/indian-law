#!/usr/bin/env node
import { build as buildBundle } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractIndiaCodeMetadata, extractIndiaCodeSections, parseSectionContentJson } from "./lib/html.mjs";
import { fetchBuffer, fetchJson, fetchText, sleep } from "./lib/http.mjs";
import { readDataFile, writeDataFile } from "./lib/lino.mjs";
import { createLogger } from "./lib/logging.mjs";
import {
  countLines,
  lawPartFileName,
  normaliseLaw,
  renderMarkdownPart,
  splitSectionsIntoParts
} from "./lib/markdown.mjs";
import { extractPdfTextSections } from "./lib/pdf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_LINES = 1500;
const DEFAULT_CACHE_TTL_DAYS = 30;
const DEFAULT_PROGRESS_INTERVAL_MS = 30000;
const DEFAULT_PATH_ALIAS = "indian-law";
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
  const pathAlias = normalisePathAlias(args["path-alias"] ?? DEFAULT_PATH_ALIAS);
  const progressPath =
    args["progress-file"] === undefined
      ? cacheDir
        ? path.join(path.dirname(cacheDir), "refresh-status.lino")
        : undefined
      : path.resolve(ROOT, args["progress-file"]);
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
    }, progressIntervalMs=${progressIntervalMs}, progressFile=${
      progressPath ? path.relative(ROOT, progressPath) : "none"
    }, pathAlias=${pathAlias || "none"}, verboseDefault=${verbose}`
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
  const refreshProgress = createRefreshProgress({
    cacheDir,
    defaultLanguage: languageConfig.defaultLanguage,
    fetchLive,
    manifestPath,
    maxRuntimeMs,
    outputDir,
    progressIntervalMs,
    regionalPath,
    selectedLaws,
    startedAt
  });
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
          languages,
          logProgress,
          maxSections,
          maxRuntimeMs,
          progressIntervalMs,
          startedAt,
          total: selectedLaws.length,
          verbose
        })
      : law;
    const refreshStatus = preparedLaw.__refreshMetadata?.status;
    if (refreshStatus === "failed" || refreshStatus === "partial") {
      partialRefresh = true;
    }
    recordLawProgress(refreshProgress, index, preparedLaw);
    await writeRefreshProgress(progressPath, refreshProgress, { logger, verbose });
    laws.push(attachRegionalSources(preparedLaw, regionalSources.sources ?? []));
    if (refreshStatus === "partial") {
      logger.warn(`Checkpoint saved during ${law.title}; remaining laws will stay pending for the next run.`);
      break;
    }
  }

  if (partialRefresh) {
    logger.info(`Filling ${selectedLaws.length - laws.length} pending law(s) from seed data for partial output`);
    for (let index = laws.length; index < selectedLaws.length; index += 1) {
      recordPendingLawProgress(refreshProgress, index);
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
    pathAlias,
    sourceMetadata: {
      generatedFrom: manifest.generatedFrom ?? [],
      lastVerified: manifest.lastVerified ?? regionalSources.lastVerified ?? "",
      regionalLastVerified: regionalSources.lastVerified ?? "",
      partialRefresh,
      refreshStartedAt: fetchLive ? new Date(startedAt).toISOString() : ""
    }
  });
  finalizeRefreshProgress(refreshProgress, { partialRefresh });
  await writeRefreshProgress(progressPath, refreshProgress, { logger, verbose: true });
  const outputLabel = path.relative(ROOT, outputDir);
  if (partialRefresh) {
    const failedLaws = refreshProgress?.failedLaws ?? 0;
    const pendingLaws = refreshProgress?.pendingLaws ?? 0;
    logger.warn(
      `Generated partial ${laws.length} law entries in ${outputLabel}; failed=${failedLaws}, pending=${pendingLaws}`
    );
    process.exitCode = PARTIAL_REFRESH_EXIT_CODE;
  } else {
    logger.info(`Site build completed in ${formatDuration(Date.now() - startedAt)}`);
    console.log(`Generated ${laws.length} law entries in ${outputLabel}`);
  }
}

async function fetchLawWithCache(seedLaw, options) {
  const cachePath = options.cacheDir ? lawCachePath(options.cacheDir, seedLaw) : undefined;
  const progressPrefix = `[${options.index + 1}/${options.total}]`;
  const sourceUrl = sourceUrlForLaw(seedLaw);
  let cache;

  logVerbose(
    `${progressPrefix} Cache decision for ${seedLaw.title}: ${cachePath ? path.relative(ROOT, cachePath) : "no cache dir"}`,
    options
  );
  if (cachePath) {
    cache = await readLawCache(cachePath, options);
    const cachedLaw = lawFromFreshCache(cache, cachePath, options);
    if (cachedLaw) {
      logProgress(
        `${progressPrefix} Using cached ${seedLaw.title} (${cachedLaw.sections?.length ?? 0} sections, fetched ${cachedLaw.fetchedAt})`,
        options
      );
      const hydrationLaw = options.maxSections === undefined ? cachedLaw : fullLawFromCache(cache);
      const translationResult = await hydratePdfTextFromSources(hydrationLaw, { ...options, cachePath, progressPrefix });
      if (translationResult.changed) {
        await writeLawCache(cachePath, translationResult.law, {
          ...options,
          completeFetch: cache.completeFetch,
          totalSections: cache.totalSections ?? translationResult.law.sections?.length ?? 0
        });
        logVerbose(`${progressPrefix} Updated cache with PDF text ${path.relative(ROOT, cachePath)}`, options);
      }
      const preparedLaw =
        options.maxSections === undefined ? translationResult.law : limitLawSections(translationResult.law, options.maxSections);
      return annotateRefreshMetadata(preparedLaw, {
        status: translationResult.partial ? "partial" : "cached",
        cachePath,
        fetchedAt: cachedLaw.fetchedAt ?? ""
      });
    }
  }

  const resumeCache = cacheCanSeedResume(cache) ? cache : undefined;
  if (resumeCache) {
    logProgress(
      `${progressPrefix} Resuming ${seedLaw.title} from ${resumeCache.law.sections?.length ?? 0} cached section(s)`,
      options
    );
  }
  logProgress(`${progressPrefix} Fetching ${seedLaw.title} from ${sourceUrl}`, options);
  let fetchResult;
  try {
    fetchResult = await fetchLaw(seedLaw, { ...options, resumeCache });
  } catch (error) {
    const failedLaw = normaliseLaw({
      ...seedLaw,
      sourceUrl,
      sources: seedLaw.sources ?? { en: [{ kind: "html", url: sourceUrl }] }
    });
    options.logger?.error(`${progressPrefix} Failed to fetch ${seedLaw.title} from ${sourceUrl}: ${error.message}`);
    return annotateRefreshMetadata(failedLaw, {
      status: "failed",
      cachePath,
      error: error.message,
      fetchedAt: ""
    });
  }
  const translationResult = await hydratePdfTextFromSources(fetchResult.law, { ...options, cachePath, progressPrefix });
  const fetchedLaw = translationResult.law;
  logProgress(
    `${progressPrefix} Fetched ${fetchResult.fetchedSections} new section(s), reused ${
      fetchResult.reusedSections
    } cached section(s), total ${fetchedLaw.sections?.length ?? 0}/${fetchResult.requestedSections} for ${fetchedLaw.title}`,
    options
  );

  if (cachePath) {
    await writeLawCache(cachePath, fetchedLaw, {
      ...options,
      completeFetch: fetchResult.completeFetch,
      totalSections: fetchResult.totalSections
    });
    logVerbose(`${progressPrefix} Wrote cache ${path.relative(ROOT, cachePath)}`, options);
  }

  return annotateRefreshMetadata(fetchedLaw, {
    status: fetchResult.partialFetch || translationResult.partial ? "partial" : "fetched",
    cachePath,
    fetchedAt: fetchedLaw.fetchedAt ?? new Date().toISOString()
  });
}

async function fetchLaw(seedLaw, options) {
  const sourceUrl = sourceUrlForLaw(seedLaw);
  logVerbose(`Fetching law landing page for ${seedLaw.title}: ${sourceUrl}`, options);
  const html = await fetchText(sourceUrl, { logger: options.httpLogger });
  logVerbose(`Fetched law landing page for ${seedLaw.title}: ${html.length} character(s)`, options);
  const metadata = extractIndiaCodeMetadata(html, sourceUrl);
  const sectionRefs = extractIndiaCodeSections(html);
  const limitedSections = options.maxSections ? sectionRefs.slice(0, options.maxSections) : sectionRefs;
  const cachedSections = reusableCachedSections(options.resumeCache);
  const sections = [];
  let fetchedSections = 0;
  let reusedSections = 0;
  let partialFetch = false;
  let lastProgressAt = Date.now();

  logVerbose(
    `Found ${sectionRefs.length} section reference(s) for ${seedLaw.title}; fetching ${
      limitedSections.length
    } section(s) after maxSections=${options.maxSections ?? "all"}`,
    options
  );
  if (cachedSections.size > 0) {
    logVerbose(`Resume cache for ${seedLaw.title} has ${cachedSections.size} reusable section(s)`, options);
  }

  for (let index = 0; index < limitedSections.length; index += 1) {
    const section = limitedSections[index];
    const cachedSection = cachedSections.get(section.sectionId);
    if (cachedSection) {
      sections.push(mergeCachedSection(section, cachedSection));
      reusedSections += 1;
      continue;
    }
    if (runtimeBudgetExhausted(options.startedAt, options.maxRuntimeMs)) {
      partialFetch = true;
      options.logger?.warn(
        `Runtime checkpoint reached while fetching ${seedLaw.title} after ${sections.length}/${limitedSections.length} section(s)`
      );
      break;
    }
    const query = new URLSearchParams(section.query);
    const actId = query.get("actid");
    const sectionUrl = sectionContentUrl(sourceUrl);
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
    fetchedSections += 1;
    if (shouldLogSectionProgress(index, limitedSections.length, lastProgressAt, options.progressIntervalMs)) {
      logProgress(`  ${seedLaw.title}: fetched ${index + 1}/${limitedSections.length} sections`, options);
      lastProgressAt = Date.now();
    }
    await sleep(options.delayMs);
  }

  const law = normaliseLaw({
    ...seedLaw,
    ...metadata,
    slug: seedLaw.slug || metadata.slug,
    handle: seedLaw.handle || metadata.handle,
    sourceUrl,
    sources: mergeSources(seedLaw.sources, metadata.sources),
    sections
  });
  law.fetchedAt = new Date().toISOString();
  return {
    law,
    completeFetch: !partialFetch && limitedSections.length >= sectionRefs.length,
    fetchedSections,
    partialFetch,
    requestedSections: limitedSections.length,
    reusedSections,
    totalSections: sectionRefs.length
  };
}

async function hydratePdfTextFromSources(law, options) {
  let changed = false;
  let partial = false;

  for (const language of options.languages ?? []) {
    const languageCode = language.code;
    if (!languageCode) {
      continue;
    }

    const existingSections =
      languageCode === "en" ? law.sections ?? [] : law.translations?.[languageCode]?.sections ?? [];
    if (existingSections.length > 0) {
      continue;
    }

    const source = firstPdfSource(law.sources?.[languageCode] ?? []);
    if (!source) {
      continue;
    }

    if (runtimeBudgetExhausted(options.startedAt, options.maxRuntimeMs)) {
      partial = true;
      options.logger?.warn(
        `${options.progressPrefix} Runtime checkpoint reached before extracting ${language.name} PDF text for ${law.title}`
      );
      break;
    }

    try {
      logProgress(
        `${options.progressPrefix} Extracting ${language.name} PDF text for ${law.title}: ${source.url}`,
        options
      );
      const pdfBuffer = await fetchBuffer(source.url, {
        logger: options.httpLogger,
        headers: {
          Accept: "application/pdf,*/*;q=0.8"
        }
      });
      const { pageCount, sections } = await extractPdfTextSections(pdfBuffer);
      if (sections.length === 0) {
        options.logger?.warn(
          `${options.progressPrefix} No extractable text found in ${language.name} PDF for ${law.title}: ${source.url}`
        );
        continue;
      }

      if (languageCode === "en") {
        law.sections = sections;
        law.fetchedAt ??= new Date().toISOString();
      } else {
        law.translations ??= {};
        law.translations[languageCode] = {
          title: source.title || law.translations?.[languageCode]?.title || localizedTitleForLanguage(law, languageCode),
          sourceUrl: source.url,
          sourceKind: source.kind ?? "pdf",
          fetchedAt: new Date().toISOString(),
          pageCount,
          sections
        };
        if (languageCode === "hi" && source.title && !law.hindiTitle) {
          law.hindiTitle = source.title;
        }
      }
      changed = true;
      logProgress(
        `${options.progressPrefix} Extracted ${sections.length}/${pageCount} page(s) of ${language.name} Markdown text for ${law.title}`,
        options
      );
      if (options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    } catch (error) {
      options.logger?.warn(
        `${options.progressPrefix} Unable to extract ${language.name} PDF text for ${law.title} from ${source.url}: ${error.message}`
      );
    }
  }

  return { changed, law, partial };
}

function firstPdfSource(sources) {
  return sources.find((source) => {
    if (!source?.url) {
      return false;
    }
    const kind = String(source.kind ?? "").toLowerCase();
    return kind === "pdf" || /\.pdf(?:[?#].*)?$/i.test(source.url);
  });
}

function localizedTitleForLanguage(law, languageCode) {
  return law.localizedTitles?.[languageCode] || (languageCode === "hi" ? law.hindiTitle : "") || law.title;
}

function sourceUrlForLaw(law) {
  return law.sourceUrl ?? `https://www.indiacode.nic.in/handle/123456789/${law.handle}`;
}

function lawFromFreshCache(cache, cachePath, options) {
  if (!cache) {
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

function fullLawFromCache(cache) {
  const law = normaliseLaw(structuredClone(cache.law));
  law.fetchedAt = cache.fetchedAt;
  return law;
}

function limitLawSections(law, maxSections) {
  const limited = normaliseLaw(structuredClone(law));
  limited.sections = (limited.sections ?? []).slice(0, maxSections);
  return limited;
}

async function writeLawCache(cachePath, law, options) {
  logVerbose(`Creating cache directory ${path.relative(ROOT, path.dirname(cachePath))}`, options);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeDataFile(cachePath, {
    cacheVersion: 1,
    fetchedAt: new Date().toISOString(),
    sourceUrl: law.sourceUrl ?? "",
    completeFetch: options.completeFetch ?? options.maxSections === undefined,
    maxSections: options.maxSections ?? null,
    sectionCount: law.sections?.length ?? 0,
    totalSections: options.totalSections ?? law.sections?.length ?? 0,
    law
  });
}

async function readLawCache(cachePath, options) {
  try {
    logVerbose(`Reading law cache ${path.relative(ROOT, cachePath)}`, options);
    return await readDataFile(cachePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      options.logger?.warn(`Ignoring unreadable law cache ${path.relative(ROOT, cachePath)}: ${error.message}`);
      return undefined;
    }
  }

  const legacyJsonPath = legacyJsonCachePath(cachePath);
  try {
    logVerbose(`No Lino cache found at ${path.relative(ROOT, cachePath)}; checking legacy JSON cache`, options);
    return JSON.parse(await readFile(legacyJsonPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      options.logger?.warn(`Ignoring unreadable legacy law cache ${path.relative(ROOT, legacyJsonPath)}: ${error.message}`);
    } else {
      logVerbose(`No law cache found at ${path.relative(ROOT, cachePath)}`, options);
    }
    return undefined;
  }
}

function lawCachePath(cacheDir, law) {
  return path.join(cacheDir, `${cacheKey(law)}.lino`);
}

function legacyJsonCachePath(cachePath) {
  return cachePath.endsWith(".lino") ? `${cachePath.slice(0, -".lino".length)}.json` : `${cachePath}.json`;
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
  const cachedSectionCount = cache.law?.sections?.length ?? 0;
  if (options.maxSections === undefined) {
    return cache.completeFetch === true || (cache.completeFetch !== false && cache.maxSections == null);
  }
  if (cache.completeFetch === false) {
    return cachedSectionCount >= options.maxSections;
  }
  return (
    cache.completeFetch === true ||
    cache.maxSections == null ||
    Number(cache.maxSections ?? 0) >= options.maxSections ||
    cachedSectionCount >= options.maxSections
  );
}

function cacheCanSeedResume(cache) {
  return Boolean(cache?.law && cache.completeFetch === false && Array.isArray(cache.law.sections));
}

function reusableCachedSections(cache) {
  const sections = new Map();
  for (const section of cache?.law?.sections ?? []) {
    if (section.sectionId && !sections.has(section.sectionId)) {
      sections.set(section.sectionId, section);
    }
  }
  return sections;
}

function mergeCachedSection(sectionRef, cachedSection) {
  return {
    ...sectionRef,
    title: cachedSection.title || sectionRef.title,
    content: cachedSection.content ?? "",
    footnotes: cachedSection.footnotes ?? ""
  };
}

function sectionContentUrl(sourceUrl) {
  return new URL("/SectionPageContent", sourceUrl || "https://www.indiacode.nic.in");
}

function createRefreshProgress({
  cacheDir,
  defaultLanguage,
  fetchLive,
  manifestPath,
  maxRuntimeMs,
  outputDir,
  progressIntervalMs,
  regionalPath,
  selectedLaws,
  startedAt
}) {
  const laws = selectedLaws.map((rawLaw, index) => {
    const law = normaliseLaw(rawLaw);
    return {
      index: index + 1,
      slug: law.slug,
      title: law.title ?? "",
      status: fetchLive ? "pending" : "seed",
      cacheFile: cacheDir ? path.relative(ROOT, lawCachePath(cacheDir, law)) : "",
      sourceUrl: law.sourceUrl ?? "",
      fetchedAt: "",
      sectionCount: 0,
      error: ""
    };
  });
  const completedLaws = fetchLive ? 0 : laws.length;
  return {
    status: fetchLive ? "running" : "offline",
    refreshStartedAt: new Date(startedAt).toISOString(),
    updatedAt: new Date().toISOString(),
    manifest: path.relative(ROOT, manifestPath),
    regionalSources: path.relative(ROOT, regionalPath),
    output: path.relative(ROOT, outputDir),
    defaultLanguage,
    cacheDir: cacheDir ? path.relative(ROOT, cacheDir) : "",
    maxRuntimeMs: maxRuntimeMs ?? null,
    progressIntervalMs,
    totalLaws: laws.length,
    completedLaws,
    pendingLaws: fetchLive ? laws.length : 0,
    failedLaws: 0,
    partialLaws: 0,
    partialRefresh: false,
    laws
  };
}

function recordLawProgress(progress, index, law) {
  if (!progress) {
    return;
  }
  const entry = progress.laws[index];
  if (!entry) {
    return;
  }
  const refreshMetadata = law.__refreshMetadata ?? {};
  entry.status = refreshMetadata.status ?? "seed";
  entry.cacheFile = refreshMetadata.cachePath ? path.relative(ROOT, refreshMetadata.cachePath) : entry.cacheFile;
  entry.sourceUrl = law.sourceUrl ?? entry.sourceUrl;
  entry.fetchedAt = law.fetchedAt ?? refreshMetadata.fetchedAt ?? "";
  entry.sectionCount = law.sections?.length ?? 0;
  entry.error = refreshMetadata.error ?? "";
  refreshProgressCounts(progress);
}

function recordPendingLawProgress(progress, index) {
  if (!progress?.laws[index]) {
    return;
  }
  progress.laws[index].status = "pending";
  refreshProgressCounts(progress);
}

function finalizeRefreshProgress(progress, { partialRefresh }) {
  if (!progress) {
    return;
  }
  progress.partialRefresh = partialRefresh;
  progress.status = partialRefresh ? "partial" : "complete";
  refreshProgressCounts(progress);
}

function refreshProgressCounts(progress) {
  progress.updatedAt = new Date().toISOString();
  progress.completedLaws = progress.laws.filter((law) => ["cached", "fetched", "seed"].includes(law.status)).length;
  progress.pendingLaws = progress.laws.filter((law) => law.status === "pending").length;
  progress.failedLaws = progress.laws.filter((law) => law.status === "failed").length;
  progress.partialLaws = progress.laws.filter((law) => law.status === "partial").length;
}

async function writeRefreshProgress(progressPath, progress, options = {}) {
  if (!progressPath || !progress) {
    return;
  }
  if (options.verbose) {
    options.logger?.info(`Writing refresh progress to ${path.relative(ROOT, progressPath)}`);
  }
  await mkdir(path.dirname(progressPath), { recursive: true });
  await writeDataFile(progressPath, progress);
}

function annotateRefreshMetadata(law, metadata) {
  Object.defineProperty(law, "__refreshMetadata", {
    configurable: true,
    enumerable: false,
    value: metadata
  });
  return law;
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

async function writeSite({ outputDir, logger, languages, defaultLanguage, laws, maxLines, pathAlias, sourceMetadata }) {
  logger?.info(`Writing site output to ${path.relative(ROOT, outputDir)}`);
  await mkdir(outputDir, { recursive: true });
  logger?.info("Removing generated laws/assets/data output from previous build");
  await rm(path.join(outputDir, "laws"), { recursive: true, force: true });
  await rm(path.join(outputDir, "assets"), { recursive: true, force: true });
  await rm(path.join(outputDir, "data"), { recursive: true, force: true });
  await rm(path.join(outputDir, "site.css"), { force: true });
  await rm(path.join(outputDir, "site.js"), { force: true });
  if (pathAlias) {
    await rm(path.join(outputDir, pathAlias), { recursive: true, force: true });
  }

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
  if (pathAlias) {
    const aliasDir = path.join(outputDir, pathAlias);
    logger?.info(`Writing path alias shell ${path.relative(ROOT, path.join(aliasDir, "index.html"))}`);
    await mkdir(aliasDir, { recursive: true });
    await writeFile(
      path.join(aliasDir, "index.html"),
      renderAppShell({ cssHash, appHash, assetBase: relativeAssetBase(pathAlias) })
    );
  }
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
  for (const [languageCode, translation] of Object.entries(law.translations ?? {})) {
    if (translation.title) {
      titles[languageCode] = translation.title;
    }
  }
  if (law.hindiTitle) {
    titles.hi = law.hindiTitle;
  }
  return titles;
}

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 12);
}

function renderAppShell({ cssHash, appHash, assetBase = "" }) {
  const assetBaseScript = assetBase
    ? `  <script>window.__INDIAN_LAW_ASSET_BASE__ = ${JSON.stringify(assetBase)};</script>\n`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Indian Law</title>
  <link rel="icon" href="${assetBase}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${assetBase}assets/site.css?v=${cssHash}">
${assetBaseScript}  <script type="module" src="${assetBase}assets/app.js?v=${appHash}"></script>
</head>
<body>
  <div id="root">
    <main class="loading-shell">Loading Indian Law</main>
  </div>
</body>
</html>
`;
}

function normalisePathAlias(value) {
  const segments = String(value)
    .split("/")
    .filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid path alias: ${value}`);
  }
  return segments.join("/");
}

function relativeAssetBase(pathAlias) {
  const depth = pathAlias.split("/").filter(Boolean).length;
  return depth ? `${Array.from({ length: depth }, () => "..").join("/")}/` : "";
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
