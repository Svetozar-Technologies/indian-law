# Issue 13 GitHub Pages Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/13

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/14

Prepared branch: `issue-13-338e6c4379ea`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Verify CI/CD and artifact/log download behavior on manual trigger. | Preserved refresh and PR CI run metadata plus full logs. The refresh workflow uploaded a Pages artifact, and the PR CI failure was traced to the live smoke step. |
| R2 | Clear total data size. | Size snapshots are preserved in `raw/data-size-bytes.txt`, `raw/data-size-human.txt`, and `raw/data-docs-file-count.txt`; the published Pages artifact was `10,605,020` bytes. |
| R3 | Download all logs and data related to the issue under `docs/case-studies/issue-13`. | Issue, PR, comments, reviews, run metadata, logs, curl responses, local verification logs, source references, and the local screenshot are committed here. |
| R4 | Write a deep case study with timeline, requirements, root causes, and solutions. | This document reconstructs the timeline, root causes, options considered, and implemented fixes. |
| R5 | Search online for additional facts and data. | Official GitHub Pages, Actions, and India Code/public service references are recorded in `reference-urls.txt`. |
| R6 | Check existing components and libraries before changing code. | Reused the existing static shell renderer, React app bundle, hash-router app model, build-site tests, workflow annotations, and Node test runner. |
| R7 | Add debug output if the existing data is insufficient. | Existing logs plus targeted local command logs were sufficient. The CI workflow now also emits a notice when a recoverable live-source partial result occurs. |
| R8 | Fix the missing `https://law.satyavera.in/indian-law` publication path. | The generated site now includes a small `/indian-law/` alias shell that loads root-published assets without duplicating the law corpus. |
| R9 | Make the PR CI failure actionable. | The PR smoke step now treats `build-site` exit code `75` as recoverable partial output while still failing for all other nonzero statuses. |

## Evidence Collected

Downloaded metadata:

- `raw/issue-13.json` - issue title, body, author, state, and timestamps.
- `raw/issue-13-comments.json` - issue comments, empty at investigation time.
- `raw/pr-14.json` - PR title, body, draft flag, commits, and check rollup.
- `raw/pr-14-review-comments.json` - inline review comments, empty at investigation time.
- `raw/pr-14-conversation-comments.json` - PR conversation comments, empty at investigation time.
- `raw/pr-14-reviews.json` - PR reviews, empty at investigation time.
- `raw/recent-branch-runs.json` - recent workflow runs on `issue-13-338e6c4379ea`.
- `raw/run-25606577222.json` - failing PR CI run metadata.
- `raw/run-25603819370.json` - referenced refresh and deploy run metadata.
- `raw/pages-api.json` - GitHub Pages configuration for the repository.
- `raw/recent-merged-related-prs.json` - merged PRs used for style and prior related fixes.

Downloaded logs and responses:

- `raw/ci-logs/ci-25606577222.log` - full failing PR CI log.
- `raw/ci-logs/refresh-25603819370.log` - full referenced refresh/deploy log.
- `raw/curl-custom-root-headers.txt` and `raw/curl-custom-root-body.html` - live custom-domain root response.
- `raw/curl-custom-path-headers.txt` and `raw/curl-custom-path-body.html` - live custom-domain `/indian-law` response.
- `raw/curl-default-pages-headers.txt` - default GitHub Pages URL redirect response.
- `raw/local-*.log` and `raw/*after-fix.log` - focused reproduction and verification logs.
- `screenshots/local-alias.png` - local Playwright screenshot of `/indian-law/` rendering the law catalog after the fix.

Reference links are preserved in `reference-urls.txt`, and the full file inventory is preserved in `raw/evidence-file-list.txt`.

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 14:43:29 | `Refresh Laws and Deploy Pages` run `25603819370` started on the issue branch. | `raw/run-25603819370.json` |
| 2026-05-09 14:43:57 | live discovery completed with 845 central laws. | `raw/ci-logs/refresh-25603819370.log` |
| 2026-05-09 16:35:08 | the workflow uploaded the Pages artifact. The log reports artifact ID `6897044451` and final size `10,605,020` bytes. | `raw/ci-logs/refresh-25603819370.log` |
| 2026-05-09 16:35:15 | `deploy-pages` reported a successful deployment. | `raw/ci-logs/refresh-25603819370.log` |
| 2026-05-09 16:46:37 | Issue 13 was opened reporting that no Pages site was published at `https://law.satyavera.in/indian-law`. | `raw/issue-13.json` |
| 2026-05-09 16:56:00 | Draft PR 14 was created from `issue-13-338e6c4379ea`. | `raw/pr-14.json` |
| 2026-05-09 16:56:02 | PR CI run `25606577222` started. | `raw/run-25606577222.json` |
| 2026-05-09 16:56:31 | PR CI failed in `Build one live law smoke sample` after India Code returned 404 for handle `1367` and `build-site` exited with status `75`. | `raw/ci-logs/ci-25606577222.log` |
| 2026-05-09 16:58:00 | GitHub Pages API showed `cname: law.satyavera.in`, `html_url: http://law.satyavera.in/`, and `build_type: workflow`. | `raw/pages-api.json` |
| 2026-05-09 16:58:00 | live checks showed `https://law.satyavera.in/` returned `200`, while `https://law.satyavera.in/indian-law` returned `404`. | `raw/curl-custom-root-headers.txt`, `raw/curl-custom-path-headers.txt` |
| 2026-05-09 17:04:00 | focused regression checks reproduced the missing alias shell and missing CI exit-75 handling. | `raw/build-site-repro-before-fix.log`, `raw/workflow-repro-before-fix.log` |
| 2026-05-09 17:05:00 | the local static site rendered `/indian-law/` successfully with assets and catalog data loaded from the parent root. | `raw/local-alias-headers.txt`, `raw/local-app-headers.txt`, `raw/local-catalog-headers.txt`, `screenshots/local-alias.png` |

## Root Causes

There were two separate failures.

First, the repository Pages site is attached to the custom domain `law.satyavera.in`. The Pages API reports the site root as `http://law.satyavera.in/`, and the default `svetozar-technologies.github.io/indian-law/` URL redirects to that root. Because the generated artifact only contained `index.html` at the root, `https://law.satyavera.in/` worked but `https://law.satyavera.in/indian-law` returned 404. This is a path-shape mismatch, not a missing Pages deployment.

Second, PR CI was failing because the live law smoke step treated all nonzero `build-site` statuses as hard failures. `scripts/build-site.mjs` already uses exit code `75` to mean recoverable partial output after a live-source failure. In run `25606577222`, India Code returned 404 for one live handle during the smoke build, so the builder did the right thing by exiting `75`, but the CI shell wrapper did not interpret that contract.

## Source Findings

GitHub Pages documentation describes custom domains as attached to a Pages site, and the repository API confirmed this Pages site is configured with `law.satyavera.in` as its custom domain. The observed live responses match that configuration: the root custom domain served content, and the repository-name path did not exist inside the artifact.

GitHub custom workflow documentation confirms the repository's use of `configure-pages`, `upload-pages-artifact`, and `deploy-pages` is the supported Pages deployment path. The referenced refresh run uploaded a Pages artifact and deployed successfully, so the remaining publication problem was the missing path inside the artifact.

GitHub Actions documentation says exit code `0` is success and nonzero exit codes fail a step unless the shell handles them. GitHub workflow commands support `::notice`, which is now used to make recoverable live-source partial output visible without failing PR CI.

India Code and public service references confirm India Code is an official legal repository, but targeted searches did not find a public GitHub issue tracker for India Code. No upstream GitHub issue was filed.

## Options Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Remove or change the custom domain. | This could make the default `/indian-law/` URL shape work, but it is a repository settings change and would disrupt the configured `law.satyavera.in` domain. | Rejected. |
| Duplicate the full generated corpus under `docs/indian-law`. | This would make `/indian-law/` work but would duplicate roughly 27 MB of generated law Markdown in the Pages artifact. | Rejected. |
| Add a redirect from `/indian-law/` to `/`. | Avoids the 404 but does not publish the requested path as a stable route. | Rejected. |
| Generate a small `/indian-law/` shell that points assets and data at the parent root. | Adds only a tiny HTML file, preserves the requested path, and avoids corpus duplication. | Chosen. |
| Ignore every live smoke failure in PR CI. | Would hide real builder bugs. | Rejected. |
| Treat only `build-site` exit code `75` as recoverable in PR CI. | Preserves hard failures while accepting known partial-output behavior for live upstream source volatility. | Chosen. |

## Implemented Fix

`scripts/build-site.mjs` now writes the normal root app shell and, by default, an additional `indian-law/index.html` path alias. The alias shell sets `window.__INDIAN_LAW_ASSET_BASE__ = "../"` and loads parent-relative assets such as `../assets/app.js`. It is intentionally only a shell, so it does not duplicate `docs/laws` or `docs/data`.

`src/app.jsx` now routes catalog, law Markdown, and source-link fetches through a small `assetUrl()` helper. On the root site the helper keeps existing relative URLs. On `/indian-law/`, the generated shell sets the asset base to `../`, allowing the same app bundle to read the parent-published `data/` and `laws/` directories.

`.github/workflows/ci.yml` now wraps the live smoke build, captures the exit status, and treats status `75` as recoverable. Any other nonzero status still fails the job. The workflow emits a notice for the recoverable case so reviewers can see when a live upstream source caused partial output.

Regression coverage was added to:

- `tests/build-site.test.mjs` - verifies `indian-law/index.html` is generated and uses the parent asset base.
- `tests/workflow-refresh.test.mjs` - verifies PR CI handles the live smoke step's exit-75 contract.

## Data Size

Latest local size measurements are preserved in `raw/data-size-bytes.txt` and `raw/data-size-human.txt`.

At investigation time:

- `data`: `36,129,655` bytes (`36M`)
- `docs`: `51,165,790` bytes (`53M`)
- `docs/data`: `8,936,018` bytes (`8.6M`)
- `docs/laws`: `27,187,189` bytes (`30M`)
- `data/cache`: `35,080,689` bytes (`35M`)
- `docs/case-studies/issue-13`: `10,576,734` bytes (`11M`)
- `docs/indian-law/index.html`: `543` bytes
- combined `data` and `docs`: `87,295,445` bytes
- file count across `data` and `docs`: `1,353`
- refresh run Pages artifact: `10,605,020` bytes

The path alias adds one small HTML file. It avoids duplicating the generated law corpus under `docs/laws`.

## Regression Tests

Reproducing checks before the fix:

```bash
node --test --test-timeout=30000 tests/build-site.test.mjs > docs/case-studies/issue-13/raw/build-site-repro-before-fix.log 2>&1
node --test --test-timeout=30000 tests/workflow-refresh.test.mjs > docs/case-studies/issue-13/raw/workflow-repro-before-fix.log 2>&1
```

Results:

- `tests/build-site.test.mjs` failed because `/tmp/.../indian-law/index.html` did not exist.
- `tests/workflow-refresh.test.mjs` failed because the PR CI live smoke step did not capture `status=$?` or handle status `75`.

Focused checks after the fix:

```bash
node --test --test-timeout=30000 tests/build-site.test.mjs > docs/case-studies/issue-13/raw/build-site-after-fix.log 2>&1
node --test --test-timeout=30000 tests/workflow-refresh.test.mjs > docs/case-studies/issue-13/raw/workflow-after-fix.log 2>&1
```

Results:

- `tests/build-site.test.mjs`: 5/5 passing.
- `tests/workflow-refresh.test.mjs`: 3/3 passing.

## Final Verification

Full local checks:

```bash
npm test > docs/case-studies/issue-13/raw/npm-test-final.log 2>&1
git diff --check > docs/case-studies/issue-13/raw/git-diff-check.log 2>&1
node scripts/build-site.mjs --offline --output /tmp/indian-law-ci-offline-site > docs/case-studies/issue-13/raw/local-offline-build.log 2>&1
node scripts/discover-laws.mjs --limit 1 --output /tmp/indian-law-ci-discovered.lino --delay-ms 0 > docs/case-studies/issue-13/raw/local-discover-one-law.log 2>&1
node scripts/build-site.mjs --fetch --manifest data/laws.seed.lino --regional-sources data/regional-sources.seed.lino --max-laws 1 --max-sections 1 --output /tmp/indian-law-ci-live-site --delay-ms 0 > docs/case-studies/issue-13/raw/local-live-build-one-law.log 2>&1
node scripts/smoke-download-source.mjs --manifest data/laws.seed.lino --max-sources 1 --output /tmp/indian-law-ci-source --delay-ms 1100 > docs/case-studies/issue-13/raw/local-smoke-download-source.log 2>&1
```

Results:

- `npm test`: 24/24 passing.
- `git diff --check`: passing.
- offline build: generated 4 law entries and the `/indian-law/` alias shell.
- live discovery smoke: discovered 1 Central Act from India Code.
- live build smoke: generated 1 law entry with 1 fetched section.
- official source smoke: downloaded 1 source PDF, `518,938` bytes.
- local static checks: `/indian-law/`, `/assets/app.js`, and `/data/catalog.lino` all returned `200`.
- Playwright verification: `http://127.0.0.1:4173/indian-law/` rendered the 845-law catalog without console errors.

## Follow-Up Plan

1. After PR 14 lands, confirm the next Pages deployment serves both `https://law.satyavera.in/` and `https://law.satyavera.in/indian-law/`.
2. If a future PR CI live smoke reports the new recoverable notice, inspect the referenced upstream source before changing workflow behavior.
3. Keep future issue-specific logs under `docs/case-studies/issue-N/raw` so CI/CD investigations remain reproducible.
