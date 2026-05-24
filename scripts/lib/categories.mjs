const FALLBACK_CATEGORY = {
  id: "general",
  label: "General",
  description: "General, administrative, institutional, and uncategorized laws."
};

export function normaliseCategoryConfig(rawConfig = {}) {
  const categories = entries(rawConfig.categories)
    .map((category) => ({
      id: categoryId(category?.id),
      label: cleanText(category?.label),
      description: cleanText(category?.description)
    }))
    .filter((category) => category.id);

  if (categories.length === 0) {
    categories.push({ ...FALLBACK_CATEGORY });
  }
  if (!categories.some((category) => category.id === FALLBACK_CATEGORY.id)) {
    categories.push({ ...FALLBACK_CATEGORY });
  }

  const known = new Set(categories.map((category) => category.id));
  const defaultCategory = known.has(categoryId(rawConfig.defaultCategory))
    ? categoryId(rawConfig.defaultCategory)
    : known.has(FALLBACK_CATEGORY.id)
      ? FALLBACK_CATEGORY.id
      : categories[0].id;
  const configuredPriority = entries(rawConfig.priority)
    .map((entry) => categoryId(entry))
    .filter((entry) => known.has(entry));
  const priority = [
    ...configuredPriority,
    ...categories.map((category) => category.id).filter((id) => !configuredPriority.includes(id))
  ];
  const explicit = new Map();
  const ministries = new Map();
  const keywords = [];

  for (const rule of entries(rawConfig.explicit)) {
    const slug = lawSlug(rule?.slug);
    const category = knownCategory(rule?.category, known);
    if (slug && category) {
      explicit.set(slug, category);
    }
  }

  for (const rule of entries(rawConfig.ministries)) {
    const name = normalizedText(rule?.name);
    const category = knownCategory(rule?.category, known);
    if (name && category) {
      ministries.set(name, category);
    }
  }

  for (const rule of entries(rawConfig.keywords)) {
    const pattern = cleanText(rule?.pattern);
    const category = knownCategory(rule?.category, known);
    if (!pattern || !category) {
      continue;
    }
    try {
      keywords.push({ pattern, regex: new RegExp(pattern, "i"), category });
    } catch {
      // Invalid editable taxonomy patterns are ignored instead of breaking the whole build.
    }
  }

  return {
    __normalisedCategoryConfig: true,
    categories,
    defaultCategory,
    explicit,
    keywords,
    known,
    ministries,
    priority
  };
}

export function catalogCategories(config) {
  const normalised = ensureCategoryConfig(config);
  return normalised.categories.map((category) => ({
    id: category.id,
    label: category.label || titleCase(category.id),
    description: category.description ?? ""
  }));
}

export function categoryForLaw(law, config) {
  const normalised = ensureCategoryConfig(config);
  const explicitCategory = normalised.explicit.get(lawSlug(law?.slug));
  if (explicitCategory) {
    return explicitCategory;
  }

  const declaredCategory = firstKnownCategory(
    [law?.category, law?.primaryCategory, ...(Array.isArray(law?.categories) ? law.categories : [])],
    normalised.known
  );
  if (declaredCategory) {
    return declaredCategory;
  }

  const candidates = new Set();
  for (const ministryField of [law?.ministry, law?.department]) {
    const ministryCategory = normalised.ministries.get(normalizedText(ministryField));
    if (ministryCategory) {
      candidates.add(ministryCategory);
    }
  }

  const searchable = [law?.slug, law?.title, law?.longTitle, law?.ministry, law?.department]
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .join(" ");
  for (const rule of normalised.keywords) {
    if (rule.regex.test(searchable)) {
      candidates.add(rule.category);
    }
  }

  return preferredCategory(candidates, normalised);
}

function ensureCategoryConfig(config) {
  return config?.__normalisedCategoryConfig ? config : normaliseCategoryConfig(config);
}

function preferredCategory(candidates, config) {
  if (candidates.size === 0) {
    return config.defaultCategory;
  }
  for (const category of config.priority) {
    if (candidates.has(category)) {
      return category;
    }
  }
  return config.defaultCategory;
}

function firstKnownCategory(values, known) {
  for (const value of values) {
    const id = knownCategory(value, known);
    if (id) {
      return id;
    }
  }
  return "";
}

function knownCategory(value, known) {
  const id = categoryId(value);
  return known.has(id) ? id : "";
}

function categoryId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function lawSlug(value) {
  return categoryId(value).replace(/^the-/, "");
}

function normalizedText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function entries(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return Object.values(value);
  }
  return [];
}
