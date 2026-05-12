# Issue 30 Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/30

Pull request: https://github.com/Svetozar-Technologies/indian-law/pull/31

## Summary

Issue 30 reported four related publication problems in the generated law catalog:

- Hindi showed one pending law, the Foreign Exchange Management Act, 1999, backed only by an inaccessible official Hindi PDF.
- Hindi law rows had PDF source links but not the official India Code HTML landing-page link.
- English source lists repeatedly exposed `https://www.indiacode.nic.in/help/userGuide.pdf`.
- The `Markdown` status badge in the law table was not clickable.

The fix makes source publication stricter and language-aware. Generated catalog and Markdown output now filter non-law India Code helper links, suppress sources marked as failed, add the canonical official HTML source to localized language rows that have text or a usable language source, and keep localized Markdown front matter pointed at the language-specific source. The React table now renders the `Markdown` status as the document link whenever a Markdown part exists.

## Investigation

On 2026-05-12, the branch catalog audit showed:

- English: 845 ready, 0 pending, 845 total.
- Hindi: 715 ready, 1 pending, 716 total.
- The one pending Hindi entry was `the-foreign-exchange-management-act-1999`, Act 42 of 1999.
- `docs/data/catalog.lino` contained 751 `userGuide.pdf` source URLs even though the discovered manifest did not.

The source audit is saved in `raw/catalog-summary.json` and `raw/source-url-audit.json`.

Official India Code checks on 2026-05-12 showed:

- The FEMA India Code handle page still linked to `https://www.indiacode.nic.in/bitstream/123456789/1988/3/H1999%20-42.pdf`.
- Fetching that Hindi PDF returned HTTP 404 with an HTML body, so it was not a usable PDF source.
- The English PDF at `https://www.indiacode.nic.in/bitstream/123456789/1988/1/A1999_42.pdf` returned HTTP 200 with `application/pdf`.
- Locale probing of the handle page did not reveal Hindi section HTML content that could replace the broken PDF.

The captured headers, bodies, and probes are saved under `raw/fema-*`.

## Root Causes

- Generated output was publishing stale cached India Code helper links that were not law sources.
- Source selection for localized rows used only the localized PDF list, so the Hindi UI lacked the canonical HTML source even when the default English entry had it.
- PDF extraction failures were logged but not persisted on the source record, so an inaccessible language PDF could remain published as a source-only pending language.
- The law table rendered text status as a `span`, even when the same row had a document route available.

## Result

After the fix and regeneration:

- English: 845 ready, 0 pending, 845 total.
- Hindi: 715 ready, 0 pending, 715 total.
- `userGuide.pdf` occurrences in published catalog and Markdown output: 0.
- Hindi entries with source links but no HTML source: 0.
- The FEMA Hindi PDF source is marked with `downloadStatus failed` in `data/cache/laws/the-foreign-exchange-management-act-1999.lino`.

The after-fix audit is saved in `raw/catalog-summary-after-fix.json`.

## Verification

- Reproducing tests before the fix: `raw/pre-fix-repro-tests.log`.
- Focused tests after the fix: `raw/post-fix-focused-tests.log` and `raw/post-fix-regression-focused-tests.log`.
- Full test suite: `raw/npm-test-final.log` (`46` passed, `0` failed).
- Offline generated-site build: `raw/offline-build-final.log`.
- Whitespace check: `raw/git-diff-check.log`.
- Browser verification screenshot: `issue-30-hindi-markdown-links.png`.

The latest local browser pass confirmed rendered Hindi table `Markdown` cells are anchors such as `#/laws/hi/the-national-highways-authority-of-india-act-1988/part-001.md`.
