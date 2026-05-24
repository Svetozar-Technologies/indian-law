# Issue 33 Case Study

Date: 2026-05-24

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/33
Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/34

## Objective

Issue 33 asks for a case study of law-download coverage ideas from `Svetozar-Technologies/satyavera-app`, then asks this repository to apply the useful pieces while preserving the `indian-law` constraints:

- Repository-owned data stays in Links Notation.
- The law list uses collapsible categories.
- Each law belongs to a single main category.
- Research notes, evidence, and verification artifacts are preserved under this directory.

## Current Repository Findings

- `scripts/build-site.mjs` generates `data/catalog.lino`, Markdown parts, and the React app bundle.
- `data/laws.seed.lino`, `data/languages.lino`, and regional source inputs are already Links Notation.
- `src/app.jsx` previously rendered one flat law table for the selected language.
- `src/catalog-status.mjs` already owns frontend catalog filtering and language status helpers, so category grouping belongs there rather than in route code.
- `docs/REQUIREMENTS.md` already requires official public sources, language isolation, generated-output evidence, and Links Notation reviewability.

## Related App Findings

The related `satyavera-app` repository stores a much larger local law corpus under category directories. Its `data/laws/_index.json` summary, saved here as `satyavera-laws-index-summary.json`, reports 846 laws and 35,685 sections exported on 2026-05-20.

Useful ideas adopted:

- A stable category taxonomy with these high-level buckets: criminal, civil, constitutional, property, family, labour, consumer, women, corporate, tax, environment, cyber, and general.
- Explicit slug rules for known high-value laws.
- Ministry and keyword rules as a practical fallback when a law does not have an explicit mapping.
- A primary-category priority order so a law is assigned one main category even if multiple rules match.

Ideas not adopted:

- JSON as repository-owned law data. This repository requires reviewable Links Notation for data files.
- Multi-category law placement. Issue 33 explicitly asks for one main category per law.
- Placeholder or generated legal text. This repository must not invent law text or translations.
- Open-source dataset or AI-generated text as a source of truth. Those may help auditing, but official sources remain authoritative.

## Online Research Notes

- India Code is the primary official source for Central Acts and source metadata.
- The Legislative Department regional-language dashboard remains the appropriate official source for regional-language PDF links.
- Native HTML `<details>` and `<summary>` provide a browser-supported disclosure widget, so the collapsible category UI does not need custom JavaScript state.

Reference URLs are listed in `reference-urls.txt`.

## Requirements Added

- Category taxonomy and classification rules are stored in `data/law-categories.lino`.
- The build reads that Links Notation file and writes `catalog.categories` plus one `law.category` string on every generated law entry.
- Every visible law row appears in exactly one category group.
- The home law list groups selected-language visible laws into native collapsible category sections.

## Implementation Summary

- Added `scripts/lib/categories.mjs` for normalising the taxonomy and assigning a single category per law using explicit slug, declared category, ministry, and keyword rules.
- Updated `scripts/build-site.mjs` to read `data/law-categories.lino` and include categories in the generated catalog.
- Added `groupLawsByCategory` in `src/catalog-status.mjs`.
- Refactored `src/app.jsx` into category groups with reusable law table rows.
- Added category group styling in `src/styles.css`.
- Updated `docs/REQUIREMENTS.md` with category and collapsible-list requirements.

## Evidence

- `issue-33.json`: issue metadata snapshot.
- `issue-33-comments.json`: issue comments snapshot. Empty at investigation time.
- `pr-34-before.json`: prepared PR metadata before update.
- `pr-34-conversation-comments.json`, `pr-34-review-comments.json`, `pr-34-reviews.json`: PR discussion/review snapshots. Empty at investigation time.
- `recent-merged-prs.json`: recent merged PRs used to compare repository style.
- `satyavera-laws-index-summary.json`: summarized related-app category/count data.
- `satyavera-law-scripts-summary.json`: summarized related-app law-download script names.
- `pre-fix-focused-tests.log`: reproducing test failure before implementation.
- `post-fix-focused-tests.log`: focused test pass after implementation.
- `full-test.log`: full project test pass after implementation.
- `offline-build.log`: offline site build used for generated-output/browser verification.
- `offline-catalog-summary.txt`: generated catalog category IDs and seed law category assignments.
- `category-groups-desktop.png`: desktop browser screenshot of the collapsible category groups.
- `category-groups-mobile.png`: mobile browser screenshot of the collapsible category groups.
- `pr-description.md`: final PR body used to update PR 34.
- `static-server.log`: local static-server requests from browser verification.
- `npm-ci.log`: dependency installation log.

## Verification

Focused regression tests:

```sh
node --test tests/catalog-status.test.mjs tests/build-site.test.mjs
```

The post-fix focused run passed 19 tests.

Full project tests:

```sh
npm test
```

The full run passed 47 tests.

Generated-output and browser verification:

```sh
npm run build:offline -- --output /tmp/indian-law-issue-33-site
```

The generated catalog includes all 13 taxonomy categories and assigns the seed laws as:

- `copyright-act-1957`: `corporate`
- `bharatiya-nyaya-sanhita-2023`: `criminal`
- `bharatiya-nagarik-suraksha-sanhita-2023`: `criminal`
- `bharatiya-sakshya-adhiniyam-2023`: `criminal`

Playwright rendered the generated site at desktop and mobile widths and captured the screenshots listed above.
