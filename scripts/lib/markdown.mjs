import { slugify } from "./html.mjs";

export function countLines(value = "") {
  if (!value) {
    return 0;
  }
  return String(value).split(/\r?\n/).length;
}

export function sectionMarkdown(section) {
  if (section.kind === "page") {
    const title = section.title || `Page ${section.sectionNo}`;
    const lines = [`## ${title}`, ""];
    if (section.content) {
      lines.push(section.content.trim(), "");
    }
    if (section.footnotes) {
      lines.push("### Footnotes", "", section.footnotes.trim(), "");
    }
    return lines.join("\n").trimEnd();
  }

  const title = section.title && section.title !== `Section ${section.sectionNo}` ? ` - ${section.title}` : "";
  const lines = [`## Section ${section.sectionNo}${title}`, ""];
  if (section.content) {
    lines.push(section.content.trim(), "");
  }
  if (section.footnotes) {
    lines.push("### Footnotes", "", section.footnotes.trim(), "");
  }
  return lines.join("\n").trimEnd();
}

export function splitSectionsIntoParts(sections, options = {}) {
  const maxLines = options.maxLines ?? 1500;
  const parts = [];
  let current = [];
  let currentLineCount = 0;

  for (const section of sections) {
    const sectionText = sectionMarkdown(section);
    const sectionLineCount = countLines(sectionText) + 1;
    if (current.length > 0 && currentLineCount + sectionLineCount > maxLines) {
      parts.push(current);
      current = [];
      currentLineCount = 0;
    }
    current.push(section);
    currentLineCount += sectionLineCount;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

export function renderMarkdownPart({ law, language, partIndex, partCount, sections, maxLines = 1500 }) {
  const title = localizedLawTitle(law, language.code);
  const partNumber = partIndex + 1;
  const languageCode = language.code;
  const sources = sourcesForLanguage(law, languageCode);
  const sourceLinks = sources
    .filter((source) => source.url)
    .map((source) => `- ${source.kind}: ${source.url}`)
    .join("\n");
  const primarySource = sources.find((source) => source.url)?.url ?? law.sourceUrl ?? "";
  const sectionBody = sections.map((section) => sectionMarkdown(section)).join("\n\n");
  const firstSection = sections[0]?.sectionNo ?? "";
  const lastSection = sections.at(-1)?.sectionNo ?? "";
  const rangeLabel = sections.some((section) => section.kind === "page") ? "Pages" : "Sections";
  const frontMatter = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `language: ${languageCode}`,
    `part: ${partNumber}`,
    `parts: ${partCount}`,
    `line_limit: ${maxLines}`,
    `source: "${escapeYaml(primarySource)}"`,
    "---",
    ""
  ].join("\n");
  const intro = [
    `# ${title}`,
    "",
    `Language: ${language.name}`,
    `Part ${partNumber} of ${partCount}`,
    firstSection && lastSection ? `${rangeLabel}: ${firstSection} to ${lastSection}` : "",
    "",
    "> Editorial note: This page is generated from official public source data with source links, section anchors, and processing metadata added by this repository.",
    "",
    "Sources:",
    sourceLinks || `- ${law.sourceUrl}`,
    "",
    sectionBody || "No section text is available in the offline seed. Run the refresh workflow to fetch the official section text.",
    ""
  ]
    .filter((line) => line !== false)
    .join("\n");
  return `${frontMatter}${intro}`;
}

export function lawPartFileName(partIndex) {
  return `part-${String(partIndex + 1).padStart(3, "0")}`;
}

export function normaliseLaw(rawLaw) {
  return {
    ...rawLaw,
    slug: rawLaw.slug || slugify(rawLaw.title),
    sources: rawLaw.sources ?? {},
    sections: rawLaw.sections ?? []
  };
}

function localizedLawTitle(law, languageCode) {
  if (languageCode === "en") {
    return cleanTitle(law.title) || neutralLawLabel(law);
  }
  return (
    cleanTitle(law.translations?.[languageCode]?.title) ||
    cleanTitle(law.localizedTitles?.[languageCode]) ||
    (languageCode === "hi" ? cleanTitle(law.hindiTitle) : "") ||
    cleanTitle(firstSourceTitle(law, languageCode)) ||
    neutralLawLabel(law)
  );
}

function sourcesForLanguage(law, languageCode) {
  const sources = law.sources?.[languageCode] ?? [];
  if (sources.length > 0) {
    return sources;
  }
  if (languageCode === "en") {
    return law.sources?.en ?? [];
  }
  return [];
}

function escapeYaml(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function firstSourceTitle(law, languageCode) {
  return (law.sources?.[languageCode] ?? []).find((source) => cleanTitle(source?.title))?.title ?? "";
}

function neutralLawLabel(law = {}) {
  const actNumber = cleanTitle(law.actNumber);
  const actYear = cleanTitle(law.actYear);
  if (actNumber && actYear) {
    return `Act ${actNumber} of ${actYear}`;
  }
  if (actYear) {
    return `Act of ${actYear}`;
  }
  return cleanTitle(law.slug)?.replace(/-/g, " ") || "Untitled law";
}

function cleanTitle(value) {
  const text = String(value ?? "").trim();
  if (!text || /^(null|undefined|n\/a|na|-|--)$/i.test(text)) {
    return "";
  }
  return text;
}
