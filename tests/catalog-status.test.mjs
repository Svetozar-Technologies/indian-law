import assert from "node:assert/strict";
import test from "node:test";

import {
  displayTitleForLanguage,
  languageCoverageForCatalog,
  lawsForLanguage,
  sourceStatusForLaw,
  statusClassForLanguage,
  textStatusForLanguage
} from "../src/catalog-status.mjs";

test("labels enabled language records as Markdown", () => {
  const record = { enabled: true, parts: [{ file: "part-001.md" }], sources: [] };

  assert.equal(textStatusForLanguage(record, "en"), "Markdown");
  assert.equal(statusClassForLanguage(record), "ready");
});

test("labels known official sources without Markdown as pending", () => {
  const sourceOnly = {
    enabled: false,
    status: "source-only",
    sources: [{ kind: "html", url: "https://www.indiacode.nic.in/handle/123456789/2113" }]
  };
  const sourceInferred = {
    enabled: false,
    sources: [{ kind: "pdf", url: "https://www.indiacode.nic.in/bitstream/123456789/2113/1/201320.pdf" }]
  };

  assert.equal(textStatusForLanguage(sourceOnly, "en"), "Pending");
  assert.equal(statusClassForLanguage(sourceOnly), "pending");
  assert.equal(textStatusForLanguage(sourceInferred, "en"), "Pending");
  assert.equal(statusClassForLanguage(sourceInferred), "pending");
});

test("labels languages with no known source as unavailable", () => {
  const record = { enabled: false, status: "unavailable", sources: [] };

  assert.equal(textStatusForLanguage(record, "hi"), "Unavailable");
  assert.equal(statusClassForLanguage(record), "disabled");
});

test("does not fall back to another language when requested text is not ready", () => {
  const law = {
    languages: {
      hi: { enabled: false, status: "unavailable", sources: [] },
      en: {
        enabled: false,
        status: "source-only",
        sources: [{ kind: "html", url: "https://www.indiacode.nic.in/handle/123456789/2113" }]
      }
    }
  };

  assert.deepEqual(sourceStatusForLaw(law, "hi", "en"), {
    code: "hi",
    record: law.languages.hi
  });
});

test("filters catalog rows to laws with selected-language text or sources", () => {
  const catalog = {
    laws: [
      {
        slug: "hindi-markdown-act",
        languages: {
          hi: { enabled: true, status: "markdown", sources: [] },
          en: { enabled: true, status: "markdown", sources: [] }
        }
      },
      {
        slug: "hindi-source-only-act",
        languages: {
          hi: { enabled: false, status: "source-only", sources: [{ kind: "pdf", url: "https://example.test/hi.pdf" }] },
          en: { enabled: true, status: "markdown", sources: [] }
        }
      },
      {
        slug: "english-only-act",
        languages: {
          hi: { enabled: false, status: "unavailable", sources: [] },
          en: { enabled: true, status: "markdown", sources: [] }
        }
      }
    ]
  };

  assert.deepEqual(lawsForLanguage(catalog, "hi").map((law) => law.slug), [
    "hindi-markdown-act",
    "hindi-source-only-act"
  ]);
  assert.deepEqual(languageCoverageForCatalog(catalog, "hi"), {
    ready: 1,
    total: 2
  });
});

test("does not use default-language law titles for non-default language rows", () => {
  const law = {
    title: "The English Only Act, 2026",
    actNumber: "7",
    actYear: "2026",
    localizedTitles: {},
    languages: {
      hi: {
        enabled: false,
        status: "source-only",
        sources: [{ kind: "pdf", url: "https://example.test/hi.pdf", title: "null" }]
      }
    }
  };

  assert.equal(displayTitleForLanguage(law, "en", "en"), "The English Only Act, 2026");
  assert.equal(displayTitleForLanguage(law, "hi", "en"), "Act 7 of 2026");

  law.localizedTitles.hi = "हिन्दी अधिनियम, 2026";
  assert.equal(displayTitleForLanguage(law, "hi", "en"), "हिन्दी अधिनियम, 2026");
});
