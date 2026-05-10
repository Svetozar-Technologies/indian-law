import assert from "node:assert/strict";
import test from "node:test";

import {
  sourceStatusForLaw,
  statusClassForLanguage,
  textStatusForLanguage
} from "../src/catalog-status.mjs";

test("labels enabled language records as Markdown", () => {
  const record = { enabled: true, parts: [{ file: "part-001.md" }], sources: [] };

  assert.equal(textStatusForLanguage(record, "en"), "EN Markdown");
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

test("falls back to a known source language when requested text is not ready", () => {
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
    code: "en",
    record: law.languages.en
  });
});
