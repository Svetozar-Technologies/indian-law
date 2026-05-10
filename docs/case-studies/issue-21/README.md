# Issue 21: GitHub Pages deployment link path

## Summary

Issue 21 reported that the GitHub Actions deployment link pointed to `https://law.satyavera.in` instead of the application path `https://law.satyavera.in/indian-law`.

The root cause was the Pages workflow environment URL:

```yaml
url: ${{ steps.deployment.outputs.page_url }}
```

For the observed deployment run, GitHub evaluated that expression to `http://law.satyavera.in/`. The site generator already publishes an `indian-law/` alias shell, so the fix is to advertise the canonical public path directly from the workflow environment:

```yaml
url: https://law.satyavera.in/indian-law/
```

## Timeline

- 2026-05-10 12:14 UTC: Refresh Laws and Deploy Pages run `25628445616` started on `main` at SHA `3ca185e83c2c34bb981d93593855433755e16618`.
- 2026-05-10 13:11 UTC: The run deployed Pages successfully and evaluated the environment URL as `http://law.satyavera.in/`.
- 2026-05-10 13:31 UTC: Issue 21 was opened with a screenshot of the incorrect completion link.
- 2026-05-10 13:32 UTC: PR 22 branch CI run `25630048634` completed successfully for the prepared branch head.

## Evidence

- Issue metadata: `issue.json`
- Issue comments: `issue-comments.json` (empty at investigation time)
- Issue screenshot: `issue-screenshot.png`
- Recent refresh runs: `recent-refresh-runs.json`
- Refresh run details: `refresh-run-25628445616.json`
- Full refresh log archive: `ci-logs/refresh-laws-25628445616.log.gz`
- Relevant refresh log excerpts:
  - `ci-logs/refresh-laws-25628445616-workflow-command-excerpt.log`
  - `ci-logs/refresh-laws-25628445616-pages-upload-excerpt.log`
  - `ci-logs/refresh-laws-25628445616-deploy-url-excerpt.log`
- Live URL checks:
  - `live-target-url-headers.txt`
  - `live-current-url-headers.txt`
  - `live-target-url.html`

The screenshot attachment was downloaded with authenticated `curl`. The `file` command was unavailable in this environment, so the PNG signature was verified with `od` before viewing the image.

The critical log excerpt is in `ci-logs/refresh-laws-25628445616-deploy-url-excerpt.log`:

```text
Evaluate and set environment url
Evaluated environment url: http://law.satyavera.in/
```

The live target URL check shows `https://law.satyavera.in/indian-law` redirects to `https://law.satyavera.in/indian-law/` and then returns `200 OK`.

## Template Comparison

The referenced CI/CD templates were downloaded into `templates/` and their file trees were recorded in `template-file-trees.txt`.

The exact Pages environment URL issue was not present in the templates. The template workflows do not use `actions/deploy-pages`, `steps.deployment.outputs.page_url`, or a GitHub Pages environment URL, so there was no matching template issue to report upstream.

Observed best practices from the templates that are already present or preserved locally:

- Workflow job timeouts are configured.
- Permissions are scoped per workflow.
- The Pages refresh workflow uses deployment concurrency.
- Tests cover workflow behavior with direct YAML assertions.

## Reproduction

A regression test was added to `tests/workflow-refresh.test.mjs`:

```js
test("refresh workflow advertises the canonical deployed site path", async () => {
  const workflow = await readFile(".github/workflows/refresh-laws.yml", "utf8");

  assert.match(workflow, /^\s+url: https:\/\/law\.satyavera\.in\/indian-law\/$/m);
  assert.doesNotMatch(workflow, /url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/);
});
```

Before the workflow change, the focused test run failed as expected. The saved output is `pre-fix-workflow-test.log`.

## Fix

The workflow environment URL in `.github/workflows/refresh-laws.yml` now points directly to the canonical deployed path:

```yaml
environment:
  name: github-pages
  url: https://law.satyavera.in/indian-law/
```

The build logic did not need to change. `scripts/build-site.mjs` already writes the alias shell at `indian-law/index.html`, and the live URL evidence confirms that path is served.

## Verification

Commands run after the fix:

```sh
node --test --test-timeout=30000 tests/workflow-refresh.test.mjs
npm ci
npm test
node scripts/build-site.mjs --offline --output /tmp/indian-law-offline-site
```

Saved outputs:

- `post-fix-workflow-test.log`: 6 workflow tests passed.
- `npm-ci.log`: dependencies installed from the lockfile with no vulnerabilities.
- `npm-test.log`: 35 tests passed.
- `offline-build.log`: offline Pages build completed and wrote `indian-law/index.html`.

Reference: GitHub Actions documents `jobs.<job_id>.environment.url` as the job environment URL field in workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
