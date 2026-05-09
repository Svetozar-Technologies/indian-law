# Issue 7 CI/CD Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/7

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/8

Prepared branch: `issue-7-6572af923ca3`

## Requirement Map

- Use repository-owned `.lino` files, not JSON metadata, for generated progress and cache data.
- Make checkpointed live refreshes succeed when they have committed partial docs, cache, and progress.
- Commit loaded laws, refresh progress, and generated Markdown from GitHub Actions.
- Stop the scheduled/manual refresh well before a six-hour Actions run when it has already been running for about two hours.
- Preserve the CI and refresh logs, plus a written case study, under `docs/case-studies/issue-7`.

## Evidence Collected

Downloaded full logs:

- `logs/issue-link-25573719113.log.gz` - issue-linked refresh workflow from `2026-05-08T18:55:18Z`.
- `logs/pr-8-ci-25589319973.log.gz` - PR CI workflow from `2026-05-09T02:36:02Z`.

Focused excerpts:

- `logs/issue-link-25573719113.failure-excerpt.log` keeps original log lines `137360` through `137405`.
- `logs/issue-link-25573719113.timeline.log` keeps chunk, checkpoint, commit, and terminal failure lines.
- `logs/pr-8-ci-25589319973.failure-excerpt.log` keeps original log lines `220` through `305`.

Structured metadata:

- `data/issue-7.lino` - issue title, body, labels, state, and URL.
- `data/pr-8.lino` - pull request title, body, state, draft flag, branch, and commits.
- `data/ci-runs.lino` - branch run list plus the issue-linked and PR run job metadata.

## Timeline

The issue-linked refresh run `25573719113` was created at `2026-05-08T18:55:18Z`; the `Refresh Official Sources` job started at `2026-05-08T18:55:28Z`.

The resumable build started chunk 1 at `2026-05-08T18:56:48Z`. It committed partial output after each checkpoint:

- chunk 1 commit around `2026-05-08T19:52:41Z`
- chunk 2 commit around `2026-05-08T20:55:02Z`
- chunk 3 commit around `2026-05-08T21:50:10Z`
- chunk 4 commit around `2026-05-08T22:50:14Z`
- chunk 5 commit around `2026-05-08T23:45:37Z`
- chunk 6 commit around `2026-05-09T00:52:16Z`

The sixth chunk still exited with checkpoint code `75`; the workflow then converted that resumable state into a hard failure at original log lines `137389` through `137392`: `Refresh did not complete after 6 checkpoint chunks` followed by `Process completed with exit code 1`.

The PR CI run `25589319973` was created at `2026-05-09T02:36:02Z`. Its test step failed at `2026-05-09T02:36:25Z` in `tests/lino.test.mjs:76` because `data/cache/laws/*.json` files were committed under the owned data tree.

## Root Cause

There were two independent failures.

First, the repository had introduced live law cache files as JSON under `data/cache/laws`. The existing test `owned data directories do not store JSON metadata` intentionally rejects JSON metadata in owned data paths, so PR CI failed before it reached the Pages build or smoke checks.

Second, the refresh workflow treated a normal checkpoint as a failure once it reached `MAX_CHUNKS`. The logs show that each checkpoint wrote partial `docs/` output and pushed a commit, but after chunk 6 the workflow still emitted an Actions error and exited `1`. The scheduled run therefore looked failed even though it had made useful forward progress.

The workflow defaults also allowed one run to spend about six hours on refresh work: six chunks with a 55-minute checkpoint budget and a 360-minute job timeout. That did not match the issue requirement to stop around the two-hour mark and continue from committed progress later.

## External References

The investigation checked official GitHub documentation for Actions limits and custom GitHub Pages workflows:

- https://docs.github.com/en/actions/reference/limits
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

The workflow action versions were checked against the current GitHub releases on `2026-05-09`:

- `actions/configure-pages@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

All URLs used during the investigation are listed in `reference-urls.txt`.

## Fix

The site builder now writes live law cache files as `.lino` files and writes a refresh status file at `data/cache/refresh-status.lino`. The progress file records selected laws, cache file paths, per-law status, completed and pending counts, timestamps, and whether the output is partial.

The builder still reads a same-basename legacy `.json` cache when no `.lino` cache exists. That keeps local migration practical without committing JSON metadata again.

The refresh workflow now stages `docs/`, `data/cache`, discovered manifests, and the progress file before committing. A checkpoint exit code `75` at the final chunk is reported as a notice, not a failed run. The default push/schedule behavior is one 110-minute chunk with a 130-minute job timeout, so a scheduled refresh can publish partial progress and stop before a six-hour run.

The workflow now deploys Pages from the committed `docs/` artifact with the official Pages Actions flow. PR CI builds the deterministic offline site in `/tmp/indian-law-ci-offline-site` so it still validates the builder without overwriting live generated `docs/` content during the check.

## Verification

Local test command:

```bash
npm test > ci-logs/local-npm-test-final.log 2>&1
```

Result: 20 tests passed.

Offline build command:

```bash
node scripts/build-site.mjs --offline --output /tmp/indian-law-final-offline-site > ci-logs/local-offline-build-final.log 2>&1
```

Result: generated 4 seed law entries in `/tmp/indian-law-final-offline-site`.

Cache parse check:

```bash
node --input-type=module <inline cache parser> > ci-logs/local-cache-lino-parse-final.log 2>&1
```

Result: parsed 323 Lino cache files with 13,427 cached sections.
