# Issue 5 Case Study: Refresh Workflow Ran for Hours Without Useful Logs

## Evidence Preserved

- Issue data: `data/issue-5.json`
- Pull request data: `data/pr-6.json`
- Cancelled refresh run metadata: `data/run-25563554391.json`
- Cancelled refresh run log: `logs/refresh-laws-25563554391.log`
- Passing PR CI metadata and log: `data/recent-issue-branch-runs.json`, `logs/ci-25570875235.log`
- Issue and PR comments/reviews: `data/issue-5-comments.json`, `data/pr-6-comments.json`, `data/pr-6-review-comments.json`, `data/pr-6-reviews.json`
- Online references: `data/reference-urls.txt`

## Timeline

- 2026-05-08 15:16:39 UTC: workflow run `25563554391` started on `main` at `a5b818c5fd979a25db0412793aefcdb384cbaf48`.
- 2026-05-08 15:17:18 UTC: `Discover Central Acts` completed and wrote 845 laws.
- 2026-05-08 15:18:15 UTC: `Discover Regional Language Sources` completed and wrote 0 regional sources.
- 2026-05-08 15:18:15 UTC: `Build Pages from all active official sources` started.
- 2026-05-08 17:50:37 UTC: the build step was cancelled after roughly 2 hours 32 minutes with no build-progress output between start and cancellation.
- 2026-05-08 17:53:33 UTC: PR 6 was opened for issue 5.
- 2026-05-08 17:53:53 UTC: PR CI run `25570875235` completed successfully for the initial branch state.

## Requirements From The Issue

- Make the long-running refresh understandable from logs.
- Stop publishing the generated site only as a Pages artifact; generated Markdown under `docs/` must be committed so branch-based GitHub Pages can serve it.
- Preserve partial progress after about an hour of loading work.
- Continue from previously downloaded documents instead of re-downloading documents fetched less than one month ago.
- Preserve issue evidence under `docs/case-studies/issue-5`.
- Reconstruct timeline, requirements, root causes, and solution options.
- Add debug or verbose output if more root-cause data is needed.

## Root Causes

1. `scripts/build-site.mjs` fetched every discovered law and every section before writing final output. The failed run discovered 845 laws, so one slow full refresh involved many remote India Code requests plus the configured 1100 ms inter-request delay.
2. The build step emitted no per-law or per-section progress. GitHub Actions showed only the shell command at 15:18:15 UTC and then cancellation at 17:50:37 UTC.
3. Runner-local work was not persisted until the whole build finished. Cancelling the job discarded any documents already fetched in memory.
4. `.github/workflows/refresh-laws.yml` used `actions/upload-pages-artifact` and `actions/deploy-pages`, which made the result an Actions deployment artifact instead of committed `docs/` files.

## Implemented Solution

- `scripts/build-site.mjs` now supports `--cache-dir`, `--cache-ttl-days`, `--max-runtime-ms`, `--progress-interval-ms`, `--quiet`, and `--verbose`.
- Live fetches use a per-law JSON cache under the configured cache directory. Fresh complete cache entries are reused for 30 days by default.
- The fetch loop logs per-law progress and section heartbeat messages, so CI logs show which law is being fetched or reused.
- When the runtime budget is reached, the script writes partial `docs/` output, records `partialRefresh` in the catalog metadata, exits with code `75`, and leaves cache files ready for continuation.
- The refresh workflow now commits generated `docs/` files and `data/cache/laws` back to `main` after each chunk. It no longer uploads a Pages artifact.

## Existing Components Considered

- GitHub Pages branch publishing supports serving a site from a branch `/docs` folder, matching the issue requirement to commit Markdown for the Pages app: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub documents that pushes made with the repository `GITHUB_TOKEN` do not recursively trigger normal push workflows, so direct workflow commits do not create an infinite refresh loop: https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow
- GitHub Actions workflow commands support grouped logs and ordinary stdout/stderr progress output: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
- GitHub-hosted runner jobs have a 6-hour execution limit; the workflow keeps its existing 360-minute job timeout but checkpoints before the one-hour mark: https://docs.github.com/en/actions/reference/limits
- `actions/cache` is useful for dependency/build-output reuse, but GitHub describes artifacts as post-run outputs and caches as workflow-run reuse. Neither gives reviewers committed Markdown or guaranteed partial progress after a cancelled long fetch, so this repository uses committed law cache files instead: https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching
- Marketplace actions such as `stefanzweifel/git-auto-commit-action` and `EndBug/add-and-commit` can commit generated files, but the workflow only needs a small, explicit `git add` / `git commit` / `git push` sequence.

## External Issue Reporting

No upstream GitHub issue was filed. The observed failure was caused by this repository's refresh script and workflow design: missing progress logs, no durable checkpoint, and artifact-only deployment. The India Code source did not need a reproducible upstream bug report for this fix.
