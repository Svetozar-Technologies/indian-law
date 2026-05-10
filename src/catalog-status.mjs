export function hasKnownSource(record) {
  return Boolean(record?.status === "source-only" || record?.sources?.length);
}

export function textStatusForLanguage(record, languageCode = "") {
  if (record?.enabled) {
    return languageCode ? `${languageCode.toUpperCase()} Markdown` : "Markdown";
  }
  return hasKnownSource(record) ? "Pending" : "Unavailable";
}

export function statusClassForLanguage(record) {
  if (record?.enabled) {
    return "ready";
  }
  return hasKnownSource(record) ? "pending" : "disabled";
}

export function sourceStatusForLaw(law, requestedLanguage, defaultLanguage) {
  const languages = law?.languages ?? {};
  const candidates = [requestedLanguage, defaultLanguage, ...Object.keys(languages)].filter(Boolean);
  const seen = new Set();
  for (const code of candidates) {
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    const record = languages[code];
    if (record?.enabled || hasKnownSource(record)) {
      return { code, record };
    }
  }
  const fallbackCode = requestedLanguage || defaultLanguage || Object.keys(languages)[0] || "";
  return { code: fallbackCode, record: languages[fallbackCode] ?? null };
}
