import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const DISCOVERED_MANIFESTS = ["data/laws.discovered.lino", "data/regional-sources.discovered.lino"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("refresh workflow force-adds ignored discovered manifests before checkpoint commits", async () => {
  const [workflow, gitignore] = await Promise.all([
    readFile(".github/workflows/refresh-laws.yml", "utf8"),
    readFile(".gitignore", "utf8")
  ]);

  for (const manifest of DISCOVERED_MANIFESTS) {
    assert.match(gitignore, new RegExp(`^${escapeRegExp(manifest)}$`, "m"));
  }

  const addCommand = workflow
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.startsWith("git add") &&
        DISCOVERED_MANIFESTS.every((manifest) => line.includes(manifest))
    );

  assert.equal(
    addCommand,
    `git add -f ${DISCOVERED_MANIFESTS.join(" ")}`,
    "ignored generated manifests must be force-added so checkpoint commits do not fail"
  );
});

test("refresh workflow prints checkpoint staging diagnostics", async () => {
  const workflow = await readFile(".github/workflows/refresh-laws.yml", "utf8");

  for (const expectedLog of [
    "Workspace status before staging generated files:",
    "Workspace status after staging generated files:",
    "Staged generated change summary:",
    "Created checkpoint commit",
    "Pushed checkpoint commit"
  ]) {
    assert.match(workflow, new RegExp(escapeRegExp(expectedLog)));
  }

  assert.match(workflow, /^\s+git status --short$/m);
  assert.match(workflow, /^\s+git diff --cached --stat$/m);
  assert.match(workflow, /git rev-parse --short HEAD/);
});

test("refresh workflow uses one-hour checkpoint chunks by default", async () => {
  const workflow = await readFile(".github/workflows/refresh-laws.yml", "utf8");

  assert.match(workflow, /^\s+timeout-minutes: 75$/m);
  assert.match(workflow, /checkpoint_minutes:\n\s+description: "Minutes to fetch before committing partial progress\."\n\s+required: false\n\s+default: "55"/);
  assert.match(workflow, /CHECKPOINT_MINUTES: \$\{\{ github\.event\.inputs\.checkpoint_minutes \|\| '55' \}\}/);
  assert.match(workflow, /MAX_CHUNKS: \$\{\{ github\.event\.inputs\.max_chunks \|\| '1' \}\}/);
});

test("refresh workflow uses plain sync commit message for one chunk", async () => {
  const workflow = await readFile(".github/workflows/refresh-laws.yml", "utf8");

  assert.match(workflow, /sync_commit_message\(\)/);
  assert.match(workflow, /if \[ "\$max_chunks" -eq 1 \]; then/);
  assert.match(workflow, /echo "Laws sync"/);
  assert.match(workflow, /echo "Laws sync chunk \$chunk of \$max_chunks"/);
  assert.match(workflow, /commit_generated "\$\(sync_commit_message "\$chunk" "\$MAX_CHUNKS"\)"/);
  assert.doesNotMatch(workflow, /Refresh generated law pages \(chunk \$chunk\)/);
});

test("refresh workflow advertises the canonical deployed site path", async () => {
  const workflow = await readFile(".github/workflows/refresh-laws.yml", "utf8");

  assert.match(workflow, /^\s+url: https:\/\/law\.satyavera\.in\/indian-law\/$/m);
  assert.doesNotMatch(workflow, /url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/);
});

test("CI workflow treats live-source partial output as a recoverable smoke result", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /name: Build one live law smoke sample/);
  assert.match(workflow, /status=\$\?/);
  assert.match(workflow, /\[ "\$status" -ne 75 \]/);
  assert.match(workflow, /::notice::Live law smoke produced partial output/);
});
