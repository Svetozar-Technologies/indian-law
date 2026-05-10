# Issue 19 Case Study

## Scope

Issue 19 reported that the public catalog rendered `The National Food Security Act, 2013` as `Unavailable` even though India Code had an official handle page and primary PDFs. The issue also requested clearer public copy, direct source links, a check of the refresh CI run, and a review of `.lino` progress and 30-day caching.

## Evidence Captured

- Issue metadata: `data/issue-19.json`
- Issue comments: `data/issue-19-comments.json`
- Branch CI metadata: `data/recent-branch-runs.json`, `data/ci-run-25626779266.json`
- Refresh/deploy run metadata: `data/refresh-run-25625413223.json`
- CI logs: `logs/ci-branch-25626779266.log`, `logs/ci-main-25625413223.log.gz`
- India Code handle HTML: `data/national-food-security-handle.html`
- India Code parse check: `data/national-food-security-parse.log`
- PDF header checks: `data/national-food-security-en.pdf.head`, `data/national-food-security-hi.pdf.head`
- Lino source check: `data/lino-source-check.log`
- Issue screenshots: `images/issue-19-government-source.png`, `images/issue-19-site-unavailable.png`
- Local verification screenshots: `images/issue-19-local-after.png`, `images/issue-19-local-copy-after.png`

The downloaded PNG files were verified with their PNG magic bytes before inspection. The English and Hindi PDF endpoints returned PDF headers for:

- `https://www.indiacode.nic.in/bitstream/123456789/2113/1/201320.pdf`
- `https://www.indiacode.nic.in/bitstream/123456789/2113/3/H2013-20.pdf`

## Findings

The catalog generator already preserved a `source-only` language status when an official source existed but Markdown text had not been produced. The React table ignored that status and rendered every non-enabled language as `Unavailable`. That collapsed two different states: no known official source, and official source known but not processed yet.

The stored refresh progress showed the National Food Security handle as failed with `HTTP 404 Not Found`, while a fresh local fetch of the same handle succeeded and exposed 45 India Code sections plus the English and Hindi primary PDFs. This points to a transient upstream fetch failure rather than a missing law source.

The India Code PDF extractor accepted every PDF link on a law page. On India Code pages this can include subordinate rules, notifications, and help PDFs. The extractor now keeps only primary law PDFs under `/bitstream/123456789/...pdf`.

The referenced refresh/deploy run `25625413223` completed successfully on `2026-05-10T09:38:54Z` and deployed SHA `56a2a223d821998ded1541decaa0b2d649a92ee3`. The existing PR branch CI run `25626779266` completed successfully on `2026-05-10T10:50:08Z` at SHA `683b8b8d50023fe675322ec9cd1eb301a63e495a`.

## Changes Made

- Added a shared catalog status helper so known official sources without Markdown render as `Pending`, while truly missing sources render as `Unavailable`.
- Updated the public copy to:
  - `OFFICIAL-SOURCE COPY`
  - `Active Indian laws catalog`
  - `A catalog viewer of Indian laws from official public sources.`
- Added direct National Food Security English and Hindi PDF source links to `data/laws.discovered.lino` and `docs/data/catalog.lino`.
- Tightened India Code PDF extraction to primary law PDFs and added a regression for National Food Security-style markup.
- Changed the single-chunk refresh commit message to `Laws sync`; multi-chunk runs use `Laws sync chunk N of M`.

## Verification

Focused tests:

```sh
node --test --test-timeout=30000 tests/catalog-status.test.mjs tests/html.test.mjs tests/workflow-refresh.test.mjs
```

Full suite:

```sh
npm test
git diff --check
```

Local browser verification with Playwright confirmed:

- English catalog row: `The National Food Security Act, 2013 ... Pending html pdf`
- Hindi catalog row: `The National Food Security Act, 2013 ... Pending pdf`
- Hero copy renders as `OFFICIAL-SOURCE COPY`, `Active Indian laws catalog`, and the requested summary.
