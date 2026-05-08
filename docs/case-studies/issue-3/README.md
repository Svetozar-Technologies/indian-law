# Case Study: Refresh Workflow Discovery Failure

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/3

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/4

Prepared branch: `issue-3-34d13ae65238`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Download all logs and data related to the issue into `docs/case-studies/issue-3`. | Preserved issue, PR, run, job, branch run lists, failing workflow log, PR CI log, and live smoke sample outputs under `data/`. |
| R2 | Reconstruct the timeline and requirements. | Timeline and requirement map are documented here from GitHub issue and Actions data. |
| R3 | Find root causes for each problem. | Root causes are split into live discovery fragility and missing PR-level coverage. |
| R4 | Search online for additional facts and data. | Reference URLs include the official India Code service description and GitHub Actions event documentation. |
| R5 | Check existing components or libraries that can help. | Reused repository seed manifests, `readDataFile`/`writeDataFile`, Node's built-in test runner, and a local `node:http` server for deterministic failure simulation. |
| R6 | Add debug output or verbose mode if data is not enough. | `scripts/discover-laws.mjs` now records listing errors in the generated `.lino` manifest and supports `--verbose` fetch tracing. |
| R7 | Fix CI/CD and ensure PR checks can prove at least one law can be downloaded. | PR CI now runs Central Act discovery and a one-law, one-section live site build in addition to offline checks and source download smoke. |
| R8 | Use a single PR and keep the branch ready for review. | Implemented in PR 4 on `issue-3-34d13ae65238`. |

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-08 14:49:25 | `Refresh Laws and Deploy Pages` started on `main` after merge commit `2afc3bef39bef1f7c64dab10d673f79eb189a4cf`. | `data/refresh-laws-25562199995.run.json` |
| 2026-05-08 14:49:44 | Step `Discover Central Acts` ran `node scripts/discover-laws.mjs --limit "$FETCH_LIMIT" --output data/laws.discovered.lino --delay-ms 1100` with `FETCH_LIMIT=0`. | `data/refresh-laws-25562199995.log` |
| 2026-05-08 14:49:48 | The step failed with `HTTP 404 Not Found` from the India Code Central Acts `simple-search` URL. | `data/refresh-laws-25562199995.log` |
| 2026-05-08 14:59:25 | Issue 3 was opened with the failing Actions job link and the request for this case study and fix. | `data/issue-3.github.json` |
| 2026-05-08 15:00:20 | Initial PR 4 CI passed on the placeholder commit. It did not run Central Act discovery or a live law build. | `data/runs-issue-3-branch.json`, `data/ci-25562741448.log` |
| 2026-05-08 15:03 UTC | Local reproduction confirmed the one-law live discovery and one-law live build can succeed when India Code responds. | `data/live-discovery-sample.lino`, `data/live-build-sample-catalog.lino` |

## Source Findings

India Code is an official digital repository for Central, State, and Union Territory enactments and subordinate legislation. The National Government Services Portal describes it as searchable by Short Title, Enactment Date, Act Number, Act Year, and free text search:

https://services.india.gov.in/service/detail/india-code-digital-repository-of-all-central-and-state-acts

The failed workflow used India Code's Central Acts collection search endpoint:

https://www.indiacode.nic.in/handle/123456789/1362/simple-search

GitHub Actions scheduled workflows only run on the default branch, and scheduled events can be delayed or dropped during high-load periods. That makes PR-level coverage important for discovery and fetch logic before scheduled/default-branch refreshes run:

https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Root Causes

### RC1: Live Discovery Treated One Listing Error as Fatal

`scripts/discover-laws.mjs` already intended to preserve seed laws when the live listing produced no rows, but it did not catch `fetchText` errors. When India Code returned `HTTP 404 Not Found`, the script exited before writing `data/laws.discovered.lino`, so the refresh workflow stopped before regional discovery, build, Pages upload, and deploy.

The root failure is visible in `data/refresh-laws-25562199995.log` lines 146-157.

### RC2: PR CI Did Not Exercise the Failing Path

The existing PR CI covered unit tests, deterministic offline build, committed `docs` output, and a single official source download. It did not run:

- `scripts/discover-laws.mjs` against the Central Acts listing.
- `scripts/build-site.mjs --fetch` against one real law page and one section JSON payload.

Because of that gap, PR 4's initial CI could pass even though the default-branch refresh workflow failed minutes earlier.

## Implemented Fix

`scripts/discover-laws.mjs` now:

- accepts `--search-url`, `--retries`, `--retry-delay-ms`, and `--timeout-ms` for deterministic tests and diagnostics;
- catches listing fetch errors;
- writes `discoveryStatus` as `complete`, `partial`, or `seed-fallback`;
- records errors in the generated `.lino` manifest;
- uses seed laws when no live rows are available;
- supports `--verbose` request tracing without enabling noisy output by default.

The regression test `tests/discover-laws.test.mjs` starts a local HTTP server that always returns 404 and verifies that discovery still writes a seed-backed `.lino` manifest with the recorded error.

`.github/workflows/ci.yml` now adds PR checks for:

- one Central Act discovery sample;
- one live law build from `data/laws.seed.lino` with `--max-laws 1 --max-sections 1`;
- the previous official source download smoke.

## Alternatives Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Keep failing whenever India Code listing returns an error. | Strict, but a transient external 404 or 502 blocks Pages refresh entirely. | Rejected. |
| Always use only seed laws in CI. | Deterministic, but it would not cover the live failure path from issue 3. | Rejected for PR CI. |
| Add a new HTTP mocking library such as `nock`. | Useful for larger suites, but unnecessary for one script-level regression. | Rejected to avoid dependency churn. |
| Use the existing seed manifest as fallback when discovery is unavailable. | Keeps refreshes deployable and records the failure for later analysis. | Chosen. |

## Verification Data

- `data/refresh-laws-25562199995.log` - original failing refresh log.
- `data/ci-25562741448.log` - initial PR CI log showing the previous coverage.
- `data/live-discovery-sample.lino` - successful bounded live discovery after the fix.
- `data/live-build-sample-catalog.lino` - successful bounded live law build after the fix.
- `data/runs-main.json` and `data/runs-issue-3-branch.json` - run lists used to verify timestamps and SHAs.

## Follow-Up Plan

1. Add a refresh diagnostics artifact if future failures need generated `.lino` outputs preserved directly from Actions.
2. Add periodic link checking after the first full deployed Pages artifact is stable.
3. Consider a larger live smoke matrix only after the one-law smoke proves stable enough not to make PRs noisy.
