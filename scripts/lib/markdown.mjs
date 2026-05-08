import { slugify } from "./html.mjs";

export function countLines(value = "") {
  if (!value) {
    return 0;
  }
  return String(value).split(/\r?\n/).length;
}

export function sectionMarkdown(section) {
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
  const title = law.title;
  const partNumber = partIndex + 1;
  const languageCode = language.code;
  const sourceLinks = Object.values(law.sources ?? {})
    .flat()
    .filter((source) => source.url)
    .map((source) => `- ${source.kind}: ${source.url}`)
    .join("\n");
  const sectionBody = sections.map((section) => sectionMarkdown(section)).join("\n\n");
  const firstSection = sections[0]?.sectionNo ?? "";
  const lastSection = sections.at(-1)?.sectionNo ?? "";
  const frontMatter = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `language: ${languageCode}`,
    `part: ${partNumber}`,
    `parts: ${partCount}`,
    `line_limit: ${maxLines}`,
    `source: "${escapeYaml(law.sourceUrl ?? "")}"`,
    "---",
    ""
  ].join("\n");
  const intro = [
    `# ${title}`,
    "",
    `Language: ${language.name}`,
    `Part ${partNumber} of ${partCount}`,
    firstSection && lastSection ? `Sections: ${firstSection} to ${lastSection}` : "",
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

function escapeYaml(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
