const PLACEHOLDER_TITLE = /^(null|undefined|n\/a|na|-|--)$/i;

export function cleanSourceTitle(value = "") {
  const text = String(value ?? "").trim();
  return text && !PLACEHOLDER_TITLE.test(text) ? text : "";
}

export function cleanSources(sources = []) {
  const cleaned = [];
  const seen = new Set();
  for (const source of sources) {
    if (!isPublishableSource(source)) {
      continue;
    }
    const entry = {
      ...source,
      title: cleanSourceTitle(source?.title)
    };
    const key = `${entry.kind ?? ""}:${entry.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(entry);
  }
  return cleaned;
}

export function sourcesForCatalogLanguage(law, languageCode, defaultLanguage = "en", options = {}) {
  const languageSources = cleanSources(law?.sources?.[languageCode] ?? []);
  const hasLanguageEntry = Boolean(options.hasLanguageEntry || options.hasMarkdown || languageSources.length > 0);
  if (languageCode === defaultLanguage || !hasLanguageEntry) {
    return languageSources;
  }

  const defaultHtml = defaultHtmlSource(law, defaultLanguage);
  if (!defaultHtml || languageSources.some((source) => source.url === defaultHtml.url)) {
    return languageSources;
  }
  return [defaultHtml, ...languageSources];
}

export function primarySourceForLanguage(law, languageCode, defaultLanguage = "en", options = {}) {
  const languageSource = cleanSources(law?.sources?.[languageCode] ?? []).find((source) => source.url);
  if (languageSource) {
    return languageSource.url;
  }
  return sourcesForCatalogLanguage(law, languageCode, defaultLanguage, options).find((source) => source.url)?.url ?? "";
}

function defaultHtmlSource(law, defaultLanguage) {
  const defaultSources = cleanSources(law?.sources?.[defaultLanguage] ?? []);
  const htmlSource = defaultSources.find((source) => isHtmlSource(source));
  if (htmlSource) {
    return htmlSource;
  }
  return cleanSources([{ kind: "html", url: law?.sourceUrl ?? "" }])[0];
}

function isPublishableSource(source) {
  if (!source?.url || source.downloadStatus === "failed" || source.available === false || source.unavailable === true) {
    return false;
  }

  let url;
  try {
    url = new URL(source.url);
  } catch {
    return false;
  }

  if (!isIndiaCodeHost(url.hostname)) {
    return true;
  }

  const pathname = url.pathname;
  if (/^\/help\/userGuide\.pdf$/i.test(pathname)) {
    return false;
  }

  if (isHtmlSource(source)) {
    return /^\/(?:indiacode\/)?handle\/123456789\/\d+\/?$/i.test(pathname);
  }

  if (isPdfSource(source)) {
    return /^\/bitstream\/123456789\/\d+\/\d+\/[^/]+\.pdf$/i.test(pathname);
  }

  return false;
}

function isHtmlSource(source) {
  return String(source?.kind ?? "").toLowerCase() === "html";
}

function isPdfSource(source) {
  const kind = String(source?.kind ?? "").toLowerCase();
  return kind === "pdf" || /\.pdf(?:[?#].*)?$/i.test(source?.url ?? "");
}

function isIndiaCodeHost(hostname) {
  return hostname.replace(/^www\./i, "").toLowerCase() === "indiacode.nic.in";
}
