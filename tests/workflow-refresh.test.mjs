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
