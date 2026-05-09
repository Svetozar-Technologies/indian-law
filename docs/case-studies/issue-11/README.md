# Issue 11 CI/CD Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/11

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/12

Prepared branch: `issue-11-1fd207395b32`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Download logs and data related to the issue into `docs/case-studies/issue-11`. | Preserved issue, PR, run metadata, recent run lists, full compressed failing log, focused excerpts, and a live India Code response. |
| R2 | Reconstruct the timeline and all issue requirements. | Timeline and requirement map are documented here from GitHub issue, PR, and Actions data. |
| R3 | Find the root cause of each problem. | Root cause is a single uncached live law fetch HTTP 500 being treated as a hard build failure instead of resumable partial progress. |
| R4 | Make sure all generated data is committed in chunks as expected. | The builder now records failed laws in progress and exits with checkpoint code `75`, which the workflow already commits as partial progress. |
| R5 | Add verbose output for future debugging. | The workflow now prints pre-stage status, post-stage status, staged diff summary, created commit, and pushed commit hash. |
| R6 | Search online for additional facts and data. | India Code, GitHub Actions exit-code docs, workflow-command docs, and Actions limits are recorded in `reference-urls.txt`. |
| R7 | Check existing components or libraries that solve similar problems. | Reused the existing retrying HTTP client, law cache, refresh progress file, checkpoint exit code, and Git/GitHub Actions primitives. |
| R8 | Report upstream issues when a related GitHub project exists. | No public GitHub issue tracker for India Code was found in targeted search, so no upstream GitHub issue was filed. |

## Evidence Collected

Downloaded metadata:

- `data/issue-11.json` - issue title, body, labels, state, author, and timestamps.
- `data/issue-11-comments.json` - issue comments, empty at investigation time.
- `data/pr-12.json` - PR title, body, draft flag, commits, reviews, and check rollup.
- `data/pr-12-comments.json` - PR conversation comments, empty at investigation time.
- `data/pr-12-review-comments.json` - inline review comments, empty at investigation time.
- `data/pr-12-reviews.json` - PR reviews, empty at investigation time.
- `data/run-25597171059.json` - failing refresh run and job metadata.
- `data/main-run-list.json` - recent `main` workflow runs.
- `data/recent-issue-branch-runs.json` - recent runs on `issue-11-1fd207395b32`.
- `data/recent-merged-prs.json` - recent merged PRs used to compare style and prior related fixes.
- `data/indiacode-handle-1936-response.html` - later live fetch of the same India Code law handle.

Downloaded logs:

- `logs/refresh-laws-25597171059.log.gz` - full failing `Refresh Laws and Deploy Pages` log.
- `logs/refresh-laws-25597171059.failure-excerpt.log` - original HTTP 500 failure lines for handle `1936`.
- `logs/refresh-laws-25597171059.workflow-wrapper-excerpt.log` - original wrapper lines showing partial commit followed by hard failure.

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 09:01:26 | `Refresh Laws and Deploy Pages` run `25597171059` started on `main` at merge commit `dfe1133648fafec27230a5537a4267f60f3cf94a`. | `data/run-25597171059.json` |
| 2026-05-09 09:01:49 | Central Act discovery began and ultimately found 845 live laws. | `logs/refresh-laws-25597171059.log.gz` |
| 2026-05-09 09:02:08 to 09:03:05 | regional Legislative Department pages timed out for `bn`, `kn`, `mr`, `ta`, and `te`; these were logged as warnings and did not fail the job. | `logs/refresh-laws-25597171059.log.gz` |
| 2026-05-09 09:03:05 | `Build Pages with resumable checkpoints` started with a 110 minute runtime budget and one chunk. | `data/run-25597171059.json` |
| 2026-05-09 10:51:15 | The builder reached law 450/845, `The Vice-President s Pension Act, 1997`, with about 1m51s left in the runtime budget. | `logs/refresh-laws-25597171059.failure-excerpt.log` |
| 2026-05-09 10:51:15 to 10:51:18 | India Code returned HTTP 500 for `https://www.indiacode.nic.in/handle/123456789/1936` on all three attempts. | `logs/refresh-laws-25597171059.failure-excerpt.log` |
| 2026-05-09 10:51:18 | The workflow still staged and committed generated partial data as `Refresh generated law pages (chunk 1)`, creating commit `53fbbea`. | `logs/refresh-laws-25597171059.workflow-wrapper-excerpt.log` |
| 2026-05-09 10:51:20 | After pushing the partial commit, the wrapper treated builder exit code `1` as a hard failure and exited the job with status failure. | `logs/refresh-laws-25597171059.workflow-wrapper-excerpt.log` |
| 2026-05-09 12:09:16 | Issue 11 was opened with the failing job link and requested a full case study plus fix. | `data/issue-11.json` |
| 2026-05-09 12:10:00 | Draft PR 12 CI passed on the placeholder branch because it only ran PR checks, not the full scheduled refresh path. | `data/pr-12.json` |
| 2026-05-09 12:12:29 | A later direct fetch of the same India Code handle succeeded and returned the Vice-President's Pension Act metadata. | `data/indiacode-handle-1936-response.html` |

## Root Cause

The previous fixes made checkpoint commits work, but the builder still had a fail-fast path for uncached live law fetches. In run `25597171059`, `scripts/build-site.mjs` had successfully processed and cached 449 laws. The next uncached law was `The Vice-President s Pension Act, 1997`, handle `1936`. India Code returned HTTP 500 three times, so `fetchText` threw.

That exception escaped the per-law loop. The top-level `main().catch` converted it into process exit code `1`. The workflow wrapper did commit and push the generated partial data, but after the push it saw status `1`, emitted `::error::Refresh failed with exit code 1.`, and failed the run.

This made a transient upstream error look like a broken repository CI/CD failure. It also stopped the builder before it could write a final partial catalog and progress file that identifies the failed law and preserves enough state for the next refresh iteration to retry it.

## Source Findings

The later live India Code response for handle `1936` identifies the target as `The Vice-President s Pension Act, 1997`, Act ID `199730`, with English and Hindi PDF links. That supports treating the CI failure as an upstream transient HTTP 500, not as a permanently invalid source URL.

GitHub Actions documentation states that exit code `0` maps to success and nonzero exit codes map to failure. The repository already uses checkpoint exit code `75` as an internal signal that the workflow wrapper handles as resumable partial progress, so mapping per-law upstream failures to the same checkpoint path matches the existing workflow contract.

GitHub workflow command documentation supports the existing `::notice` and `::error` annotations used by the refresh workflow. The fix keeps hard errors for unexpected wrapper failures and uses checkpoint status for recoverable live-source failures.

GitHub Actions limits documentation reinforces the need for bounded refresh chunks rather than one long all-or-nothing live scrape. The current one-chunk default remains appropriate when every run can commit useful partial data.

## Options Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Increase retries or timeout for India Code fetches. | Might hide some transient failures but does not solve a persistent 500 and can burn the remaining runtime budget. | Rejected. |
| Let the workflow ignore all builder exit code `1` failures after committing. | Would make CI green for real builder bugs and data corruption. | Rejected. |
| Pre-seed or hardcode the failing law cache. | Solves only handle `1936` and leaves the next upstream 500 unfixed. | Rejected. |
| Catch per-law live fetch failures, record them in refresh progress, emit partial output, and exit with checkpoint code `75`. | Preserves successful work, makes the failed law visible, and retries naturally on the next refresh because no cache is written for failed laws. | Chosen. |

## Implemented Fix

`scripts/build-site.mjs` now catches failures from a single live law fetch after cache lookup. A failed law is written into refresh progress with:

- `status: "failed"`
- `error: <original error message>`
- source URL, cache path, title, slug, and zero fetched sections

The builder continues with the remaining laws, writes the catalog, finalizes progress with `partialRefresh: true`, and exits with checkpoint code `75`. That is the same resumable code the workflow already treats as committed partial progress.

The workflow now prints additional checkpoint diagnostics:

- workspace status before staging
- workspace status after staging
- staged diff summary
- created checkpoint commit hash
- pushed checkpoint commit hash

## Regression Test

`tests/build-site.test.mjs` now includes a live-build test with a local HTTP server. The first law returns `200`, the second law returns `500` for all three retry attempts. Before the fix, the test reproduced the bug with exit code `1`. After the fix, it verifies:

- builder exit code is `75`
- partial catalog is written
- successful law cache is preserved
- progress status is `partial`
- `completedLaws` is `1`
- `failedLaws` is `1`
- failed law status and HTTP 500 error are recorded

`tests/workflow-refresh.test.mjs` now verifies that the refresh workflow includes checkpoint staging diagnostics.

## Verification

Reproducing failure before the fix:

```bash
node --test --test-timeout=30000 tests/build-site.test.mjs > ci-logs/build-site-repro-before-fix.log 2>&1
```

Result: the new regression failed with actual exit code `1` instead of expected checkpoint exit code `75`.

Focused checks after the fix:

```bash
node --test --test-timeout=30000 tests/build-site.test.mjs > ci-logs/build-site-after-fix.log 2>&1
node --test --test-timeout=30000 tests/workflow-refresh.test.mjs > ci-logs/workflow-refresh-after-fix.log 2>&1
```

Results:

- `tests/build-site.test.mjs`: 5/5 passing.
- `tests/workflow-refresh.test.mjs`: 2/2 passing.

Full local checks before finalizing:

```bash
npm test > ci-logs/npm-test-final.log 2>&1
git diff --check > ci-logs/git-diff-check.log 2>&1
git diff --cached --check > ci-logs/git-diff-check-staged.log 2>&1
node scripts/build-site.mjs --offline --output /tmp/indian-law-ci-offline-site > ci-logs/local-offline-build.log 2>&1
node scripts/discover-laws.mjs --limit 1 --output /tmp/indian-law-ci-discovered.lino --delay-ms 0 > ci-logs/local-discover-one-law.log 2>&1
node scripts/build-site.mjs --fetch --manifest data/laws.seed.lino --regional-sources data/regional-sources.seed.lino --max-laws 1 --max-sections 1 --output /tmp/indian-law-ci-live-site --delay-ms 0 > ci-logs/local-live-build-one-law.log 2>&1
node scripts/smoke-download-source.mjs --manifest data/laws.seed.lino --max-sources 1 --output /tmp/indian-law-ci-source --delay-ms 1100 > ci-logs/local-smoke-download-source.log 2>&1
```

Results:

- `npm test`: 23/23 passing.
- `git diff --check` and `git diff --cached --check`: passing.
- offline build: generated 4 law entries.
- live discovery smoke: discovered 1 law.
- live build smoke: generated 1 law entry after fetching 1 section.
- official source smoke: downloaded 1 source PDF.
