import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("regional source discovery logs page decisions by default", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-regional-logs-"));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html><body><table></table></body></html>");
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const languages = path.join(workspace, "languages.json");
    const output = path.join(workspace, "regional-sources.json");
    await writeFile(
      languages,
      `${JSON.stringify(
        {
          languages: [
            {
              code: "ta",
              regionalSlug: "tamil",
              officialSource: `http://127.0.0.1:${port}/regional`
            }
          ]
        },
        null,
        2
      )}\n`
    );

    const { stderr } = await execFileAsync("node", [
      "scripts/discover-regional-sources.mjs",
      "--languages",
      languages,
      "--output",
      output,
      "--max-pages",
      "1",
      "--delay-ms",
      "0"
    ]);

    assert.match(stderr, /\[discover-regional-sources\].*Starting regional source discovery/);
    assert.match(stderr, /\[discover-regional-sources\].*Fetching ta page 1/);
    assert.match(stderr, /\[discover-regional-sources\].*Parsed 0 regional source row/);
    assert.match(stderr, /\[discover-regional-sources\].*No regional rows found/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});

test("source smoke download logs source choices by default", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "indian-law-smoke-logs-"));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("official source body");
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const manifest = path.join(workspace, "laws.json");
    const output = path.join(workspace, "downloads");
    await mkdir(output, { recursive: true });
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          laws: [
            {
              slug: "test-act",
              sources: {
                en: [
                  {
                    kind: "html",
                    url: `http://127.0.0.1:${port}/source`
                  }
                ]
              }
            }
          ]
        },
        null,
        2
      )}\n`
    );

    const { stderr } = await execFileAsync("node", [
      "scripts/smoke-download-source.mjs",
      "--manifest",
      manifest,
      "--output",
      output,
      "--max-sources",
      "1",
      "--min-bytes",
      "1",
      "--delay-ms",
      "0"
    ]);
    const files = await readFile(path.join(output, "01-test-act-en.html"), "utf8");

    assert.equal(files, "official source body");
    assert.match(stderr, /\[smoke-download-source\].*Starting official source smoke download/);
    assert.match(stderr, /\[smoke-download-source\].*Queued 1 official source/);
    assert.match(stderr, /\[smoke-download-source\].*Downloading source 1\/1/);
    assert.match(stderr, /\[http\].*HTTP attempt 1\/3/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});
