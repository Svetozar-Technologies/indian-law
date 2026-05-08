import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

import { readDataFile } from "../scripts/lib/lino.mjs";

const execFileAsync = promisify(execFile);

test("offline site build creates a React entry, Lino catalog, and markdown parts", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-site-"));
  try {
    await execFileAsync("node", ["scripts/build-site.mjs", "--offline", "--output", output]);
    const home = await readFile(path.join(output, "index.html"), "utf8");
    const bundle = await readFile(path.join(output, "assets/app.js"), "utf8");
    const catalog = await readDataFile(path.join(output, "data/catalog.lino"));
    const markdown = await readFile(path.join(output, "laws/en/copyright-act-1957/part-001.md"), "utf8");

    assert.match(home, /Indian Law/);
    assert.match(home, /assets\/app\.js/);
    assert.match(bundle, /createRoot/);
    assert.equal(catalog.defaultLanguage, "en");
    assert.equal(catalog.laws[0].languages.en.enabled, true);
    assert.equal(catalog.laws[0].languages.hi.enabled, false);
    assert.equal(catalog.laws[0].languages.hi.status, "source-only");
    assert.match(markdown, /## Section 1 - Short title/);
    await assert.rejects(readFile(path.join(output, "laws/en/index.html"), "utf8"));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
