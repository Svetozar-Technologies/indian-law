import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("fetch site build reuses fresh cached law data instead of redownloading", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-cache-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");
  const missingSourceUrl = "http://127.0.0.1:9/missing";

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: [missingSourceUrl],
          lastVerified: "2026-05-08",
          laws: [
            {
              slug: "cached-act",
              title: "Cached Act",
              sourceUrl: missingSourceUrl,
              sources: { en: [{ kind: "html", url: missingSourceUrl }] },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-08", sources: [] })}\n`);
    await writeFile(
      path.join(cacheDir, "cached-act.json"),
      `${JSON.stringify(
        {
          fetchedAt: "2099-01-01T00:00:00.000Z",
          sourceUrl: missingSourceUrl,
          completeFetch: true,
          law: {
            slug: "cached-act",
            title: "Cached Act",
            sourceUrl: missingSourceUrl,
            sources: { en: [{ kind: "html", url: missingSourceUrl }] },
            sections: [
              {
                sectionId: "1",
                sectionNo: "1",
                orderNo: 1,
                title: "Cached section",
                content: "Cached body from a previous refresh.",
                footnotes: ""
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );

    await execFileAsync("node", [
      "scripts/build-site.mjs",
      "--fetch",
      "--manifest",
      manifest,
      "--regional-sources",
      regionalSources,
      "--cache-dir",
      cacheDir,
      "--cache-ttl-days",
      "30",
      "--output",
      output,
      "--delay-ms",
      "0"
    ]);

    const markdown = await readFile(path.join(output, "laws/en/cached-act/part-001.md"), "utf8");
    assert.match(markdown, /Cached body from a previous refresh/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build writes partial output when the runtime budget is exhausted", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-checkpoint-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: ["https://example.test"],
          lastVerified: "2026-05-08",
          laws: [
            {
              slug: "pending-act",
              title: "Pending Act",
              sourceUrl: "http://127.0.0.1:9/pending",
              sources: { en: [{ kind: "html", url: "http://127.0.0.1:9/pending" }] },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-08", sources: [] })}\n`);

    await assert.rejects(
      execFileAsync("node", [
        "scripts/build-site.mjs",
        "--fetch",
        "--manifest",
        manifest,
        "--regional-sources",
        regionalSources,
        "--cache-dir",
        cacheDir,
        "--max-runtime-ms",
        "0",
        "--output",
        output,
        "--delay-ms",
        "0"
      ]),
      (error) => {
        assert.equal(error.code, 75);
        assert.match(error.stderr, /Runtime checkpoint reached/);
        return true;
      }
    );

    const catalog = await readDataFile(path.join(output, "data/catalog.lino"));
    assert.equal(catalog.laws.length, 1);
    assert.equal(catalog.laws[0].languages.en.enabled, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
