import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";

import { readDataFile, writeDataFile } from "../scripts/lib/lino.mjs";

const execFileAsync = promisify(execFile);

test("offline site build creates a React entry, Lino catalog, and markdown parts", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-site-"));
  try {
    const { stderr } = await execFileAsync("node", ["scripts/build-site.mjs", "--offline", "--output", output]);
    const home = await readFile(path.join(output, "index.html"), "utf8");
    const pathAliasHome = await readFile(path.join(output, "indian-law", "index.html"), "utf8");
    const bundle = await readFile(path.join(output, "assets/app.js"), "utf8");
    const catalog = await readDataFile(path.join(output, "data/catalog.lino"));
    const markdown = await readFile(path.join(output, "laws/en/copyright-act-1957/part-001.md"), "utf8");

    assert.match(stderr, /\[build-site\].*Starting site build/);
    assert.match(stderr, /\[build-site\].*Selected 4 law/);
    assert.match(stderr, /\[build-site\].*Writing site output/);
    assert.match(home, /Indian Law/);
    assert.match(home, /assets\/app\.js/);
    assert.match(pathAliasHome, /window\.__INDIAN_LAW_ASSET_BASE__ = "\.\.\/"/);
    assert.match(pathAliasHome, /\.\.\/assets\/app\.js/);
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
    await writeDataFile(path.join(cacheDir, "cached-act.lino"), {
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
    });

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
    await assert.rejects(readFile(path.join(cacheDir, "cached-act.json"), "utf8"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build converts cached Hindi PDF source into Markdown", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-hindi-pdf-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");
  const pdfBody = await readFile("docs/case-studies/issue-17/h198868.pdf");
  let pdfRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/law") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body>cached law page should not be needed</body></html>");
      return;
    }

    if (request.url === "/hindi.pdf") {
      pdfRequests += 1;
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(pdfBody);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const sourceUrl = `http://127.0.0.1:${port}/law`;
    const hindiPdfUrl = `http://127.0.0.1:${port}/hindi.pdf`;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: [sourceUrl],
          lastVerified: "2026-05-10",
          laws: [
            {
              slug: "cached-hindi-act",
              title: "Cached Hindi Act",
              sourceUrl,
              sources: {
                en: [{ kind: "html", url: sourceUrl }],
                hi: [{ kind: "pdf", url: hindiPdfUrl, title: "भारतीय राष्‍ट्रीय राजमार्ग प्राधिकरण अधिनियम, 1988" }]
              },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-10", sources: [] })}\n`);
    await writeDataFile(path.join(cacheDir, "cached-hindi-act.lino"), {
      fetchedAt: "2099-01-01T00:00:00.000Z",
      sourceUrl,
      completeFetch: true,
      law: {
        slug: "cached-hindi-act",
        title: "Cached Hindi Act",
        sourceUrl,
        sources: {
          en: [{ kind: "html", url: sourceUrl }],
          hi: [{ kind: "pdf", url: hindiPdfUrl, title: "भारतीय राष्‍ट्रीय राजमार्ग प्राधिकरण अधिनियम, 1988" }]
        },
        sections: [
          {
            sectionId: "1",
            sectionNo: "1",
            orderNo: 1,
            title: "Cached section",
            content: "Cached English body.",
            footnotes: ""
          },
          {
            sectionId: "2",
            sectionNo: "2",
            orderNo: 2,
            title: "Second cached section",
            content: "Second cached English body.",
            footnotes: ""
          }
        ]
      }
    });

    await execFileAsync("node", [
      "scripts/build-site.mjs",
      "--fetch",
      "--manifest",
      manifest,
      "--regional-sources",
      regionalSources,
      "--cache-dir",
      cacheDir,
      "--output",
      output,
      "--max-sections",
      "1",
      "--delay-ms",
      "0"
    ]);

    const catalog = await readDataFile(path.join(output, "data/catalog.lino"));
    const markdown = await readFile(path.join(output, "laws/hi/cached-hindi-act/part-001.md"), "utf8");
    const cache = await readDataFile(path.join(cacheDir, "cached-hindi-act.lino"));
    assert.equal(pdfRequests, 1);
    assert.equal(catalog.laws[0].languages.hi.enabled, true);
    assert.equal(catalog.laws[0].languages.hi.status, "markdown");
    assert.equal(catalog.laws[0].localizedTitles.hi, "भारतीय राष्‍ट्रीय राजमार्ग प्राधिकरण अधिनियम, 1988");
    assert.match(markdown, /Language: Hindi/);
    assert.match(markdown, /भारतीय/);
    assert.equal(cache.law.sections.length, 2);
    assert.ok(cache.law.translations.hi.sections.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build resumes an incomplete cached law without redownloading cached sections", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-resume-cache-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const progressFile = path.join(workspace, "refresh-status.lino");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");
  let landingRequests = 0;
  let cachedSectionRequests = 0;
  let missingSectionRequests = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/resume-act") {
      landingRequests += 1;
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`
        <html>
          <body>
            <table>
              <tr><td class="metadataFieldLabel">Short Title:&nbsp;</td><td class="metadataFieldValue">Resume Act</td></tr>
              <tr><td class="metadataFieldLabel">Act Number:&nbsp;</td><td class="metadataFieldValue">2</td></tr>
              <tr><td class="metadataFieldLabel">Act Year:&nbsp;</td><td class="metadataFieldValue">2026</td></tr>
            </table>
            <a href=/show-data?actid=AC_RESUME&amp;sectionId=10&amp;sectionno=1&amp;orderno=1>
              <span>Section 1. Cached section.</span>
            </a>
            <a href=/show-data?actid=AC_RESUME&amp;sectionId=20&amp;sectionno=2&amp;orderno=2>
              <span>Section 2. Missing section.</span>
            </a>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === "/SectionPageContent") {
      if (url.searchParams.get("sectionID") === "10") {
        cachedSectionRequests += 1;
        response.writeHead(500, { "content-type": "text/plain" });
        response.end("cached section should not be requested again");
        return;
      }
      if (url.searchParams.get("sectionID") === "20") {
        missingSectionRequests += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ content: "<p>Newly fetched missing body.</p>", footnote: "" }));
        return;
      }
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const sourceUrl = `http://127.0.0.1:${port}/resume-act`;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: [sourceUrl],
          lastVerified: "2026-05-09",
          laws: [
            {
              slug: "resume-act",
              title: "Resume Act",
              sourceUrl,
              sources: { en: [{ kind: "html", url: sourceUrl }] },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-09", sources: [] })}\n`);
    await writeDataFile(path.join(cacheDir, "resume-act.lino"), {
      fetchedAt: "2026-05-09T00:00:00.000Z",
      sourceUrl,
      completeFetch: false,
      maxSections: 1,
      law: {
        slug: "resume-act",
        title: "Resume Act",
        sourceUrl,
        sources: { en: [{ kind: "html", url: sourceUrl }] },
        sections: [
          {
            sectionId: "10",
            sectionNo: "1",
            orderNo: 1,
            title: "Cached section",
            content: "Cached body from earlier checkpoint.",
            footnotes: ""
          }
        ]
      }
    });

    await execFileAsync("node", [
      "scripts/build-site.mjs",
      "--fetch",
      "--manifest",
      manifest,
      "--regional-sources",
      regionalSources,
      "--cache-dir",
      cacheDir,
      "--progress-file",
      progressFile,
      "--output",
      output,
      "--delay-ms",
      "0"
    ]);

    const markdown = await readFile(path.join(output, "laws/en/resume-act/part-001.md"), "utf8");
    const cache = await readDataFile(path.join(cacheDir, "resume-act.lino"));
    const progress = await readDataFile(progressFile);
    assert.equal(landingRequests, 1);
    assert.equal(cachedSectionRequests, 0);
    assert.equal(missingSectionRequests, 1);
    assert.match(markdown, /Cached body from earlier checkpoint/);
    assert.match(markdown, /Newly fetched missing body/);
    assert.equal(cache.completeFetch, true);
    assert.equal(cache.law.sections.length, 2);
    assert.equal(progress.status, "complete");
    assert.equal(progress.laws[0].status, "fetched");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build writes completed law cache and progress as Lino", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-lino-cache-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const progressFile = path.join(workspace, "refresh-status.lino");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`
      <html>
        <body>
          <table>
            <tr><td class="metadataFieldLabel">Short Title:&nbsp;</td><td class="metadataFieldValue">Live Cache Act</td></tr>
            <tr><td class="metadataFieldLabel">Act Number:&nbsp;</td><td class="metadataFieldValue">1</td></tr>
            <tr><td class="metadataFieldLabel">Act Year:&nbsp;</td><td class="metadataFieldValue">2026</td></tr>
          </table>
        </body>
      </html>
    `);
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const sourceUrl = `http://127.0.0.1:${port}/live-cache-act`;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: [sourceUrl],
          lastVerified: "2026-05-09",
          laws: [
            {
              slug: "live-cache-act",
              title: "Live Cache Act",
              sourceUrl,
              sources: { en: [{ kind: "html", url: sourceUrl }] },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-09", sources: [] })}\n`);

    await execFileAsync("node", [
      "scripts/build-site.mjs",
      "--fetch",
      "--manifest",
      manifest,
      "--regional-sources",
      regionalSources,
      "--cache-dir",
      cacheDir,
      "--progress-file",
      progressFile,
      "--output",
      output,
      "--delay-ms",
      "0"
    ]);

    const cachePath = path.join(cacheDir, "live-cache-act.lino");
    const cacheNotation = await readFile(cachePath, "utf8");
    const cache = await readDataFile(cachePath);
    const progress = await readDataFile(progressFile);
    assert.match(cacheNotation, /^obj_root:\n  object\n/);
    assert.equal(cache.completeFetch, true);
    assert.equal(cache.law.slug, "live-cache-act");
    assert.equal(progress.status, "complete");
    assert.equal(progress.completedLaws, 1);
    assert.equal(progress.pendingLaws, 0);
    assert.equal(progress.laws[0].status, "fetched");
    assert.equal(progress.laws[0].cacheFile.endsWith("live-cache-act.lino"), true);
    await assert.rejects(readFile(path.join(cacheDir, "live-cache-act.json"), "utf8"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build writes partial output when the runtime budget is exhausted", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-checkpoint-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const progressFile = path.join(workspace, "refresh-status.lino");
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
        "--progress-file",
        progressFile,
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
    const progress = await readDataFile(progressFile);
    assert.equal(catalog.laws.length, 1);
    assert.equal(catalog.laws[0].languages.en.enabled, false);
    assert.equal(progress.status, "partial");
    assert.equal(progress.completedLaws, 0);
    assert.equal(progress.pendingLaws, 1);
    assert.equal(progress.laws[0].status, "pending");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("fetch site build records per-law upstream failures as partial output", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-law-failure-"));
  const output = path.join(workspace, "site");
  const cacheDir = path.join(workspace, "cache");
  const progressFile = path.join(workspace, "refresh-status.lino");
  const manifest = path.join(workspace, "manifest.json");
  const regionalSources = path.join(workspace, "regional-sources.json");
  let failingLawRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/stable-act") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`
        <html>
          <body>
            <table>
              <tr><td class="metadataFieldLabel">Short Title:&nbsp;</td><td class="metadataFieldValue">Stable Act</td></tr>
              <tr><td class="metadataFieldLabel">Act Number:&nbsp;</td><td class="metadataFieldValue">1</td></tr>
              <tr><td class="metadataFieldLabel">Act Year:&nbsp;</td><td class="metadataFieldValue">2026</td></tr>
            </table>
          </body>
        </html>
      `);
      return;
    }

    if (request.url === "/unstable-act") {
      failingLawRequests += 1;
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("temporary upstream failure");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const stableSourceUrl = `http://127.0.0.1:${port}/stable-act`;
    const unstableSourceUrl = `http://127.0.0.1:${port}/unstable-act`;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          generatedFrom: [stableSourceUrl, unstableSourceUrl],
          lastVerified: "2026-05-09",
          laws: [
            {
              slug: "stable-act",
              title: "Stable Act",
              sourceUrl: stableSourceUrl,
              sources: { en: [{ kind: "html", url: stableSourceUrl }] },
              sections: []
            },
            {
              slug: "unstable-act",
              title: "Unstable Act",
              sourceUrl: unstableSourceUrl,
              sources: { en: [{ kind: "html", url: unstableSourceUrl }] },
              sections: []
            }
          ]
        },
        null,
        2
      )}\n`
    );
    await writeFile(regionalSources, `${JSON.stringify({ lastVerified: "2026-05-09", sources: [] })}\n`);

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
        "--progress-file",
        progressFile,
        "--output",
        output,
        "--delay-ms",
        "0"
      ]),
      (error) => {
        assert.equal(error.code, 75);
        assert.match(error.stderr, /Failed to fetch Unstable Act/);
        return true;
      }
    );

    const catalog = await readDataFile(path.join(output, "data/catalog.lino"));
    const progress = await readDataFile(progressFile);
    const stableCache = await readDataFile(path.join(cacheDir, "stable-act.lino"));
    assert.equal(failingLawRequests, 3);
    assert.equal(catalog.sourceMetadata.partialRefresh, true);
    assert.equal(catalog.laws.length, 2);
    assert.equal(catalog.laws[0].slug, "stable-act");
    assert.equal(catalog.laws[1].slug, "unstable-act");
    assert.equal(catalog.laws[1].languages.en.status, "source-only");
    assert.equal(stableCache.law.slug, "stable-act");
    assert.equal(progress.status, "partial");
    assert.equal(progress.completedLaws, 1);
    assert.equal(progress.failedLaws, 1);
    assert.equal(progress.pendingLaws, 0);
    assert.equal(progress.laws[0].status, "fetched");
    assert.equal(progress.laws[1].status, "failed");
    assert.match(progress.laws[1].error, /HTTP 500/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});
