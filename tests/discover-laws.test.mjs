import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

import { readDataFile, writeDataFile } from "../scripts/lib/lino.mjs";

const execFileAsync = promisify(execFile);

test("Central Act discovery falls back to seed laws when the live listing is unavailable", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-discovery-"));
  const server = http.createServer((request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end(`missing ${request.url}`);
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const outputFile = path.join(output, "laws.discovered.lino");
    const { stderr } = await execFileAsync("node", [
      "scripts/discover-laws.mjs",
      "--search-url",
      `http://127.0.0.1:${port}/simple-search`,
      "--limit",
      "1",
      "--output",
      outputFile,
      "--delay-ms",
      "0",
      "--retries",
      "0"
    ]);

    const manifest = await readDataFile(outputFile);
    const notation = await readFile(outputFile, "utf8");
    assert.match(stderr, /\[discover-laws\].*Starting Central Act discovery/);
    assert.match(stderr, /\[discover-laws\].*Fetching search page/);
    assert.match(stderr, /\[discover-laws\].*Discovery status seed-fallback/);
    assert.equal(manifest.discoveryStatus, "seed-fallback");
    assert.equal(manifest.laws[0].handle, "1367");
    assert.equal(manifest.errors.length, 1);
    assert.match(manifest.errors[0].message, /HTTP 404/);
    assert.match(notation, /^obj_root:\n  generatedFrom obj_root_generated_from\n/);
    assert.doesNotMatch(notation, /^obj_root:\n  object\n/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});

test("Central Act discovery preserves a fuller existing manifest when the live listing is unavailable", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-discovery-stale-"));
  const server = http.createServer((request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end(`missing ${request.url}`);
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const outputFile = path.join(output, "laws.discovered.lino");
    const existingLaws = Array.from({ length: 5 }, (_, index) => ({
      slug: `existing-act-${index + 1}`,
      handle: String(9000 + index),
      title: `Existing Act ${index + 1}`,
      sourceUrl: `https://www.indiacode.nic.in/handle/123456789/${9000 + index}`,
      sections: []
    }));
    await writeDataFile(outputFile, {
      generatedFrom: ["https://www.indiacode.nic.in/handle/123456789/1362/simple-search"],
      lastVerified: "2026-05-18",
      discoveryStatus: "complete",
      errors: [],
      notes: ["Existing full discovery manifest."],
      laws: existingLaws
    });

    const { stderr } = await execFileAsync("node", [
      "scripts/discover-laws.mjs",
      "--search-url",
      `http://127.0.0.1:${port}/simple-search`,
      "--limit",
      "1",
      "--output",
      outputFile,
      "--delay-ms",
      "0",
      "--retries",
      "0"
    ]);

    const manifest = await readDataFile(outputFile);
    assert.match(stderr, /\[discover-laws\].*Loaded existing discovery manifest/);
    assert.match(stderr, /\[discover-laws\].*Discovery status stale-fallback/);
    assert.equal(manifest.discoveryStatus, "stale-fallback");
    assert.equal(manifest.lastVerified, "2026-05-18");
    assert.deepEqual(
      manifest.laws.map((law) => law.slug),
      existingLaws.map((law) => law.slug)
    );
    assert.equal(manifest.errors.length, 1);
    assert.match(manifest.errors[0].message, /HTTP 404/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});

test("Central Act discovery preserves a fuller existing manifest when live discovery is partial", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "indian-law-discovery-partial-stale-"));
  const searchRow =
    '<tr><td headers="t1">25-Dec-2023</td><td headers="t2">45</td><td headers="t3">The Live Partial Act, 2023</td><td headers="t4"><a href="/handle/123456789/20062?view_type=search&col=123456789/1362">View</a></td></tr>';
  const server = http.createServer((request, response) => {
    if (request.url.includes("start=0")) {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<table>${searchRow}</table>`);
      return;
    }
    response.writeHead(503, { "content-type": "text/plain" });
    response.end(`temporary failure ${request.url}`);
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const outputFile = path.join(output, "laws.discovered.lino");
    const existingLaws = Array.from({ length: 5 }, (_, index) => ({
      slug: `existing-complete-act-${index + 1}`,
      handle: String(9100 + index),
      title: `Existing Complete Act ${index + 1}`,
      sourceUrl: `https://www.indiacode.nic.in/handle/123456789/${9100 + index}`,
      sections: []
    }));
    await writeDataFile(outputFile, {
      generatedFrom: ["https://www.indiacode.nic.in/handle/123456789/1362/simple-search"],
      lastVerified: "2026-05-18",
      discoveryStatus: "complete",
      errors: [],
      notes: ["Existing full discovery manifest."],
      laws: existingLaws
    });

    const { stderr } = await execFileAsync("node", [
      "scripts/discover-laws.mjs",
      "--search-url",
      `http://127.0.0.1:${port}/simple-search`,
      "--output",
      outputFile,
      "--delay-ms",
      "0",
      "--retries",
      "0"
    ]);

    const manifest = await readDataFile(outputFile);
    assert.match(stderr, /\[discover-laws\].*Added law 1: The Live Partial Act, 2023/);
    assert.match(stderr, /\[discover-laws\].*Discovery status stale-fallback/);
    assert.equal(manifest.discoveryStatus, "stale-fallback");
    assert.deepEqual(
      manifest.laws.map((law) => law.slug),
      existingLaws.map((law) => law.slug)
    );
    assert.equal(manifest.errors.length, 1);
    assert.match(manifest.errors[0].message, /HTTP 503/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});
