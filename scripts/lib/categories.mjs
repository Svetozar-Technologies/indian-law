const FALLBACK_CATEGORY = {
  id: "general",
  label: "General",
  description: "General, administrative, institutional, and uncategorized laws."
};

export function normaliseCategoryConfig(rawConfig = {}) {
  const categories = [];
  const categoriesById = new Map();
  const childrenByParent = new Map();

  for (const category of entries(rawConfig.categories)) {
    addCategory(category, "", 0, []);
  }

  if (!categoriesById.has(FALLBACK_CATEGORY.id)) {
    addCategory(FALLBACK_CATEGORY, "", 0, []);
  }

  const known = new Set(categories.map((category) => category.id));
  const defaultCategory =
    rootCategoryId(categoryId(rawConfig.defaultCategory), categoriesById) ||
    rootCategoryId(FALLBACK_CATEGORY.id, categoriesById) ||
    categories.find((category) => !category.parentId)?.id ||
    FALLBACK_CATEGORY.id;
  const topLevelIds = categories.filter((category) => !category.parentId).map((category) => category.id);
  const configuredPriority = entries(rawConfig.priority)
    .map((entry) => rootCategoryId(categoryId(entry), categoriesById))
    .filter(Boolean);
  const priority = unique([...configuredPriority, ...topLevelIds]);
  const explicit = new Map();
  const ministries = new Map();
  const keywords = [];

  for (const rule of entries(rawConfig.explicit)) {
    const slug = lawSlug(rule?.slug);
    const categoriesForRule = categoryListFromRule(rule, known);
    const tags = tagListFromRule(rule, known);
    if (slug && categoriesForRule.length > 0) {
      explicit.set(slug, { categories: categoriesForRule, tags });
    }
  }

  for (const rule of entries(rawConfig.ministries)) {
    const name = normalizedText(rule?.name);
    const categoriesForRule = categoryListFromRule(rule, known);
    if (name && categoriesForRule.length > 0) {
      ministries.set(name, categoriesForRule);
    }
  }

  for (const rule of entries(rawConfig.keywords)) {
    const pattern = cleanText(rule?.pattern);
    const categoriesForRule = categoryListFromRule(rule, known);
    if (!pattern || categoriesForRule.length === 0) {
      continue;
    }
    try {
      keywords.push({ pattern, regex: new RegExp(pattern, "i"), categories: categoriesForRule });
    } catch {
      // Invalid editable taxonomy patterns are ignored instead of breaking the whole build.
    }
  }

  return {
    __normalisedCategoryConfig: true,
    categories,
    categoriesById,
    childrenByParent,
    defaultCategory,
    explicit,
    keywords,
    known,
    ministries,
    priority
  };

  function addCategory(rawCategory, parentId, depth, parentPath) {
    const id = categoryId(rawCategory?.id);
    if (!id || categoriesById.has(id)) {
      return;
    }

    const category = {
      id,
      label: cleanText(rawCategory?.label) || titleCase(id),
      description: cleanText(rawCategory?.description),
      parentId,
      depth,
      path: [...parentPath, id]
    };
    categories.push(category);
    categoriesById.set(id, category);
    if (parentId) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(id);
      childrenByParent.set(parentId, siblings);
    }

    for (const child of entries(rawCategory?.children)) {
      addCategory(child, id, depth + 1, category.path);
    }
  }
}

export function catalogCategories(config) {
  const normalised = ensureCategoryConfig(config);
  return normalised.categories.map((category) => {
    const entry = {
      id: category.id,
      label: category.label || titleCase(category.id),
      description: category.description ?? "",
      depth: category.depth,
      path: category.path
    };
    if (category.parentId) {
      entry.parent = category.parentId;
    }
    return entry;
  });
}

export function catalogCategoryTree(config) {
  const normalised = ensureCategoryConfig(config);
  return normalised.categories
    .filter((category) => !category.parentId)
    .map((category) => categoryTreeNode(category, normalised));
}

export function classifyLaw(law, config) {
  const normalised = ensureCategoryConfig(config);
  const mainCandidates = new Set();
  const tagCandidates = new Set();
  let forcedMain = "";

  const explicitRule = normalised.explicit.get(lawSlug(law?.slug));
  if (explicitRule) {
    forcedMain = mainCategoryForId(explicitRule.categories[0], normalised);
    addCategoryMatches(explicitRule.categories, { mainCandidates, tagCandidates, normalised });
    addCategoryMatches(explicitRule.tags, { mainCandidates, tagCandidates, normalised });
  }

  const declaredCategories = [law?.category, law?.primaryCategory, ...(Array.isArray(law?.categories) ? law.categories : [])];
  const declaredMain = declaredCategories.map((value) => knownCategory(value, normalised.known)).find(Boolean);
  if (!forcedMain && declaredMain) {
    forcedMain = mainCategoryForId(declaredMain, normalised);
  }
  addCategoryMatches(declaredCategories, { mainCandidates, tagCandidates, normalised });

  for (const ministryField of [law?.ministry, law?.department]) {
    const ministryCategories = normalised.ministries.get(normalizedText(ministryField)) ?? [];
    addCategoryMatches(ministryCategories, { mainCandidates, tagCandidates, normalised });
  }

  const searchable = [law?.slug, law?.title, law?.longTitle, law?.ministry, law?.department]
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .join(" ");
  for (const rule of normalised.keywords) {
    if (rule.regex.test(searchable)) {
      addCategoryMatches(rule.categories, { mainCandidates, tagCandidates, normalised });
    }
  }

  const category = forcedMain || preferredCategory(mainCandidates, normalised);
  return {
    category,
    tags: preferredTags(tagCandidates, category, normalised)
  };
}

export function categoryForLaw(law, config) {
  return classifyLaw(law, config).category;
}

export function categoryTagsForLaw(law, config) {
  return classifyLaw(law, config).tags;
}

function categoryTreeNode(category, config) {
  const children = (config.childrenByParent.get(category.id) ?? [])
    .map((childId) => config.categoriesById.get(childId))
    .filter(Boolean)
    .map((child) => categoryTreeNode(child, config));
  const node = {
    id: category.id,
    label: category.label || titleCase(category.id),
    description: category.description ?? ""
  };
  if (children.length > 0) {
    node.children = children;
  }
  return node;
}

function ensureCategoryConfig(config) {
  return config?.__normalisedCategoryConfig ? config : normaliseCategoryConfig(config);
}

function addCategoryMatches(values, { mainCandidates, tagCandidates, normalised }) {
  for (const value of values) {
    const id = knownCategory(value, normalised.known);
    if (!id) {
      continue;
    }
    tagCandidates.add(id);
    const mainCategory = mainCategoryForId(id, normalised);
    if (mainCategory) {
      mainCandidates.add(mainCategory);
    }
  }
}

function mainCategoryForId(id, config) {
  return rootCategoryId(id, config.categoriesById) || config.defaultCategory;
}

function rootCategoryId(id, categoriesById) {
  let category = categoriesById.get(id);
  if (!category) {
    return "";
  }
  while (category.parentId && categoriesById.has(category.parentId)) {
    category = categoriesById.get(category.parentId);
  }
  return category.id;
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

function preferredTags(candidates, primaryCategory, config) {
  const primary = categoryId(primaryCategory);
  return config.categories
    .map((category) => category.id)
    .filter((id) => id !== primary && candidates.has(id));
}

function categoryListFromRule(rule, known) {
  return unique([...listValues(rule?.category), ...listValues(rule?.categories)].map((entry) => knownCategory(entry, known))).filter(
    Boolean
  );
}

function tagListFromRule(rule, known) {
  return unique([...listValues(rule?.tag), ...listValues(rule?.tags)].map((entry) => knownCategory(entry, known))).filter(Boolean);
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function listValues(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return Object.values(value);
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
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
