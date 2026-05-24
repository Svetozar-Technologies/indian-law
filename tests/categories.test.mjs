import assert from "node:assert/strict";
import test from "node:test";

import { catalogCategories, catalogCategoryTree, classifyLaw, normaliseCategoryConfig } from "../scripts/lib/categories.mjs";
import { readDataFile } from "../scripts/lib/lino.mjs";

test("normalizes the recursive law category taxonomy", async () => {
  const config = normaliseCategoryConfig(await readDataFile("data/law-categories.lino"));
  const categories = catalogCategories(config);
  const tree = catalogCategoryTree(config);

  assert.equal(categories.length, 58);
  assert.equal(tree.length, 13);
  assert.deepEqual(
    categories.find((category) => category.id === "intellectual-property"),
    {
      id: "intellectual-property",
      label: "Intellectual property",
      description: "Copyright, patents, trade marks, designs, geographical indications, and other intellectual-property rights.",
      depth: 1,
      path: ["corporate", "intellectual-property"],
      parent: "corporate"
    }
  );
});

test("classifies laws into one main category and secondary tags", async () => {
  const config = normaliseCategoryConfig(await readDataFile("data/law-categories.lino"));

  assert.deepEqual(classifyLaw({ slug: "the-copyright-act-1957", title: "The Copyright Act, 1957" }, config), {
    category: "corporate",
    tags: ["intellectual-property"]
  });

  assert.deepEqual(classifyLaw({ slug: "bharatiya-sakshya-adhiniyam-2023", title: "Bharatiya Sakshya Adhiniyam, 2023" }, config), {
    category: "criminal",
    tags: ["evidence-and-forensics"]
  });
});

test("declared categories keep main-category precedence while preserving keyword tags", async () => {
  const config = normaliseCategoryConfig(await readDataFile("data/law-categories.lino"));
  const classification = classifyLaw(
    {
      slug: "sample-ip-penal-act",
      title: "Sample Penal Copyright Act",
      category: "intellectual-property"
    },
    config
  );

  assert.equal(classification.category, "corporate");
  assert.ok(classification.tags.includes("intellectual-property"));
  assert.ok(classification.tags.includes("criminal-offences"));
});
