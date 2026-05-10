# Issue 17 Case Study: Hindi PDF Sources Were Cataloged But Not Converted

## Summary

Issue 17 reported that the site showed Hindi law sources but still displayed `0 Markdown texts in Hindi`. The screenshot captured this state for the generated site: `845 seeded laws`, `0 Markdown texts in Hindi`, and `617 English fallback`.

The root cause was not discovery. Hindi PDF URLs and Hindi titles were already present in `docs/data/catalog.lino` and law caches. The missing step was conversion: `scripts/build-site.mjs` only wrote Hindi markdown from `law.translations.hi.sections`, but no code populated those translation sections from Hindi PDFs.

## Evidence Collected

- GitHub issue and PR metadata are saved in this directory:
  - `issue-17.json`
  - `issue-17-comments.json`
  - `pr-18.json`
  - `pr-18-review-comments.json`
  - `pr-18-reviews.json`
- The issue screenshot is saved as `screenshot-issue-17.png`.
- The reported Hindi PDF is saved as `h198868.pdf`.
- The latest relevant refresh workflow log is saved as `refresh-run-25610684871.log` with 43,760 lines.
- The PR CI log is saved as `pr-ci-run-25624910386.log`.
- The focused pre-fix reproducer failure is saved as `pre-fix-repro-test.log`.
- The focused post-fix passing run is saved as `post-fix-focused-test.log`.
- The affected test-file run is saved as `affected-tests.log`.
- Full validation output is saved as `npm-test.log`, `offline-build.log`, and `live-smoke-build.log`.
- The PDF text extraction experiment output is saved as `pdf-experiment-output.log`.

The reported India Code source is:

- `https://www.indiacode.nic.in/handle/123456789/1803`
- `https://www.indiacode.nic.in/bitstream/123456789/1803/2/h198868.pdf`

Online verification showed that the PDF is an 8-page text PDF containing the Hindi title and body text, so OCR is not required for this example.

## Log Findings

The refresh workflow was configured to run one long checkpoint chunk:

- `refresh-run-25610684871.log:1250` shows `CHECKPOINT_MINUTES=110, MAX_CHUNKS=1`.
- `refresh-run-25610684871.log:1252` shows `checkpoint_ms=6600000`.
- `refresh-run-25610684871.log:32704` shows the runtime checkpoint reached while fetching The Indian Forest Act, 1927.
- `refresh-run-25610684871.log:41054` shows a partial build with 93 pending laws.
- `refresh-run-25610684871.log:41678` shows one checkpoint commit: `Refresh generated law pages (chunk 1)`.

For the concrete NHAI example:

- `docs/data/catalog.lino:942` records the India Code source URL.
- `docs/data/catalog.lino:947` records the Hindi localized title.
- `docs/data/catalog.lino:2621` records the Hindi PDF URL.
- `docs/data/catalog.lino:2650` records Hindi as `enabled=false`.
- `docs/data/catalog.lino:2651` records Hindi as `status=source-only`.
- `refresh-run-25610684871.log:32718` records `sections=0, parts=0, sources=1, status=source-only`.

The cache also contained the Hindi PDF URL at `data/cache/laws/the-national-highways-authority-of-india-act-1988.lino:1699`, but it had no `translations.hi.sections`.

## Root Cause

`sectionsForLanguage(law, languageCode)` returned English sections for `en`, and `law.translations[languageCode].sections` for other languages. Discovery populated `law.sources.hi` and `law.hindiTitle`, but the refresh pipeline never downloaded the Hindi PDF and never populated `law.translations.hi.sections`.

As a result, Hindi remained `source-only` even when a valid Hindi PDF existed.

## Fix

The fix adds a resumable PDF translation hydration step during live refresh:

- Add `scripts/lib/pdf.mjs` using `pdfjs-dist@4.10.38` to extract text pages from PDFs under Node 20.
- During cached-law and freshly-fetched-law refresh, find missing non-English PDF translations.
- Skip languages that already have `law.translations[code].sections`, so subsequent runs process only still-unconverted PDF sources.
- Fetch and extract the language PDF, store page sections under `law.translations[code].sections`, and write the updated law cache.
- Render translated PDF pages as markdown with the localized title and language-specific source URL.
- Keep source-only behavior for PDFs that fail to download or have no extractable text.

The refresh workflow default checkpoint was shortened from 110 minutes to 55 minutes, with a 75-minute job timeout, so the normal generated checkpoint cadence is closer to one hour.

## Reproduction Test

The regression test `fetch site build converts cached Hindi PDF source into Markdown` starts from a fresh cache entry that has English sections and a Hindi PDF source but no Hindi translation sections.

Before the fix:

- The build produced no `laws/hi/cached-hindi-act/part-001.md`.
- The test failed with `ENOENT`, saved in `pre-fix-repro-test.log`.

After the fix:

- The build requests the Hindi PDF once.
- `catalog.laws[0].languages.hi.enabled` is `true`.
- `catalog.laws[0].languages.hi.status` is `markdown`.
- The Hindi markdown file contains `Language: Hindi` and extracted Devanagari text.
- The cache contains `law.translations.hi.sections`.

## References Checked

- India Code Hindi PDF for the NHAI Act: https://www.indiacode.nic.in/bitstream/123456789/1803/2/h198868.pdf
- `pdfjs-dist@4.10.38` package metadata showing Node `>=20`: https://app.unpkg.com/pdfjs-dist@4.10.38/files/package.json
- GitHub Actions workflow syntax for `jobs.<job_id>.timeout-minutes`: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
