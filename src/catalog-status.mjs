export function hasKnownSource(record) {
  return Boolean(record?.status === "source-only" || record?.sources?.length);
}

export function textStatusForLanguage(record, languageCode = "") {
  if (record?.enabled) {
    return "Markdown";
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
  const code = requestedLanguage || defaultLanguage || "";
  return { code, record: languages[code] ?? null };
}
