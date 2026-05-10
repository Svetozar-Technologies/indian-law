import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  displayTitleForLanguage,
  languageCoverageForCatalog,
  lawsForLanguage,
  statusClassForLanguage,
  textStatusForLanguage
} from "./catalog-status.mjs";
import { readLino } from "../scripts/lib/lino-codec.mjs";

const ASSET_BASE = typeof window === "undefined" ? "" : window.__INDIAN_LAW_ASSET_BASE__ ?? "";

function assetUrl(relativePath) {
  return `${ASSET_BASE}${relativePath}`;
}

function App() {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    let cancelled = false;
    fetch(assetUrl("data/catalog.lino"))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Catalog request failed with ${response.status}`);
        }
        return response.text();
      })
      .then((notation) => {
        if (!cancelled) {
          setCatalog(readLino(notation));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCatalogError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (catalogError) {
    return <Shell><div className="notice error">Unable to load catalog: {catalogError}</div></Shell>;
  }

  if (!catalog) {
    return <Shell><main className="loading-shell">Loading Indian Law</main></Shell>;
  }

  return <LawViewer catalog={catalog} route={route} />;
}

function LawViewer({ catalog, route }) {
  const preferredLanguage = useMemo(() => detectPreferredLanguage(catalog), [catalog]);
  const resolved = resolveRoute(catalog, route, preferredLanguage);

  return (
    <Shell>
      <header className="topbar">
        <a className="brand" href="#">Indian Law</a>
        <nav className="topnav" aria-label="Primary">
          <a href="#">Laws</a>
          <a href="https://github.com/Svetozar-Technologies/indian-law">Repository</a>
          <a href="https://github.com/Svetozar-Technologies/indian-law/blob/main/LEGAL.md">Legal</a>
        </nav>
      </header>
      <main className="app-shell">
        {resolved.page === "document" ? (
          <DocumentView catalog={catalog} resolved={resolved} />
        ) : (
          <HomeView catalog={catalog} selectedLanguage={resolved.language} />
        )}
      </main>
    </Shell>
  );
}

function HomeView({ catalog, selectedLanguage }) {
  const language = languageByCode(catalog, selectedLanguage) ?? languageByCode(catalog, catalog.defaultLanguage);
  const languageCode = language?.code ?? catalog.defaultLanguage;
  const visibleLaws = useMemo(() => lawsForLanguage(catalog, languageCode), [catalog, languageCode]);
  const { ready: readyCount, total: totalCount } = languageCoverageForCatalog(catalog, languageCode);
  const lawMetric = readyCount === totalCount ? String(totalCount) : `${readyCount}/${totalCount}`;

  return (
    <>
      <section className="intro">
        <div>
          <p className="kicker">Official-source copy</p>
          <h1>Active Indian laws catalog</h1>
          <p className="summary">
            A catalog viewer of Indian laws from official public sources.
          </p>
        </div>
        <aside className="source-panel" aria-label="Source summary">
          <span className="metric">{lawMetric}</span>
          <span className="metric-label">laws</span>
        </aside>
      </section>

      <section className="language-grid" aria-label="Languages">
        {catalog.languages.map((entry) => {
          const hasLaws = lawsForLanguage(catalog, entry.code).length > 0;
          if (!hasLaws) {
            return (
              <span className="language-link disabled" key={entry.code} lang={entry.code}>
                <span>{entry.name}</span>
                <small>{entry.nativeName}</small>
              </span>
            );
          }
          return (
            <a
              className={`language-link${entry.code === selectedLanguage ? " active" : ""}`}
              href={`#/${entry.code}`}
              key={entry.code}
              lang={entry.code}
            >
              <span>{entry.name}</span>
              <small>{entry.nativeName}</small>
            </a>
          );
        })}
      </section>

      <section className="table-section">
        <div className="section-heading">
          <h2>Law List</h2>
          <a className="data-note" href={assetUrl("data/catalog.lino")} download="catalog.lino">
            Catalog source: Links Notation
          </a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Title</th><th>Year</th><th>Act</th><th>Text</th><th>Source</th></tr>
            </thead>
            <tbody>
              {visibleLaws.map((law) => {
                const languageRecord = law.languages[languageCode] ?? null;
                const canOpen = Boolean(languageRecord?.enabled);
                const title = displayTitleForLanguage(law, languageCode, catalog.defaultLanguage);
                return (
                  <tr key={law.slug}>
                    <td>
                      {canOpen ? (
                        <a href={documentHash(languageCode, law.slug, languageRecord.parts[0]?.file)}>
                          {title}
                        </a>
                      ) : (
                        title
                      )}
                    </td>
                    <td>{law.actYear}</td>
                    <td>{law.actNumber}</td>
                    <td>
                      <span className={`status ${statusClassForLanguage(languageRecord)}`}>
                        {textStatusForLanguage(languageRecord, languageCode)}
                      </span>
                    </td>
                    <td><SourceLinks sources={sourcesForLanguage(law, languageCode)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DocumentView({ catalog, resolved }) {
  const { law, language, part } = resolved;
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const showDefaultLanguageDetails = language.code === catalog.defaultLanguage;

  useEffect(() => {
    let cancelled = false;
    setMarkdown("");
    setError("");
    fetch(assetUrl(`laws/${language.code}/${law.slug}/${part.file}`))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Markdown request failed with ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setMarkdown(text);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language.code, law.slug, part.file]);

  const languageRecord = law.languages[language.code];
  const title = displayTitleForLanguage(law, language.code, catalog.defaultLanguage);

  return (
    <>
      <article className="law-heading">
        <div>
          <p className="kicker">{language.name}</p>
          <h1>{title}</h1>
          {showDefaultLanguageDetails && law.longTitle ? <p>{law.longTitle}</p> : null}
        </div>
        <dl>
          <div><dt>Act</dt><dd>{law.actNumber} of {law.actYear}</dd></div>
          <div><dt>Enacted</dt><dd>{law.enactmentDate}</dd></div>
          {showDefaultLanguageDetails && law.ministry ? <div><dt>Ministry</dt><dd>{law.ministry}</dd></div> : null}
        </dl>
      </article>

      <section className="viewer-grid">
        <aside className="side-panel" aria-label="Law navigation">
          <h2>Languages</h2>
          <div className="language-switcher">
            {catalog.languages.map((entry) => {
              const record = law.languages[entry.code];
              const enabled = Boolean(record?.enabled);
              return enabled ? (
                <a
                  className={entry.code === language.code ? "active" : ""}
                  href={documentHash(entry.code, law.slug, record.parts[0]?.file)}
                  key={entry.code}
                >
                  {entry.nativeName}
                </a>
              ) : (
                <span className="disabled-choice" key={entry.code}>{entry.nativeName}</span>
              );
            })}
          </div>
          <h2>Parts</h2>
          <div className="part-list">
            {languageRecord.parts.map((entry) => (
              <a
                className={entry.file === part.file ? "active" : ""}
                href={documentHash(language.code, law.slug, entry.file)}
                key={entry.file}
              >
                <span>{entry.title}</span>
                <small>Sections {entry.firstSection} to {entry.lastSection}</small>
              </a>
            ))}
          </div>
          <h2>Official Sources</h2>
          <SourceLinks sources={sourcesForLanguage(law, language.code)} />
        </aside>

        <article className="law-document">
          <nav className="document-nav">
            <a href={`#/${language.code}`}>All laws</a>
            <span>{part.title}</span>
            <a href={assetUrl(`laws/${language.code}/${law.slug}/${part.file}`)}>Markdown source</a>
          </nav>
          {error ? <p className="notice error">{error}</p> : markdown ? renderMarkdown(markdown) : <p className="notice">Loading Markdown</p>}
        </article>
      </section>
    </>
  );
}

function SourceLinks({ sources }) {
  if (!sources.length) {
    return <span className="muted">Pending discovery</span>;
  }
  return (
    <ul className="source-links">
      {sources.map((source) => (
        <li key={`${source.kind}-${source.url}`}>
          <a href={source.url}>{source.kind}</a>
        </li>
      ))}
    </ul>
  );
}

function renderMarkdown(markdown) {
  return <div className="markdown-body">{markdownToBlocks(markdown)}</div>;
}

function markdownToBlocks(markdown) {
  const lines = stripFrontMatter(markdown.split(/\r?\n/));
  const blocks = [];
  let paragraph = [];
  let list = [];

  function closeParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  function closeList() {
    if (list.length) {
      blocks.push({ type: "ul", items: list });
      list = [];
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
      continue;
    }
    if (line.startsWith("> ")) {
      closeParagraph();
      closeList();
      blocks.push({ type: "blockquote", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("- ")) {
      closeParagraph();
      list.push(line.slice(2));
      continue;
    }
    paragraph.push(line);
  }
  closeParagraph();
  closeList();

  return blocks.map((block, index) => {
    if (block.type === "h1") return <h1 key={index}>{block.text}</h1>;
    if (block.type === "h2") return <h2 key={index}>{block.text}</h2>;
    if (block.type === "h3") return <h3 key={index}>{block.text}</h3>;
    if (block.type === "blockquote") return <blockquote key={index}>{block.text}</blockquote>;
    if (block.type === "ul") {
      return <ul key={index}>{block.items.map((item) => <li key={item}>{linkifyText(item)}</li>)}</ul>;
    }
    return <p key={index}>{linkifyText(block.text)}</p>;
  });
}

function stripFrontMatter(lines) {
  if (lines[0] !== "---") {
    return lines;
  }
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  return end === -1 ? lines : lines.slice(end + 1);
}

function linkifyText(text) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? <a href={part} key={`${part}-${index}`}>{part}</a> : part
  );
}

function resolveRoute(catalog, route, preferredLanguage) {
  if (route.page !== "document") {
    const routeLanguage = languageByCode(catalog, route.language) ? route.language : "";
    return { page: "home", language: routeLanguage || preferredLanguage };
  }

  const law = catalog.laws.find((entry) => entry.slug === route.slug) ?? firstReadableLaw(catalog);
  if (!law) {
    return { page: "home", language: preferredLanguage };
  }

  const requestedLanguage = route.language || preferredLanguage;
  const availableLanguageCode = languageForLaw(law, requestedLanguage, catalog.defaultLanguage);
  if (!availableLanguageCode) {
    const routeLanguage = languageByCode(catalog, requestedLanguage) ? requestedLanguage : "";
    return { page: "home", language: routeLanguage || preferredLanguage };
  }

  const language = languageByCode(catalog, availableLanguageCode);
  const languageRecord = law.languages[availableLanguageCode];
  const part = languageRecord.parts.find((entry) => entry.file === route.part) ?? languageRecord.parts[0];
  return {
    page: "document",
    law,
    language,
    part
  };
}

function firstReadableLaw(catalog) {
  return catalog.laws.find((law) => languageForLaw(law, catalog.defaultLanguage, catalog.defaultLanguage));
}

function languageForLaw(law, requestedLanguage, defaultLanguage) {
  if (law.languages[requestedLanguage]?.enabled) {
    return requestedLanguage;
  }
  return "";
}

function sourcesForLanguage(law, requestedLanguage) {
  return law.languages[requestedLanguage]?.sources ?? [];
}

function languageByCode(catalog, code) {
  return catalog.languages.find((language) => language.code === code);
}

function detectPreferredLanguage(catalog) {
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
  const availableCodes = new Set(catalog.languages.map((language) => language.code));
  for (const tag of browserLanguages) {
    const code = tag.toLowerCase().split("-")[0];
    if (availableCodes.has(code)) {
      return code;
    }
  }
  return catalog.defaultLanguage;
}

function readRoute() {
  const segments = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (segments[0] === "laws") {
    return {
      page: "document",
      language: segments[1],
      slug: segments[2],
      part: segments[3]
    };
  }
  return {
    page: "home",
    language: segments[0] || ""
  };
}

function documentHash(language, slug, part) {
  return `#/laws/${language}/${slug}/${part ?? ""}`;
}

function Shell({ children }) {
  return children;
}

createRoot(document.getElementById("root")).render(<App />);
