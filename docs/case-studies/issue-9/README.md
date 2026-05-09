# Issue 9 CI/CD Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/9

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/10

Prepared branch: `issue-9-8ae4bcbc4698`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Download logs and data related to the issue into `docs/case-studies/issue-9`. | Preserved issue, PR, run metadata, recent main run list, full compressed failing log, and focused excerpts under `data/` and `logs/`. |
| R2 | Reconstruct the timeline and requirements. | Timeline and requirements are documented here from GitHub issue, PR, and Actions data. |
| R3 | Find the root cause of each problem. | Root cause is the refresh workflow attempting to `git add` two ignored generated manifests without `-f`. |
| R4 | Search online for additional facts and data. | Official Git and GitHub documentation is listed in `reference-urls.txt` and summarized below. |
| R5 | Check existing components or libraries that solve or help with similar problems. | Reused Git's `git add -f`, `git check-ignore -v`, GitHub Actions workflow commands, existing checkpoint workflow logic, and Node's built-in test runner. |
| R6 | Make partial data download work even if the full refresh checkpoints. | The workflow now force-adds the ignored discovery manifests so checkpoint commits can be created instead of failing during staging. |
| R7 | Keep law text in Markdown and metadata in Links Notation. | Existing builder behavior is preserved: generated law parts remain Markdown and catalogs/progress/cache remain `.lino`. |
| R8 | Fix CI/CD in one pull request and verify locally. | Implemented in PR 10 with a workflow regression test and CI-equivalent local checks. |

## Evidence Collected

Downloaded metadata:

- `data/issue-9.json` - issue title, body, state, author, and timestamps.
- `data/issue-9-comments.json` - issue comments, empty at investigation time.
- `data/pr-10.json` - PR title, body, draft flag, commits, and check rollup.
- `data/pr-10-review-comments.json` - inline review comments, empty at investigation time.
- `data/pr-10-reviews.json` - PR reviews, empty at investigation time.
- `data/main-run-list.json` - recent `main` workflow runs.
- `data/run-25589834858.json` - failing refresh run and job metadata.

Downloaded logs:

- `logs/refresh-laws-25589834858.log.gz` - full failing `Refresh Laws and Deploy Pages` log.
- `logs/refresh-laws-25589834858.workflow-wrapper-excerpt.log` - original workflow wrapper lines around the checkpoint commit function.
- `logs/refresh-laws-25589834858.failure-excerpt.log` - original terminal failure lines.

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 02:59:42 | `Refresh Laws and Deploy Pages` run `25589834858` started on `main` at merge commit `6e8587f7b006b2fcb73756e512c122d0a93c4920`. | `data/run-25589834858.json` |
| 2026-05-09 02:59:56 | `Discover Central Acts` began with full discovery (`FETCH_LIMIT=0`) and wrote the live manifest path `data/laws.discovered.lino`. | `logs/refresh-laws-25589834858.log.gz` |
| 2026-05-09 03:00:26 to 03:01:12 | regional Legislative Department pages timed out and were recorded as warnings for `bn`, `kn`, `mr`, `ta`, and `te`; these warnings did not fail the job. | original log lines 1103-1158 |
| 2026-05-09 03:01:12 | `Build Pages with resumable checkpoints` started with a 110 minute runtime budget and one chunk. | `logs/refresh-laws-25589834858.workflow-wrapper-excerpt.log` |
| 2026-05-09 04:51:26 | `scripts/build-site.mjs` wrote partial docs and progress, then exited with checkpoint code `75`, which the wrapper expected to handle as resumable progress. | original log lines 38861-38868 |
| 2026-05-09 04:51:26 | The wrapper staged `docs`, then failed on `git add data/laws.discovered.lino data/regional-sources.discovered.lino` because both files are ignored by `.gitignore`. | original log lines 38875-38884 |
| 2026-05-09 08:45:44 | Issue 9 was opened with the failing Actions job link and the request for a full case study plus fix. | `data/issue-9.json` |
| 2026-05-09 08:48:12 | Draft PR 10 was created from `issue-9-8ae4bcbc4698`; initial placeholder CI passed because it did not touch the refresh workflow failure path. | `data/pr-10.json` |

## Root Cause

The failing refresh did not fail because India Code was unreachable and did not fail because `build-site.mjs` checkpointed. The terminal error happened after partial site output was generated.

The repository intentionally ignores:

- `data/laws.discovered.lino`
- `data/regional-sources.discovered.lino`

The refresh workflow then attempted to stage those exact ignored paths with:

```bash
git add data/laws.discovered.lino data/regional-sources.discovered.lino
```

Git refuses exact ignored pathspecs unless they are force-added. The failure excerpt shows Git emitted `The following paths are ignored by one of your .gitignore files`, suggested `Use -f`, and the Actions step ended with exit code `1`.

This broke the issue requirement that partial data download remain useful after a checkpoint. The build had already written partial docs and `data/cache/refresh-status.lino`, but the workflow never reached `git commit` or `git push`, so that partial progress was lost.

## Source Findings

The official Git documentation says `git add` does not add ignored files by default and that `--force` allows adding otherwise ignored files:

https://git-scm.com/docs/git-add

GitHub Actions workflow commands support `::notice` and `::error` annotations. The existing workflow already uses notices for checkpoint progress and errors for hard failures, so preserving that distinction is appropriate:

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

GitHub Pages custom workflows support building Pages artifacts through Actions with `configure-pages`, `upload-pages-artifact`, and `deploy-pages`; the existing Pages deployment flow remains valid:

https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Options Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Remove the discovered manifest entries from `.gitignore`. | Makes local generated discovery files show up in normal developer status, increasing accidental churn. | Rejected. |
| Ignore staging errors with `git add ... || true`. | Would let the workflow continue but silently omit discovery manifests from checkpoint commits. | Rejected. |
| Stage only `docs` and `data/cache`. | Keeps the workflow green but loses the live discovered manifests needed to reproduce the refresh. | Rejected. |
| Force-add only the two ignored discovery manifests. | Keeps local ignore behavior while allowing the workflow to intentionally preserve generated checkpoint inputs. | Chosen. |

## Implemented Fix

`.github/workflows/refresh-laws.yml` now stages ignored discovery manifests with:

```bash
git add -f data/laws.discovered.lino data/regional-sources.discovered.lino
```

The change is intentionally scoped to the generated manifests. The workflow still stages `docs` and `data/cache` through normal `git add`, so unrelated ignored files are not swept into checkpoint commits.

`tests/workflow-refresh.test.mjs` is a regression test for the contract between `.gitignore` and the refresh workflow. It verifies that both discovered manifest paths are ignored and that the workflow force-adds exactly those paths before checkpoint commits.

## Verification

Reproducing test before the fix:

```bash
npm test > ci-logs/npm-test-repro.log 2>&1
```

Result: the new workflow test failed with actual `git add data/laws.discovered.lino data/regional-sources.discovered.lino` and expected `git add -f data/laws.discovered.lino data/regional-sources.discovered.lino`. The fresh workspace also needed `npm ci` before unrelated dependency-backed tests could run.

Final local checks:

```bash
npm ci > ci-logs/npm-ci.log 2>&1
npm test > ci-logs/npm-test-final.log 2>&1
node scripts/build-site.mjs --offline --output /tmp/indian-law-ci-offline-site > ci-logs/local-offline-build.log 2>&1
node scripts/discover-laws.mjs --limit 1 --output /tmp/indian-law-ci-discovered.lino --delay-ms 0 > ci-logs/local-discover-one-law.log 2>&1
node scripts/build-site.mjs --fetch --manifest data/laws.seed.lino --regional-sources data/regional-sources.seed.lino --max-laws 1 --max-sections 1 --output /tmp/indian-law-ci-live-site --delay-ms 0 > ci-logs/local-live-build-one-law.log 2>&1
node scripts/smoke-download-source.mjs --manifest data/laws.seed.lino --max-sources 1 --output /tmp/indian-law-ci-source --delay-ms 1100 > ci-logs/local-smoke-download-source.log 2>&1
```

Results:

- `npm test`: 21 tests passed.
- offline build: generated 4 law entries.
- one-law discovery: discovered 1 Central Act from India Code.
- one-law live build: generated 1 law entry with 1 fetched section.
- source smoke download: downloaded 1 official PDF source, 518,938 bytes.

## Follow-Up Plan

1. After PR 10 lands, rerun or wait for the next `Refresh Laws and Deploy Pages` run on `main` and confirm checkpoint commits are created.
2. If a future run fails after staging, preserve the new failure log under this case-study folder before changing workflow behavior again.
3. Consider adding an explicit workflow dry-run script only if more shell contracts accumulate; the current regression is intentionally minimal.
