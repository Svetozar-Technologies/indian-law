# Issue 33 Case Study

Date: 2026-05-24

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/33
Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/34

## Objective

Issue 33 asks for a case study of law-download and law-category ideas from `Svetozar-Technologies/satyavera-app`, then asks this repository to apply the useful pieces while preserving `indian-law` constraints:

- Repository-owned data stays in Links Notation.
- The law list uses collapsible main categories.
- Each law belongs to exactly one main category.
- Secondary taxonomy matches may be displayed as tags or badges without duplicating rows.
- Research notes, evidence, and verification artifacts are preserved under this directory.

PR feedback on 2026-05-24 clarified that screenshots and validation must use the real generated catalog already committed under `docs/`, not only the four-law seed fixture.

## Repository Findings

- `scripts/build-site.mjs` generates `data/catalog.lino`, Markdown parts, and the React app bundle.
- `docs/data/catalog.lino` contains the real generated Pages corpus: 846 laws.
- `data/laws.seed.lino` is still useful for fast offline tests, but it is not representative review evidence for issue 33.
- `src/catalog-status.mjs` owns frontend catalog filtering, language metrics, and category grouping.
- `docs/REQUIREMENTS.md` requires official public sources, language isolation, generated-output evidence, and Links Notation reviewability.

## Related App Findings

The related `satyavera-app` repository stores a larger law corpus under category directories. Its `data/laws/_index.json` summary, saved here as `satyavera-laws-index-summary.json`, reports 846 laws and 35,685 sections exported on 2026-05-20.

Useful ideas adopted:

- Stable high-level buckets: criminal, civil, constitutional, property, family, labour, consumer, women, corporate, tax, environment, cyber, and general.
- Explicit slug rules for known high-value laws.
- Ministry and keyword fallback rules.
- A primary-category priority order so each law has one main group.
- Secondary category matches as reviewable tags.

Ideas not adopted:

- JSON as repository-owned law data. This repository keeps reviewable Links Notation.
- Multi-group law placement. Issue 33 requires one main category per law.
- Related-app data as legal source of truth. Official public sources remain authoritative.

## Implementation Summary

- `data/law-categories.lino` now stores a recursive taxonomy, explicit rules, ministry rules, keyword rules, and main-category priority.
- `scripts/lib/categories.mjs` normalizes recursive taxonomy data and classifies a law into one main top-level category plus `categoryTags`.
- `scripts/build-site.mjs` writes `catalog.categories`, `catalog.categoryTree`, `law.category`, and `law.categoryTags`.
- `docs/data/catalog.lino` was regenerated in place from the real 846-law Pages catalog with 58 taxonomy nodes and 13 top-level groups.
- `src/catalog-status.mjs` groups laws by top-level category and resolves tag labels for row badges.
- `src/app.jsx` renders collapsible main category groups and secondary taxonomy badges on law rows.
- `src/styles.css` and `docs/assets/site.css` include badge styling; `docs/assets/app.js` and shell hashes were rebuilt.

Real catalog main-category counts:

- criminal: 240
- corporate: 155
- general: 80
- property: 78
- constitutional: 69
- women: 68
- civil: 50
- consumer: 29
- family: 29
- environment: 20
- labour: 16
- cyber: 6
- tax: 6

## Evidence

- `issue-33.json`, `issue-33-comments.json`: issue metadata and comments snapshot.
- `pr-34-before.json`, `pr-34-conversation-comments.json`, `pr-34-review-comments.json`, `pr-34-reviews.json`: PR metadata, discussion, and review snapshots after the latest feedback.
- `recent-merged-prs.json`: recent merged PRs used to compare repository style.
- `satyavera-laws-index-summary.json`: related-app law and section counts.
- `satyavera-law-scripts-summary.json`: summarized related-app category and ingest/export findings.
- `pre-fix-real-pages-tests.log`: reproducing failure showing the committed Pages catalog had no real categories and stale assets.
- `post-fix-real-pages-tests.log`: focused real Pages catalog regression pass.
- `real-catalog-category-summary.lino`: 846-law category and tag summary.
- `post-fix-focused-tests.log`: focused regression suite pass.
- `full-test.log`: full project test pass.
- `offline-build.log`, `offline-catalog-summary.txt`: seed fixture build verification, clearly separated from real Pages evidence.
- `category-groups-desktop.png`, `category-groups-mobile.png`: browser screenshots of the real 846-law Pages catalog.
- `static-server.log`: local static-server requests from browser verification.
- `npm-ci.log`: dependency installation log.

## Verification

Focused regression tests:

```sh
node --test tests/categories.test.mjs tests/generated-pages.test.mjs tests/catalog-status.test.mjs tests/build-site.test.mjs
```

The focused run passed 24 tests.

Full project tests:

```sh
npm test
```

The full run passed 52 tests.

Seed build verification:

```sh
npm run build:offline -- --output /tmp/indian-law-issue-33-site-rerun
```

Browser verification:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs
```

Playwright loaded `http://127.0.0.1:4173/`, confirmed the 846-law metric, confirmed 13 collapsible main groups, verified the first group can collapse, and captured the desktop and mobile screenshots listed above.
