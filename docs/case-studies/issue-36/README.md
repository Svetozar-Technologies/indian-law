# Issue 36 GitHub Pages Default URL Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/36

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/37

Prepared branch: `issue-36-f874d345d250`

## Requirement Map

| ID | Requirement | Result |
| --- | --- | --- |
| R1 | Find the root cause of `https://svetozar-technologies.github.io/indian-law` not working. | The repository Pages settings still had `cname: law.satyavera.in`; GitHub Pages redirected the default project URL to that host, and DNS for `law.satyavera.in` did not resolve. |
| R2 | Make the site work even if the domain CNAME does not exist. | The refresh workflow now advertises the default `github.io` project URL and clears this repository's Pages custom domain before deploy. A one-time live remediation also removed this repository's `law.satyavera.in` CNAME setting. |
| R3 | Download logs and data related to the issue into `docs/case-studies/issue-36`. | Issue, PR, Pages API data, deployments, run metadata, URL/DNS probes, code search results, CI logs, and focused test logs are preserved under `raw/` and `logs/`. |
| R4 | Search online for additional facts and data. | Official GitHub Pages REST, custom domain, troubleshooting, custom workflow, and Actions workflow syntax references are listed in `reference-urls.txt`. |
| R5 | Reconstruct timeline, requirements, root causes, options, and solution plan. | This document records the timeline, source findings, options considered, implemented fix, and verification. |
| R6 | Check known existing components or libraries that solve the problem. | Reused the existing Pages workflow, GitHub CLI on Actions runners, GitHub Pages REST API, and the existing workflow regression test style. |
| R7 | Add debug output if data is insufficient. | Existing workflow logs, Pages API responses, and targeted curl/DNS probes were sufficient; no persistent runtime debug mode was needed. |
| R8 | Report upstream issues if another GitHub project caused the bug. | No upstream defect was found. The observed behavior matches GitHub Pages custom-domain configuration semantics. |

## Evidence Collected

- `raw/issue.json`, `raw/issue-comments.json` - issue metadata and comments.
- `raw/pr.json`, `raw/pr-comments.json`, `raw/pr-review-comments.json`, `raw/pr-reviews.json` - PR 37 metadata and comment streams.
- `raw/pages.json`, `raw/pages-health.json`, `raw/pages-builds.json`, `raw/pages-latest-build.*` - initial GitHub Pages configuration and build endpoint responses.
- `raw/pages-clear-custom-domain.log`, `raw/pages-after-clear.json`, `raw/pages-post-remediation.json` - one-time project Pages custom-domain remediation and follow-up API responses.
- `raw/org-pages.json`, `raw/org-pages-cname-file.json`, `raw/dns-svetozar-in-after-clear.*`, `raw/svetozar-in-path-after-clear.*` - organization Pages custom-domain context after the project CNAME was cleared.
- `raw/deployments-github-pages.json` - recent `github-pages` deployments.
- `raw/runs-main.json`, `raw/run-main-refresh-26387407032.json` - recent main runs and the latest successful refresh/deploy run.
- `raw/runs-branch.json`, `raw/run-branch-ci-26407147658.json` - initial PR branch CI run, which passed before the fix.
- `logs/main-refresh-26387407032.log.gz` and `logs/main-refresh-26387407032.pages-excerpt.log` - full deploy log and Pages-specific excerpt from the latest main refresh.
- `logs/branch-ci-26407147658.log` - initial branch CI log.
- `raw/github-io-no-follow.*`, `raw/github-io-follow.*` - initial default URL redirect evidence.
- `raw/github-io-after-clear-*`, `raw/github-io-post-remediation-*` - post-remediation default URL probes and CDN cache evidence.
- `raw/custom-root.*`, `raw/custom-path.*`, `raw/dns-law-satyavera.*` - custom-domain DNS and curl failure evidence.
- `raw/recent-merged-*.json`, `raw/code-search-*.json` - related PR and repository-wide code search evidence.
- `raw/post-fix-workflow-test.log` - focused regression test after the workflow change.
- `raw/npm-ci.log`, `raw/npm-test-after-install.log`, `raw/offline-build-after-install.log`, `raw/git-diff-check.log` - local installation, full test, offline build, and whitespace-check logs.

The current file inventory is in `raw/evidence-file-list.txt`, and size information is in `raw/evidence-size.txt`.

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 17:31 | PR 14 merged a `/indian-law/` alias shell for the custom-domain path problem. | `raw/recent-merged-pages-prs.json`, `docs/case-studies/issue-13/README.md` |
| 2026-05-10 13:49 | PR 22 changed the Pages environment URL to `https://law.satyavera.in/indian-law/`. | `docs/case-studies/issue-21/README.md` |
| 2026-05-25 06:47 | Latest main `Refresh Laws and Deploy Pages` run started at SHA `501299f2148ab509c23518cbe486cce6fc697740`. | `raw/run-main-refresh-26387407032.json` |
| 2026-05-25 06:55 | The workflow uploaded a Pages artifact and evaluated the environment URL as `https://law.satyavera.in/indian-law/`. | `logs/main-refresh-26387407032.pages-excerpt.log` |
| 2026-05-25 15:06 | Issue 36 was opened for the default project URL `https://svetozar-technologies.github.io/indian-law`. | `raw/issue.json` |
| 2026-05-25 15:10 | Pages API showed `cname: law.satyavera.in`, `html_url: http://law.satyavera.in/`, and `build_type: workflow`. | `raw/pages.json` |
| 2026-05-25 15:11 | The default project URL returned `301` with `location: http://law.satyavera.in/`. | `raw/github-io-no-follow.headers.txt` |
| 2026-05-25 15:16 | Following the default URL redirect failed because `law.satyavera.in` could not be resolved. Direct custom-domain curls failed the same way. | `raw/github-io-follow.stderr.txt`, `raw/custom-root.stderr.txt`, `raw/custom-path.stderr.txt` |
| 2026-05-25 15:16 | Local focused workflow regression test passed after changing the canonical URL and adding the custom-domain clearing step. | `raw/post-fix-workflow-test.log` |
| 2026-05-25 15:21 | One-time remediation cleared this repository's Pages custom domain through the Pages REST API. Follow-up API responses reported `cname: null`. | `raw/pages-clear-custom-domain.log`, `raw/pages-after-clear.json`, `raw/pages-post-remediation.json` |
| 2026-05-25 15:22 | With the project CNAME cleared, GitHub Pages reported the organization Pages domain `svetozar.in/indian-law/`; that path resolved and returned `200 OK`. | `raw/org-pages.json`, `raw/dns-svetozar-in-after-clear.txt`, `raw/svetozar-in-path-after-clear.headers.txt` |
| 2026-05-25 15:24 | The local CDN edge still served a cached old `301` to `law.satyavera.in` for the original `github.io` URL. The project Pages API state was already corrected, so the remaining redirect was cache/deploy propagation rather than live repository configuration. | `raw/github-io-post-remediation-no-follow.headers.txt`, `raw/pages-post-remediation.json` |

## Root Cause

There is no generated artifact problem for `docs/index.html` or the `/indian-law/` alias shell. The latest deployed artifact was uploaded successfully, and the existing generator already writes `indian-law/index.html`.

The failure comes from repository-level GitHub Pages settings. The Pages API reported:

```json
{
  "cname": "law.satyavera.in",
  "html_url": "http://law.satyavera.in/",
  "build_type": "workflow"
}
```

Because a custom domain was configured, GitHub Pages redirected `https://svetozar-technologies.github.io/indian-law/` to `http://law.satyavera.in/`. At investigation time, `getent hosts law.satyavera.in` exited `2`, and curl exited `6` with `Could not resolve host: law.satyavera.in`. The default project URL therefore failed even though the Pages artifact existed.

This is also why removing or not having a `docs/CNAME` file is insufficient. GitHub's documentation says custom GitHub Actions Pages workflows do not create a `CNAME` file, and existing `CNAME` files are ignored and not required. The active value is the repository Pages `cname` setting, which the REST API can update; sending JSON `null` removes the custom domain.

After the one-time remediation, this repository's Pages API reported `cname: null`. GitHub then reported the project under the organization Pages domain `http://svetozar.in/indian-law/`, because the organization root Pages repository `Svetozar-Technologies.github.io` has its own `CNAME` file containing `svetozar.in`. That is separate from the broken `law.satyavera.in` project setting and is outside this repository's workflow. The `svetozar.in/indian-law/` URL resolved and returned `200 OK` during verification.

The local `github.io` probe still saw a cached old `301` to `law.satyavera.in` shortly after the API update. The cache headers showed `x-cache: HIT` and an old `age`, while the Pages API already showed `cname: null`. The next Pages deployment from this PR should refresh that routing state while also keeping the project CNAME cleared.

## Source Findings

Official GitHub Pages documentation says custom domains are configured in repository Pages settings and, for subdomains, must also have DNS `CNAME` records pointing to the account's default Pages domain. The troubleshooting docs recommend checking DNS with a CLI tool such as `dig`, and the live local check here found no host entry for `law.satyavera.in`.

The GitHub Pages REST API documentation exposes `GET /repos/{owner}/{repo}/pages`, which produced the live `cname` evidence, and `PUT /repos/{owner}/{repo}/pages`, where the `cname` body field may be `null` to remove the custom domain.

The existing repository components were enough for the fix:

- `.github/workflows/refresh-laws.yml` already owns the Pages deployment.
- `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` are already used.
- GitHub-hosted runners include `gh`, which can call the Pages REST API with `${{ github.token }}`.
- `tests/workflow-refresh.test.mjs` already asserts deploy workflow invariants without adding YAML parser dependencies.

## Options Considered

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Recreate or duplicate the site under another artifact path. | The artifact already contains both root and `/indian-law/` shells; this would not stop the default URL redirect. | Rejected. |
| Restore DNS for `law.satyavera.in`. | Would make the custom domain work again, but the default `github.io` URL would still redirect away from the issue URL and would break again when DNS is missing. | Rejected. |
| Keep the custom domain and add a JavaScript fallback. | Browser JavaScript cannot run before GitHub Pages follows the server-side redirect. | Rejected. |
| Remove the custom domain once manually. | Fixes the current live project Pages setting but can regress if the setting is reintroduced. | Applied as an operational remediation, but paired with a workflow fix so the repository remains self-healing. |
| Make the default Pages URL canonical and clear the Pages custom domain on each deploy. | Keeps the requested URL stable and makes the workflow self-healing if stale custom-domain settings reappear. | Chosen. |

## Implemented Fix

`.github/workflows/refresh-laws.yml` now advertises:

```yaml
url: https://svetozar-technologies.github.io/indian-law/
```

After `actions/configure-pages`, the workflow runs:

```bash
current_cname="$(gh api "repos/${{ github.repository }}/pages" --jq '.cname // ""')"
```

If a custom domain is configured, it removes it through the Pages REST API:

```bash
gh api \
  --method PUT \
  "repos/${{ github.repository }}/pages" \
  --field cname=null \
  --field build_type=workflow \
  --silent
```

The step exits cleanly when no custom domain is present. The workflow then uploads and deploys the Pages artifact normally.

`tests/workflow-refresh.test.mjs` now verifies:

- the workflow environment URL is the default `github.io/indian-law/` project URL;
- the stale custom-domain clearing step exists;
- the step uses `${{ github.token }}`;
- the Pages API update sends `cname=null` and preserves `build_type=workflow`.

The live project Pages setting was also remediated once:

```bash
gh api --method PUT repos/Svetozar-Technologies/indian-law/pages --field cname=null --field build_type=workflow --silent
```

Follow-up API responses reported `cname: null`. GitHub's computed project URL then used the organization Pages domain `http://svetozar.in/indian-law/`, and `https://svetozar.in/indian-law/` returned the generated Indian Law shell with `200 OK`.

## Verification

Focused test after the fix:

```bash
node --test --test-timeout=30000 tests/workflow-refresh.test.mjs > docs/case-studies/issue-36/raw/post-fix-workflow-test.log 2>&1
```

Result:

- `tests/workflow-refresh.test.mjs`: 7/7 passing.

Full local verification after installing dependencies:

```bash
npm ci > docs/case-studies/issue-36/raw/npm-ci.log 2>&1
npm test > docs/case-studies/issue-36/raw/npm-test-after-install.log 2>&1
node scripts/build-site.mjs --offline --output /tmp/indian-law-issue-36-offline-site > docs/case-studies/issue-36/raw/offline-build-after-install.log 2>&1
git diff --check > docs/case-studies/issue-36/raw/git-diff-check.log 2>&1
```

Results:

- `npm ci`: completed successfully, 24 packages installed, 0 vulnerabilities.
- `npm test`: 55/55 tests passing.
- offline build: completed successfully and generated the site plus `/indian-law/` alias.
- `git diff --check`: no whitespace errors.

The earlier `raw/npm-test.log` and `raw/offline-build.log` failures were from running before dependencies were installed; both failed because required packages such as `esbuild` were missing locally.

## Follow-Up Verification Plan

1. Merge PR 37 and allow the next `Refresh Laws and Deploy Pages` run on `main` to execute the custom-domain clearing step and deploy a fresh artifact.
2. Verify `GET /repos/Svetozar-Technologies/indian-law/pages` still reports `"cname": null`.
3. Verify `https://svetozar-technologies.github.io/indian-law/` no longer redirects to `law.satyavera.in` after the CDN edge refreshes.
4. If the strict requirement is that `svetozar-technologies.github.io` must never redirect through any organization custom domain, remove or change the `svetozar.in` CNAME in the separate `Svetozar-Technologies.github.io` root Pages repository.
5. If the project later needs `law.satyavera.in`, restore its DNS first and decide explicitly whether custom-domain behavior should replace the default project URL again.
