const ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

export function decodeHtml(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name] ?? match);
}

export function stripTagsToText(html = "") {
  return decodeHtml(
    String(html)
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
      .replace(/<\s*hr\b[^>]*>/gi, "\n")
      .replace(/<\s*sup\b[^>]*>/gi, "^")
      .replace(/<\/\s*sup\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function absolutizeUrl(url, base = "https://www.indiacode.nic.in") {
  return new URL(decodeHtml(url), base).toString();
}

function cleanField(value = "") {
  return stripTagsToText(value).replace(/\s+/g, " ").trim();
}

function cleanSourceTitle(value = "") {
  const text = cleanField(value);
  return /^(null|undefined|n\/a|na|-|--)$/i.test(text) ? "" : text;
}

function attributeValue(attributes = "", name = "") {
  const quotedPattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  const quoted = attributes.match(quotedPattern);
  if (quoted) {
    return quoted[2];
  }
  const unquotedPattern = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i");
  return attributes.match(unquotedPattern)?.[1] ?? "";
}

export function extractMetadataTable(html = "") {
  const metadata = {};
  const rowPattern =
    /<tr>\s*<td[^>]*class=["']metadataFieldLabel["'][^>]*>(.*?)<\/td>\s*<td[^>]*class=["']metadataFieldValue["'][^>]*>(.*?)<\/td>\s*<\/tr>/gis;
  for (const [, labelHtml, valueHtml] of html.matchAll(rowPattern)) {
    const key = cleanField(labelHtml).replace(/:$/, "");
    const value = cleanField(valueHtml);
    if (key && value) {
      metadata[key] = value;
    }
  }
  return metadata;
}

export function extractPdfSources(html = "", baseUrl = "https://www.indiacode.nic.in") {
  const sources = {};
  function addPdfSource(rawUrl, title = "") {
    if (!/\.pdf(?:[?#]|$)/i.test(rawUrl)) {
      return;
    }
    const url = absolutizeUrl(rawUrl, baseUrl)
      .replace("http://www.indiacode.nic.in", "https://www.indiacode.nic.in")
      .replace("http://indiacode.nic.in", "https://www.indiacode.nic.in");
    const parsedUrl = new URL(url);
    if (!/^\/bitstream\/123456789\//.test(parsedUrl.pathname) || !/\.pdf$/i.test(parsedUrl.pathname)) {
      return;
    }
    const text = cleanSourceTitle(title);
    const fileName = decodeURIComponent(parsedUrl.pathname.split("/").pop() ?? "");
    const language = /^H/i.test(fileName) || /hindi|[\u0900-\u097f]/i.test(text) ? "hi" : "en";
    sources[language] ??= [];
    const existing = sources[language].find((entry) => entry.url === url);
    if (!existing) {
      sources[language].push({ kind: "pdf", url, title: text });
    } else if (!existing.title && text) {
      existing.title = text;
    }
  }

  const metaPattern = /<meta\b([^>]*)>/gi;
  for (const [, attributes] of html.matchAll(metaPattern)) {
    if (attributeValue(attributes, "name").toLowerCase() === "citation_pdf_url") {
      addPdfSource(attributeValue(attributes, "content"));
    }
  }

  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const [, attributes, body] of html.matchAll(linkPattern)) {
    addPdfSource(attributeValue(attributes, "href"), body);
  }
  return sources;
}

export function extractIndiaCodeMetadata(html = "", sourceUrl = "") {
  const table = extractMetadataTable(html);
  const pdfSources = extractPdfSources(html, sourceUrl || "https://www.indiacode.nic.in");
  const shortTitle =
    table["Short Title"] ??
    [...html.matchAll(/<meta\s+name=["']DC\.title["']\s+content=["']([^"']+)["']/gi)]
      .map(([, title]) => decodeHtml(title))
      .find((title) => !/[\u0900-\u097f]/.test(title));

  const handle = sourceUrl.match(/\/handle\/123456789\/(\d+)/)?.[1];
  const sources = {
    en: [{ kind: "html", url: sourceUrl || (handle ? `https://www.indiacode.nic.in/handle/123456789/${handle}` : "") }]
  };
  for (const [language, entries] of Object.entries(pdfSources)) {
    sources[language] ??= [];
    sources[language].push(...entries);
  }

  return {
    slug: slugify(shortTitle ?? table["Hindi Title"] ?? table["Act ID"] ?? handle ?? "law"),
    handle,
    title: shortTitle ?? table["Hindi Title"] ?? "Untitled law",
    hindiTitle: table["Hindi Title"] ?? table["metadata.dc.title.hindi"],
    actNumber: table["Act Number"],
    actYear: table["Act Year"],
    enactmentDate: table["Enactment Date"],
    ministry: table["Ministry"],
    department: table["Department"],
    longTitle: table["Long Title"],
    enforcementDate: table["Enforcement Date"],
    notification: table["Notification"],
    sourceUrl,
    sources
  };
}

export function extractIndiaCodeSections(html = "") {
  const sections = [];
  const seen = new Set();
  const linkPattern =
    /<a\b[^>]*href=["']?\/show-data\?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, query, body] of html.matchAll(linkPattern)) {
    const params = new URLSearchParams(decodeHtml(query));
    const sectionId = params.get("sectionId");
    const sectionNo = params.get("sectionno");
    const orderNo = Number(params.get("orderno") ?? sections.length + 1);
    if (!sectionId || !sectionNo || seen.has(sectionId)) {
      continue;
    }
    seen.add(sectionId);
    const rawTitle = cleanField(body)
      .replace(/^Section\s+/i, "")
      .replace(new RegExp(`^${sectionNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?\\s*`, "i"), "")
      .trim();
    sections.push({
      sectionId,
      sectionNo,
      orderNo,
      title: rawTitle || `Section ${sectionNo}`,
      content: "",
      footnotes: "",
      query: decodeHtml(query)
    });
  }
  return sections.sort((a, b) => a.orderNo - b.orderNo);
}

export function parseSectionContentJson(payload = {}) {
  return {
    content: stripTagsToText(payload.content ?? ""),
    footnotes: stripTagsToText(payload.footnote ?? "")
  };
}

export function parseActSearchRows(html = "") {
  const rows = [];
  const rowPattern = /<tr>\s*<td[^>]*headers=["']t1["'][^>]*>(.*?)<\/td>\s*<td[^>]*headers=["']t2["'][^>]*>(.*?)<\/td>\s*<td[^>]*headers=["']t3["'][^>]*>(.*?)<\/td>\s*<td[^>]*headers=["']t4["'][^>]*>[\s\S]*?<a\s+href=["']([^"']+)["'][^>]*>/gis;
  for (const [, dateHtml, actNumberHtml, titleHtml, href] of html.matchAll(rowPattern)) {
    const sourceUrl = absolutizeUrl(href, "https://www.indiacode.nic.in");
    const handle = sourceUrl.match(/\/handle\/123456789\/(\d+)/)?.[1];
    const title = cleanField(titleHtml);
    if (!handle || !title) {
      continue;
    }
    rows.push({
      slug: slugify(title),
      handle,
      collectionHandle: "123456789/1362",
      title,
      actNumber: cleanField(actNumberHtml),
      enactmentDate: cleanField(dateHtml),
      sourceUrl: sourceUrl.replace(/\?.*$/, ""),
      sources: {
        en: [
          {
            kind: "html",
            url: sourceUrl.replace(/\?.*$/, "")
          }
        ]
      },
      sections: []
    });
  }
  return rows;
}
export function parseRegionalSourceRows(html = "", language, baseUrl) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const [, rowHtml] of html.matchAll(rowPattern)) {
    if (!/\.pdf/i.test(rowHtml)) {
      continue;
    }
    const pdfMatch = rowHtml.match(/<a\b[^>]*href=["']([^"']+\.pdf[^"']*)["'][^>]*>/i);
    if (!pdfMatch) {
      continue;
    }
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => cleanField(cell));
    const title = cells.find((cell) => /[A-Za-z\u0900-\u0D7F]/.test(cell) && !/download/i.test(cell));
    if (!title) {
      continue;
    }
    rows.push({
      language,
      title,
      kind: "pdf",
      url: absolutizeUrl(pdfMatch[1], baseUrl),
      source: baseUrl
    });
  }
  return rows;
}
