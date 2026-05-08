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
    "docs/data/catalog.lino",
    "docs/case-studies/issue-1/data/issue-1.lino"
  ];

  for (const filePath of paths) {
    const notation = await readFile(filePath, "utf8");
    assert.ok(parser.parse(notation).length > 0, `${filePath} should parse as Links Notation`);
    assert.match(notation, /^obj_root:\n  object\n/, `${filePath} should use indented object notation`);
    assert.doesNotMatch(notation, /\(str ZGVmYXVsdExhbmd1YWdl\)/, `${filePath} should not base64-encode keys`);
    assert.doesNotMatch(notation, /\(str dGl0bGU=\)/, `${filePath} should not base64-encode keys`);
  }

  const languages = await readDataFile("data/languages.lino");
  const manifest = await readDataFile("data/laws.seed.lino");
  assert.equal(languages.defaultLanguage, "en");
  assert.equal(manifest.laws[0].handle, "1367");
  assert.equal(manifest.laws[0].sections[0].sectionNo, "1");
});

test("Lino codec stores strings unencoded and preserves numeric-looking identifiers", () => {
  const notation = writeLino({ handle: "1367", actYear: "1957", sectionNo: "1" });
  const parsed = parser.parse(notation);
  const decoded = readLino(notation);
  assert.equal(parsed.length, 1);
  assert.match(notation, /^obj_root:\n  object\n/);
  assert.match(notation, /\n  \(str handle\) \(str 1367\)/);
  assert.doesNotMatch(notation, /MTM2Nw==/);
  assert.deepEqual(decoded, { handle: "1367", actYear: "1957", sectionNo: "1" });
});

test("Lino codec keeps multilingual and multiline strings readable", () => {
  const value = {
    title: "प्रतिलिप्‍यधिकार अधिनियम, 1957",
    body: "Line one\nLine two with `code` and apostrophe's mark",
    empty: ""
  };
  const notation = writeLino(value);
  assert.match(notation, /प्रतिलिप्‍यधिकार अधिनियम/);
  assert.match(notation, /Line one\nLine two/);
  assert.match(notation, /\(str empty\) \(str \)/);
  assert.deepEqual(readLino(notation), value);
});

test("Lino writer uses indented definitions for nested data", () => {
  const notation = writeLino({
    defaultLanguage: "en",
    languages: [{ code: "en", enabled: true }],
    empty: null
  });
  assert.match(notation, /^obj_root:\n  object\n/);
  assert.match(notation, /\nobj_root_languages:\n  array\n  obj_root_languages_en\n/);
  assert.match(notation, /\nobj_root_languages_en:\n  object\n/);
  assert.doesNotMatch(notation.split("\n")[0], /^\(object /);
  assert.deepEqual(readLino(notation), {
    defaultLanguage: "en",
    languages: [{ code: "en", enabled: true }],
    empty: null
  });
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
