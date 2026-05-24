import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

import { readDataFile } from "../scripts/lib/lino.mjs";

test("committed Pages catalog classifies the real generated law corpus", async () => {
  const catalog = await readDataFile("docs/data/catalog.lino");
  const categoryIds = new Set((catalog.categories ?? []).map((category) => category.id));
  const lawSlugs = new Set((catalog.laws ?? []).map((law) => law.slug));

  assert.ok(catalog.laws.length >= 700, "docs/data/catalog.lino should contain the real generated corpus");
  assert.ok(categoryIds.has("criminal"));
  assert.ok(categoryIds.has("intellectual-property"));
  assert.equal(lawSlugs.size, catalog.laws.length, "the generated catalog should not duplicate laws");
  assert.equal(
    catalog.laws.filter((law) => categoryIds.has(law.category)).length,
    catalog.laws.length,
    "every generated law should have exactly one known main category"
  );
  assert.equal(
    catalog.laws.filter((law) => Array.isArray(law.categoryTags)).length,
    catalog.laws.length,
    "every generated law should have a reviewable categoryTags array"
  );
  assert.equal(catalog.laws.find((law) => law.slug === "the-copyright-act-1957")?.category, "corporate");
  assert.ok(catalog.laws.find((law) => law.slug === "the-copyright-act-1957")?.categoryTags.includes("intellectual-property"));
});

test("committed Pages assets contain the category-group UI", async () => {
  const bundle = await readFile("docs/assets/app.js", "utf8");
  const styles = await readFile("docs/assets/site.css", "utf8");

  assert.ok(bundle.includes("category-list"), "docs/assets/app.js should contain the category-list UI");
  assert.ok(bundle.includes("categoryTags"), "docs/assets/app.js should read categoryTags");
  assert.ok(styles.includes(".category-group"), "docs/assets/site.css should style category groups");
  assert.ok(styles.includes(".law-tag"), "docs/assets/site.css should style law tags");
});
