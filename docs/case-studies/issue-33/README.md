# Issue 33 Case Study

Date: 2026-05-24

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/33
Category pull request: https://github.com/Svetozar-Technologies/indian-law/pull/34
Regression follow-up pull request: https://github.com/Svetozar-Technologies/indian-law/pull/35

## Objective

Issue 33 asks for a case study of law-download and law-category ideas from `Svetozar-Technologies/satyavera-app`, then asks this repository to apply the useful pieces while preserving `indian-law` constraints:

- Repository-owned data stays in Links Notation.
- The law list uses collapsible main categories.
- Each law belongs to exactly one main category.
- Secondary taxonomy matches may be displayed as tags or badges without duplicating rows.
- Research notes, evidence, and verification artifacts are preserved under this directory.

PR feedback on 2026-05-24 clarified that screenshots and validation must use the real generated catalog already committed under `docs/`, not only the four-law seed fixture.

Additional issue feedback on 2026-05-24 identified commit `f8f521da668fb32a4fd3729e7633c5d7779b3884` as destructive: the refresh committed a four-law seed fallback manifest, removed the generated Markdown corpus, and reduced the committed Pages catalog from the real 846-law corpus to a partial output.

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

## Follow-up Regression Fix

PR 35 restores the last known-good generated Pages corpus from the PR 34 merge commit and adds a source-discovery guard:

- `docs/data/catalog.lino` is restored to 846 laws, 58 taxonomy nodes, and 13 collapsible main groups.
- `docs/laws/` is restored to 1,918 generated Markdown part files.
- `data/laws.discovered.lino`, `data/regional-sources.discovered.lino`, and `data/cache/refresh-status.lino` are restored to the complete 2026-05-18 discovery state.
- `scripts/discover-laws.mjs` now preserves a fuller existing discovered manifest as `stale-fallback` data when live discovery fails, errors before completing, or returns no rows, instead of overwriting it with a smaller result.
- `tests/discover-laws.test.mjs` covers the stale-fallback preservation path, while `tests/generated-pages.test.mjs` continues to assert that committed Pages data contains the real generated corpus.

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
- `pre-fix-f8-regression-tests.log`: reproducing failure after `f8f521d`, showing the committed Pages catalog no longer contained the real generated corpus.
- `discover-laws-stale-fallback-test.log`: focused pass for the new discovery preservation test.
- `post-restore-generated-pages-test.log`: focused pass after restoring the real generated catalog and Markdown corpus.
- `followup-focused-tests.log`: PR 35 focused regression suite pass.
- `followup-full-test.log`: PR 35 full project test pass.
- `followup-offline-build.log`: PR 35 deterministic offline build pass.
- `npm-ci-followup.log`: dependency installation log for the PR 35 follow-up verification.
- `pr-35-before-final.json`: PR 35 metadata snapshot before finalizing this follow-up.
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

Follow-up verification for PR 35:

```sh
node --test tests/discover-laws.test.mjs
node --test tests/generated-pages.test.mjs
node --test tests/discover-laws.test.mjs tests/generated-pages.test.mjs tests/categories.test.mjs tests/catalog-status.test.mjs tests/workflow-refresh.test.mjs
npm test
npm run build:offline -- --output /tmp/indian-law-issue-33-followup-site
```

The restored committed catalog contains 846 laws, 58 taxonomy nodes, 13 top-level collapsible groups, and 1,918 generated Markdown part files under `docs/laws/`.
