# Issue 15 Refresh Cache Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/15

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/16

Prepared branch: `issue-15-3b7dcdf82f3e`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Do not re-download laws that are already downloaded, processed, and ready for catalog display for at least one month. | Existing complete-cache behavior was verified and preserved: fresh complete `.lino` law caches still skip all law and section fetches for the configured 30-day TTL. |
| R2 | Continue syncing laws that were not fully downloaded, and fetch only unsynced data on future scheduled/manual runs. | Implemented section-level resume for incomplete caches. A full refresh now reuses cached sections and requests only missing `SectionPageContent` payloads. |
| R3 | Keep CI/CD refreshes below the requested two-hour safety window and commit partial progress for later continuation. | The workflow already has a 130-minute job timeout and a 110-minute checkpoint budget. The builder now also checks the runtime budget between section fetches, so a very large law can be checkpointed mid-law. |
| R4 | Investigate the referenced long refresh run and preserve logs. | Run `25607344338` metadata, a compressed full log, and targeted excerpts are stored under this case study. The run completed successfully in about 1h52m and checkpointed with 185 laws pending. |
| R5 | Check `https://law.satyavera.in/indian-law` for publication and catalog correctness signals. | Live checks show the path redirects to `/indian-law/` and returns `200`. The live catalog has 845 laws, partial refresh metadata, 617 English markdown laws, and 228 source-only English entries, matching the local generated catalog. |
| R6 | Collect issue-related data under `docs/case-studies/issue-15`. | Issue, PR, CI, live-site, test, source-reference, and log evidence are committed here. |
| R7 | Search online for additional facts and data. | Official India Code and GitHub Actions references are recorded in `reference-urls.txt`. |
| R8 | Check existing components/libraries before changing code. | Reused the existing `.lino` cache format, Node test runner, build-site progress model, GitHub Actions checkpoint wrapper, and built-in fetch client rather than adding a new cache library. |

## Evidence Collected

- `data/issue-15.json` and `data/issue-15-comments.json` - issue details and comments.
- `data/pr-16.json` - prepared PR metadata before implementation.
- `data/recent-branch-runs.json` - current branch CI run list.
- `data/run-25607344338.json` - referenced refresh run metadata.
- `logs/refresh-laws-25607344338.log.gz` - compressed full referenced run log.
- `logs/refresh-laws-25607344338.workflow-excerpt.log` - workflow wrapper and checkpoint arguments.
- `logs/refresh-laws-25607344338.partial-commit-excerpt.log` - partial build and checkpoint commit excerpt.
- `logs/refresh-laws-25607344338.tail-excerpt.log` - Pages artifact upload and deploy tail.
- `data/live-indian-law.headers.txt` and `data/live-indian-law.html` - live `/indian-law` response.
- `data/live-catalog-summary.json` and `data/live-catalog.lino.gz` - live catalog summary plus compressed raw catalog.
- `data/resume-cache-repro-before.log` and `data/resume-cache-after.log` - focused regression before/after logs.
- `data/npm-test.log` and `data/git-diff-check.log` - final local verification logs.
- `data/evidence-file-list.txt` - case-study file inventory.

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 17:31:48 | Referenced `Refresh Laws and Deploy Pages` run `25607344338` started on `main` at `d6753493`. | `data/run-25607344338.json` |
| 2026-05-09 17:32:21 | Central Act discovery completed with 845 live laws. | `logs/refresh-laws-25607344338.log.gz` |
| 2026-05-09 17:32:27 to 17:33:19 | Regional source discovery hit repeated 20-second timeouts for several Legislative Department pages, logged as warnings, and continued. | `logs/refresh-laws-25607344338.log.gz` |
| 2026-05-09 17:33:19 | The builder started with `--cache-ttl-days 30`, `--progress-file data/cache/refresh-status.lino`, and `--max-runtime-ms 6600000`. | `logs/refresh-laws-25607344338.workflow-excerpt.log` |
| 2026-05-09 19:23:49 | The builder wrote partial output: 845 catalog entries, 0 failed laws, 185 pending laws. | `logs/refresh-laws-25607344338.partial-commit-excerpt.log` |
| 2026-05-09 19:23:49 | The workflow staged generated docs/cache and committed the checkpoint. | `logs/refresh-laws-25607344338.partial-commit-excerpt.log` |
| 2026-05-09 19:24:00 | GitHub Pages deployment reported success. | `logs/refresh-laws-25607344338.tail-excerpt.log` |
| 2026-05-09 19:36:57 | Current issue branch CI run `25609991552` started after the branch commit `e099bba` and passed. | `data/recent-branch-runs.json` |
| 2026-05-09 19:45:37 | Live `/indian-law` returned `301` to `/indian-law/`, then `200` with the app shell. | `data/live-indian-law.headers.txt` |

## Source Findings

The Government Services Portal describes India Code as a digital repository for Central, State, and Union Territory enactments and subordinate legislation that are in force and searchable by title, date, act number, act year, and free text. This supports using India Code as the primary official source for the generated catalog, while still minimizing repeated requests against that service.

GitHub Actions documentation currently states that GitHub-hosted runner jobs have a 6-hour execution limit, and workflow syntax documentation states `jobs.<job_id>.timeout-minutes` defaults to 360 minutes. The repository refresh workflow intentionally stays below those limits with `timeout-minutes: 130` and an internal default `checkpoint_minutes: 110`.

The live publication check found no path-level publication failure for issue 15. `https://law.satyavera.in/indian-law` redirected to the slash form and served the same generated shell style as the repository. The live catalog summary matches local generated data: 845 laws, `partialRefresh: true`, 617 English markdown entries, and 228 English source-only entries.

## Root Cause

Complete cache entries already satisfied the one-month no-refresh requirement: `scripts/build-site.mjs` reads a fresh cache, verifies it represents a complete fetch, and returns it before any live source request.

The missing behavior was resumability for incomplete cache entries. A cache created by a diagnostic `--max-sections` run, or by future mid-law checkpointing, had `completeFetch: false`. A later full refresh correctly rejected that cache as insufficient, but then fetched the law from scratch. That re-requested section payloads that were already present in the repository cache.

The runtime budget was also checked only before each law. That was good enough for normal laws in the referenced run, but a large law could keep fetching sections after the checkpoint budget was already exhausted. The workflow would still have the outer 130-minute job timeout, but the builder had no chance to checkpoint in the middle of that law.

## Options Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Keep only whole-law caching. | Simple, already implemented, but incomplete caches cannot continue from already fetched sections. | Rejected. |
| Add a third-party HTTP/cache library. | Could offer a generic cache, but the repository already stores reviewable law-level `.lino` data and needs domain-specific section progress. | Rejected. |
| Store each section as a separate file. | Maximizes granular resume, but creates many more files and a larger review surface. | Deferred; not needed for this fix. |
| Resume from incomplete law `.lino` caches by section ID. | Preserves the current cache format, avoids duplicate section downloads, and keeps the generated data reviewable. | Chosen. |
| Only rely on the workflow job timeout. | Prevents exceeding GitHub limits, but does not let the builder write an intentional checkpoint before termination. | Rejected. |
| Check runtime budget between section fetches. | Keeps the existing law-level flow while allowing a mid-law partial cache and progress file. | Chosen. |

## Implemented Fix

`scripts/build-site.mjs` now separates fresh complete cache acceptance from incomplete cache reuse. Fresh complete caches still short-circuit live fetching for the configured TTL. Incomplete caches are used as resume seeds: when the live law page lists sections, cached sections are merged by `sectionId`, and only missing section payloads are fetched.

The builder now records cache metadata with `sectionCount` and `totalSections`, and progress files include `partialLaws`. If the runtime budget is exhausted between section fetches, the current law is saved with status `partial`, the cache is written with the fetched subset, the site/progress output is generated, and exit code `75` tells the workflow to commit the checkpoint.

`SectionPageContent` URLs are now derived from the source page origin instead of being hardcoded. For India Code this still resolves to `https://www.indiacode.nic.in/SectionPageContent`; for tests it lets the local fixture server prove that cached sections are not requested again.

## Regression Tests

Focused reproduction before the fix:

```bash
node --test --test-timeout=30000 --test-name-pattern "resumes an incomplete cached law" tests/build-site.test.mjs > docs/case-studies/issue-15/data/resume-cache-repro-before.log 2>&1
```

Result: failed because the refresh did not request the local missing section endpoint; it ignored the partial cache path for full refresh continuation.

Focused verification after the fix:

```bash
node --test --test-timeout=30000 --test-name-pattern "resumes an incomplete cached law" tests/build-site.test.mjs > docs/case-studies/issue-15/data/resume-cache-after.log 2>&1
```

Result: passed. The test asserts one live law landing request, zero requests for the cached section, one request for the missing section, a complete two-section cache after the run, and a complete progress file.

Full local verification:

```bash
npm test > docs/case-studies/issue-15/data/npm-test.log 2>&1
git diff --check > docs/case-studies/issue-15/data/git-diff-check.log 2>&1
```

Results:

- `npm test`: 25/25 passing.
- `git diff --check`: passing.

## Follow-Up Plan

1. Let the scheduled/manual refresh continue from the 185 pending laws recorded in `data/cache/refresh-status.lino`.
2. If future logs show a single law consuming most of the checkpoint window, inspect `partialLaws` and the law cache's `sectionCount`/`totalSections` to confirm mid-law resume is progressing.
3. Keep using the 30-day complete-cache TTL unless the official source freshness policy changes.
