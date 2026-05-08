import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

import { readDataFile } from "../scripts/lib/lino.mjs";

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
    await execFileAsync("node", [
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
    assert.equal(manifest.discoveryStatus, "seed-fallback");
    assert.equal(manifest.laws[0].handle, "1367");
    assert.equal(manifest.errors.length, 1);
    assert.match(manifest.errors[0].message, /HTTP 404/);
    assert.match(notation, /^obj_root:\n  object\n/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});
