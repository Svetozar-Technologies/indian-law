import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("offline site build creates language indexes and markdown parts", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-site-"));
  try {
    await execFileAsync("node", ["scripts/build-site.mjs", "--offline", "--output", output]);
    const home = await readFile(path.join(output, "index.html"), "utf8");
    const englishIndex = await readFile(path.join(output, "laws/en/index.html"), "utf8");
    const markdown = await readFile(path.join(output, "laws/en/copyright-act-1957/part-001.md"), "utf8");

    assert.match(home, /Indian Law/);
    assert.match(englishIndex, /The Copyright Act, 1957/);
    assert.match(markdown, /## Section 1 - Short title/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
