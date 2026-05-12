import assert from "node:assert/strict";
import test from "node:test";

import {
  countLines,
  renderMarkdownPart,
  sectionMarkdown,
  splitSectionsIntoParts
} from "../scripts/lib/markdown.mjs";

test("renders a section with content and footnotes", () => {
  const markdown = sectionMarkdown({
    sectionNo: "1",
    title: "Short title",
    content: "Body",
    footnotes: "1. Footnote"
  });
  assert.match(markdown, /^## Section 1 - Short title/);
  assert.match(markdown, /### Footnotes/);
});

test("splits only between sections and keeps each part under the requested line budget when possible", () => {
  const sections = Array.from({ length: 5 }, (_, index) => ({
    sectionNo: String(index + 1),
    title: `Section ${index + 1}`,
    content: ["line 1", "line 2", "line 3", "line 4"].join("\n"),
    footnotes: ""
  }));
  const parts = splitSectionsIntoParts(sections, { maxLines: 14 });
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.flat().map((section) => section.sectionNo),
    ["1", "2", "3", "4", "5"]
  );
  for (const part of parts) {
    assert.ok(countLines(part.map((section) => sectionMarkdown(section)).join("\n\n")) <= 14);
  }
});

test("renders Markdown part metadata and source links", () => {
  const markdown = renderMarkdownPart({
    law: {
      title: "Example Act",
      sourceUrl: "https://example.test/act",
      sources: {
        en: [{ kind: "html", url: "https://example.test/act" }]
      }
    },
    language: { code: "en", name: "English" },
    partIndex: 0,
    partCount: 1,
    sections: [{ sectionNo: "1", title: "Start", content: "Text", footnotes: "" }]
  });
  assert.match(markdown, /line_limit: 1500/);
  assert.match(markdown, /https:\/\/example\.test\/act/);
  assert.match(markdown, /## Section 1 - Start/);
});

test("renders localized PDF pages with language-specific title and sources", () => {
  const markdown = renderMarkdownPart({
    law: {
      title: "Example Act",
      sourceUrl: "https://example.test/english",
      sources: {
        en: [{ kind: "html", url: "https://example.test/english" }],
        hi: [{ kind: "pdf", url: "https://example.test/hindi.pdf" }]
      },
      translations: {
        hi: {
          title: "उदाहरण अधिनियम"
        }
      }
    },
    language: { code: "hi", name: "Hindi" },
    partIndex: 0,
    partCount: 1,
    sections: [{ kind: "page", sectionNo: "1", title: "Page 1", content: "भारतीय पाठ", footnotes: "" }]
  });

  assert.match(markdown, /title: "उदाहरण अधिनियम"/);
  assert.match(markdown, /^# उदाहरण अधिनियम/m);
  assert.match(markdown, /source: "https:\/\/example\.test\/hindi\.pdf"/);
  assert.match(markdown, /Pages: 1 to 1/);
  assert.match(markdown, /## Page 1/);
  assert.match(markdown, /- html: https:\/\/example\.test\/english/);
  assert.match(markdown, /- pdf: https:\/\/example\.test\/hindi\.pdf/);
});

test("does not fall back to English titles for localized Markdown without a usable title", () => {
  const markdown = renderMarkdownPart({
    law: {
      title: "The English Title Act, 2026",
      actNumber: "7",
      actYear: "2026",
      sourceUrl: "https://example.test/english",
      sources: {
        en: [{ kind: "html", url: "https://example.test/english" }],
        hi: [{ kind: "pdf", url: "https://example.test/hindi.pdf", title: "null" }]
      },
      translations: {
        hi: {
          title: "null"
        }
      }
    },
    language: { code: "hi", name: "Hindi" },
    partIndex: 0,
    partCount: 1,
    sections: [{ kind: "page", sectionNo: "1", title: "Page 1", content: "भारतीय पाठ", footnotes: "" }]
  });

  assert.match(markdown, /title: "Act 7 of 2026"/);
  assert.match(markdown, /^# Act 7 of 2026/m);
  assert.doesNotMatch(markdown, /The English Title Act/);
  assert.doesNotMatch(markdown, /^# null/m);
});
