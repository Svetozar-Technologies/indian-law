import { lawPartFileName } from "./markdown.mjs";

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pageShell({ title, body, rootPath = "." }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${rootPath}/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${rootPath}/site.css">
  <script src="${rootPath}/site.js" defer></script>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${rootPath}/index.html">Indian Law</a>
    <nav class="topnav" aria-label="Primary">
      <a href="${rootPath}/laws/en/index.html">Laws</a>
      <a href="https://github.com/Svetozar-Technologies/indian-law">Repository</a>
      <a href="https://github.com/Svetozar-Technologies/indian-law/blob/main/LEGAL.md">Legal</a>
    </nav>
  </header>
  <main>
${body}
  </main>
</body>
</html>
`;
}

export function renderHome({ languages, laws, defaultLanguage }) {
  const languageLinks = languages
    .map(
      (language) =>
        `<a class="language-link" data-language="${language.code}" href="laws/${language.code}/index.html"><span>${escapeHtml(language.name)}</span><small>${escapeHtml(language.nativeName)}</small></a>`
    )
    .join("\n");
  const lawRows = laws
    .map(
      (law) => `<tr>
        <td><a href="laws/${defaultLanguage}/${law.slug}/index.html">${escapeHtml(law.title)}</a></td>
        <td>${escapeHtml(law.actYear ?? "")}</td>
        <td>${escapeHtml(law.actNumber ?? "")}</td>
        <td>${escapeHtml(law.ministry ?? "")}</td>
      </tr>`
    )
    .join("\n");

  return pageShell({
    title: "Indian Law",
    rootPath: ".",
    body: `    <section class="intro">
      <div>
        <p class="kicker">Prototype public-law mirror</p>
        <h1>Active Indian laws from official public sources</h1>
        <p class="summary">Official source records and readable Markdown parts for seeded Central Acts.</p>
      </div>
      <aside class="source-panel" aria-label="Source summary">
        <span class="metric">${laws.length}</span>
        <span class="metric-label">seeded laws</span>
        <a href="https://www.indiacode.nic.in/">India Code</a>
      </aside>
    </section>
    <section class="language-grid" aria-label="Languages">
${languageLinks}
    </section>
    <section class="table-section">
      <div class="section-heading">
        <h2>Law List</h2>
        <a class="button-link" id="preferred-language-link" href="laws/${defaultLanguage}/index.html">Open preferred language</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Title</th><th>Year</th><th>Act</th><th>Ministry</th></tr>
          </thead>
          <tbody>
${lawRows}
          </tbody>
        </table>
      </div>
    </section>`
  });
}

export function renderLanguageIndex({ language, languages, laws }) {
  const rows = laws
    .map((law) => {
      const sources = law.sources?.[language.code] ?? [];
      const hasSections = language.code === "en" && law.sections?.length > 0;
      const status = hasSections ? "Markdown text" : sources.length > 0 ? "Official source" : "Not verified";
      const sourceLinks = sources
        .map((source) => `<a href="${escapeHtml(source.url)}">${escapeHtml(source.kind)}</a>`)
        .join(" ");
      return `<tr>
        <td><a href="${law.slug}/index.html">${escapeHtml(localizedLawTitle(law, language.code))}</a></td>
        <td><span class="status">${escapeHtml(status)}</span></td>
        <td>${sourceLinks || "Pending discovery"}</td>
      </tr>`;
    })
    .join("\n");
  const switcher = languages
    .map((entry) => `<a href="../${entry.code}/index.html">${escapeHtml(entry.nativeName)}</a>`)
    .join("");

  return pageShell({
    title: `${language.name} Laws`,
    rootPath: "../..",
    body: `    <section class="compact-heading">
      <p class="kicker">${escapeHtml(language.nativeName)}</p>
      <h1>${escapeHtml(language.name)} law sources</h1>
      <div class="language-switcher">${switcher}</div>
    </section>
    <section class="table-section">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Law</th><th>Status</th><th>Official sources</th></tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>
    </section>`
  });
}

export function renderLawIndex({ law, language, parts }) {
  const sourceRows = Object.entries(law.sources ?? {})
    .flatMap(([code, sources]) =>
      sources.map(
        (source) =>
          `<li><span>${escapeHtml(code)}</span><a href="${escapeHtml(source.url)}">${escapeHtml(source.kind)}</a></li>`
      )
    )
    .join("");
  const partLinks = parts.length
    ? parts
        .map(
          (_part, index) =>
            `<a class="part-link" href="${lawPartFileName(index)}.html">Part ${index + 1}<small>Markdown: ${lawPartFileName(index)}.md</small></a>`
        )
        .join("")
    : `<p class="empty-state">No Markdown text is available for this language in the offline seed. The refresh workflow records official source files and regenerates this page when text extraction is available.</p>`;

  return pageShell({
    title: localizedLawTitle(law, language.code),
    rootPath: "../../..",
    body: `    <article class="law-heading">
      <p class="kicker">${escapeHtml(language.name)}</p>
      <h1>${escapeHtml(localizedLawTitle(law, language.code))}</h1>
      <dl>
        <div><dt>Act</dt><dd>${escapeHtml(law.actNumber ?? "")} of ${escapeHtml(law.actYear ?? "")}</dd></div>
        <div><dt>Enacted</dt><dd>${escapeHtml(law.enactmentDate ?? "")}</dd></div>
        <div><dt>Ministry</dt><dd>${escapeHtml(law.ministry ?? "")}</dd></div>
      </dl>
      <p>${escapeHtml(law.longTitle ?? "")}</p>
    </article>
    <section class="parts">
      <h2>Readable Parts</h2>
      <div class="part-grid">${partLinks}</div>
    </section>
    <section class="sources">
      <h2>Official Sources</h2>
      <ul>${sourceRows}</ul>
    </section>`
  });
}

export function renderPartHtml({ law, language, markdown, partIndex, partCount }) {
  const html = markdownToHtml(markdown);
  return pageShell({
    title: `${localizedLawTitle(law, language.code)} - Part ${partIndex + 1}`,
    rootPath: "../../..",
    body: `    <article class="law-document">
      <nav class="document-nav">
        <a href="index.html">All parts</a>
        <span>Part ${partIndex + 1} of ${partCount}</span>
        <a href="${lawPartFileName(partIndex)}.md">Markdown source</a>
      </nav>
${html}
    </article>`
  });
}

function localizedLawTitle(law, languageCode) {
  if (languageCode === "hi" && law.hindiTitle) {
    return law.hindiTitle;
  }
  return law.title;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listOpen = false;
  let paragraph = [];

  function closeParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  }

  for (const line of lines) {
    if (/^---$/.test(line) || /^[a-z_]+:/.test(line)) {
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeParagraph();
      closeList();
      html.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`);
      continue;
    }
    if (line.startsWith("- ")) {
      closeParagraph();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`);
      continue;
    }
    paragraph.push(linkify(escapeHtml(line)));
  }
  closeParagraph();
  closeList();
  return html.join("\n");
}

function linkify(value) {
  return value.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url.replace(/"/g, "&quot;")}">${url}</a>`
  );
}
