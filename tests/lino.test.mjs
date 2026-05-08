import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import { Parser } from "links-notation";

import { readDataFile, readLino, writeLino } from "../scripts/lib/lino.mjs";

const parser = new Parser();

test("repository-owned seed metadata is stored as Links Notation", async () => {
  const paths = [
    "data/languages.lino",
    "data/laws.seed.lino",
    "data/regional-sources.seed.lino",
    "docs/case-studies/issue-1/data/issue-1.lino"
  ];

  for (const filePath of paths) {
    const notation = await readFile(filePath, "utf8");
    assert.ok(parser.parse(notation).length > 0, `${filePath} should parse as Links Notation`);
  }

  const languages = await readDataFile("data/languages.lino");
  const manifest = await readDataFile("data/laws.seed.lino");
  assert.equal(languages.defaultLanguage, "en");
  assert.equal(manifest.laws[0].handle, "1367");
  assert.equal(manifest.laws[0].sections[0].sectionNo, "1");
});

test("Lino codec preserves string identifiers that look numeric", () => {
  const notation = writeLino({ handle: "1367", actYear: "1957", sectionNo: "1" });
  const parsed = parser.parse(notation);
  const decoded = readLino(notation);
  assert.equal(parsed.length, 1);
  assert.deepEqual(decoded, { handle: "1367", actYear: "1957", sectionNo: "1" });
});

test("owned data directories do not store JSON metadata", async () => {
  const files = await listFiles(["data", "docs/data", "docs/case-studies/issue-1/data"]);
  assert.deepEqual(files.filter((filePath) => filePath.endsWith(".json")), []);
});

async function listFiles(roots) {
  const files = [];
  for (const root of roots) {
    await walk(root, files);
  }
  return files;
}

async function walk(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(filePath, files);
    } else {
      files.push(filePath);
    }
  }
}
