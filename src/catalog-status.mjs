export function hasKnownSource(record) {
  return Boolean(record?.status === "source-only" || record?.sources?.length);
}

export function hasLanguageCatalogEntry(record) {
  return Boolean(record?.enabled || hasKnownSource(record));
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

export function lawsForLanguage(catalog, languageCode) {
  return (catalog?.laws ?? []).filter((law) => hasLanguageCatalogEntry(law?.languages?.[languageCode]));
}

export function groupLawsByCategory(catalog, laws) {
  const categories = normaliseCatalogCategories(catalog?.categories);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategory = categoriesById.get("general") ?? { id: "general", label: "General", description: "" };
  const groups = new Map(categories.map((category) => [category.id, { category, laws: [] }]));

  if (!groups.has(fallbackCategory.id)) {
    groups.set(fallbackCategory.id, { category: fallbackCategory, laws: [] });
  }

  for (const law of laws ?? []) {
    const categoryId = categoryIdForValue(law?.category);
    const resolvedId = categoriesById.has(categoryId) ? categoryId : fallbackCategory.id;
    groups.get(resolvedId).laws.push(law);
  }

  return [...groups.values()].filter((group) => group.laws.length > 0);
}

export function languageCoverageForCatalog(catalog, languageCode) {
  const laws = lawsForLanguage(catalog, languageCode);
  return {
    ready: laws.filter((law) => law.languages?.[languageCode]?.enabled).length,
    total: laws.length
  };
}

export function displayTitleForLanguage(law, languageCode, defaultLanguage = "") {
  if (languageCode === defaultLanguage) {
    return cleanDisplayTitle(law?.title) || neutralLawLabel(law);
  }

  return (
    cleanDisplayTitle(law?.localizedTitles?.[languageCode]) ||
    cleanDisplayTitle(firstSourceTitleForLanguage(law, languageCode)) ||
    neutralLawLabel(law)
  );
}

function firstSourceTitleForLanguage(law, languageCode) {
  const languageSources = law?.languages?.[languageCode]?.sources ?? law?.sources?.[languageCode] ?? [];
  return languageSources.find((source) => cleanDisplayTitle(source?.title))?.title ?? "";
}

function neutralLawLabel(law = {}) {
  const actNumber = cleanDisplayTitle(law.actNumber);
  const actYear = cleanDisplayTitle(law.actYear);
  if (actNumber && actYear) {
    return `Act ${actNumber} of ${actYear}`;
  }
  if (actYear) {
    return `Act of ${actYear}`;
  }
  return cleanDisplayTitle(law.slug)?.replace(/-/g, " ") || "Untitled law";
}

function cleanDisplayTitle(value) {
  const text = String(value ?? "").trim();
  if (!text || /^(null|undefined|n\/a|na|-|--)$/i.test(text)) {
    return "";
  }
  return text;
}

function normaliseCatalogCategories(categories) {
  const normalised = (categories ?? [])
    .map((category) => ({
      id: categoryIdForValue(category?.id),
      label: cleanDisplayTitle(category?.label),
      description: cleanDisplayTitle(category?.description)
    }))
    .filter((category) => category.id);

  return normalised.length > 0 ? normalised : [{ id: "general", label: "General", description: "" }];
}

function categoryIdForValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
