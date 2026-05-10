# Issue 27 Case Study

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/27

Pull requests:

- https://github.com/Svetozar-Technologies/indian-law/pull/28 — disabled 0-law language links and initial case study (merged).
- https://github.com/Svetozar-Technologies/indian-law/pull/29 — Tesseract OCR fallback for image-only Hindi PDFs (this PR, branch `issue-27-4effc0f43bc7`).

Prepared branches: `issue-27-e5368f27f266` (merged), `issue-27-4effc0f43bc7` (active).

## Scope

Issue 27 reported two problems observed after the Laws sync commit `720cfb6`:

1. **13 Hindi laws still pending** — 13 laws show `status: source-only` (have a Hindi PDF source URL but no generated Markdown). The issue asked why these were not synced in the last CI commit.

2. **0-law languages shown as clickable** — Languages with zero laws (Bengali, Kannada, Marathi, Tamil, Telugu) render as clickable links in the language grid. Clicking them leads to an empty table, which is confusing.

The issue also requested: deep case study with evidence, cross-check of all requirements from issues 19–25 against `docs/REQUIREMENTS.md`, and all fixes in a single PR.

## Evidence Captured

- Issue metadata: `data/issue-27.json`, `data/issue-27-comments.json`
- PR metadata: `data/pr-28.json`
- CI run metadata: `data/ci-run-25639357035.json`
- CI log (full, compressed): `logs/ci-run-25639357035.log.gz`
- CI log excerpt (key evidence lines): `logs/ci-run-25639357035.excerpt.log`
- Image-PDF law list: `data/image-pdf-laws.txt`
- Catalog status summary: `data/catalog-summary.json`

## Timeline

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 2026-05-09 09:28 | Law cache fetched for `the-maritime-anti-piracy-act-2022` (within 30-day TTL). Cache includes `sources.hi` with PDF URL but no `translations` key. | `data/cache/laws/the-maritime-anti-piracy-act-2022.lino` |
| 2026-05-10 20:46:06 | CI run `25639357035` started (Refresh Laws and Deploy Pages). | `data/ci-run-25639357035.json` |
| 2026-05-10 20:46:33 | Central Act discovery completed: 845 laws found. | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 20:46:51–20:47:49 | Regional-source discovery timed out for Bengali, Kannada, Marathi, Tamil, and Telugu source pages (each 11-second timeout × 2 attempts). 0 regional sources written. | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 20:47:49 | `build-site.mjs` started with `--fetch --manifest data/laws.discovered.lino ... --max-runtime-ms 3300000`. No `--languages` override; all 7 languages from `data/languages.lino` used. | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 20:49:28 | For law `the-maritime-anti-piracy-act-2022`: cache accepted (fresh, complete), `hydratePdfTextFromSources` called for Hindi, PDF downloaded but: **"No extractable text found in Hindi PDF"** — image-based PDF. | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 20:49–20:52 | 12 more Hindi PDFs downloaded; all yield "No extractable text found" (scanned/image-based). 1 PDF returns HTTP 404 (FEMA 1999). | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 20:52:37 | Cataloging phase: all 13 laws receive `status: source-only` for Hindi. | `logs/ci-run-25639357035.excerpt.log` |
| 2026-05-10 (approx) | Commit `720cfb6` pushed with only `data/cache/refresh-status.lino` and `docs/data/catalog.lino` changed — no new Markdown for the 13 pending laws. | `https://github.com/Svetozar-Technologies/indian-law/commit/720cfb6` |

## Catalog Status at Time of Issue

| Language | Markdown | Source-only | Unavailable | Visible (source-only + markdown) |
| --- | ---: | ---: | ---: | ---: |
| English (en) | 845 | 0 | 0 | 845 |
| Hindi (hi) | 703 | 13 | 129 | 716 |
| Bengali (bn) | 0 | 0 | 845 | 0 |
| Kannada (kn) | 0 | 0 | 845 | 0 |
| Marathi (mr) | 0 | 0 | 845 | 0 |
| Tamil (ta) | 0 | 0 | 845 | 0 |
| Telugu (te) | 0 | 0 | 845 | 0 |

## Root Cause Analysis

### Problem 1: 13 Hindi laws remain `source-only` after sync

**Root cause: Image-based (scanned) PDFs.**

The `build-site.mjs` script correctly executed `hydratePdfTextFromSources` for all 13 laws. For each, it:
1. Found a Hindi PDF source URL in `law.sources.hi`.
2. Downloaded the PDF buffer successfully.
3. Called `extractPdfTextSections(pdfBuffer)` via `pdfjs-dist`.
4. Received 0 text sections back — the PDFs contain scanned page images with no embedded text layer.

`pdfjs-dist` can only extract text from PDFs that embed a text layer (digitally-born PDFs). Scanned documents require OCR.

The 13 affected laws and their PDF URLs:

| Law | CI Index | PDF URL | Failure |
| --- | ---: | --- | --- |
| The Maritime Anti-Piracy Act, 2022 | 346/845 | `bitstream/123456789/19621/2/h20233.pdf` | No extractable text |
| The Footwear Design and Development Institute Act, 2017 | 447/845 | `bitstream/123456789/2255/3/H2017-20.pdf` | No extractable text |
| The Dadra and Nagar Haveli and Daman and Diu (Merger of Union territories) Act, 2019 | 475/845 | `bitstream/123456789/13079/2/H2019-44.pdf` | No extractable text |
| The Banning of Unregulated Deposit Schemes Act, 2019 | 561/845 | `bitstream/123456789/11641/2/H2019-21.pdf` | No extractable text |
| The Indian Antarctic Act, 2022 | 562/845 | `bitstream/123456789/19581/2/h202213.pdf` | No extractable text |
| The Foreign Exchange Management Act, 1999 | 570/845 | `bitstream/123456789/1988/3/H1999%20-42.pdf` | HTTP 404 Not Found |
| The Repealing and Amending Act, 2019 | 573/845 | `bitstream/123456789/11956/2/H2019-31.pdf` | No extractable text |
| The National Forensic Sciences University Act, 2020 | 613/845 | `bitstream/123456789/15623/3/H2020-32.pdf` | No extractable text |
| The Repealing and Amending Act, 2015 | 673/845 | `bitstream/123456789/12142/3/H2015-17.pdf` | No extractable text |
| The Post Office Act, 2023 | 708/845 | `bitstream/123456789/20064/2/h202343.pdf` | No extractable text |
| The Tribunals Reforms Act, 2021 | 709/845 | `bitstream/123456789/16901/2/h202133.pdf` | No extractable text |
| The Punjab Laws Act, 1872 | 746/845 | `bitstream/123456789/19137/2/H1872-04.pdf` | No extractable text |
| The School of Planning and Architecture Act, 2014 | 771/845 | `bitstream/123456789/2138/3/H2014-37.pdf` | No extractable text |

**This is an upstream data quality limitation**: India Code serves these Hindi translations as image-only PDFs. The code correctly detects and logs this, then marks the law as `source-only` rather than silently dropping the source or inventing text. This behavior satisfies the requirement: *"If the official source does not provide usable text for a language, the catalog must record that state instead of falling back to another language."*

**Possible solutions** (option 1 implemented in PR 29; the rest remain open or deferred):

1. **OCR integration — implemented in PR 29.** A new `scripts/lib/ocr.mjs` module renders each PDF page with `@napi-rs/canvas` (prebuilt N-API binary, no native compile) and calls `tesseract.js` with the `hin` + `eng` traineddata bundle. `scripts/build-site.mjs` now invokes this fallback inside `hydratePdfTextFromSources` when `extractPdfTextSections` returns 0 sections AND the new `--ocr` flag is set. Recognised pages are stored under `law.translations.<code>` with `sourceKind: "pdf-ocr"` and `ocrLanguages` so reviewers can distinguish them from text-extracted PDFs. The CI workflow `refresh-laws.yml` enables the flag with `--ocr --ocr-languages hin,eng`.

2. **External OCR service** — Use Google Cloud Vision, AWS Textract, or Azure Form Recognizer for PDF OCR. These support Devanagari/Hindi text well. Would require API credentials in CI. Not used to keep the pipeline self-contained.

3. **Report upstream** — File an issue with India Code (https://www.indiacode.nic.in/) requesting that these PDFs be replaced with digital/born-PDF versions. See the upstream report section below.

4. **Update FEMA source URL** — The FEMA 1999 URL returns HTTP 404. Ten URL variants were probed (path casing, no `%20`, alternate handle bitstreams, plain `H1999-42.pdf`, etc.); all returned 302 without a usable redirect target or HTTP 502. The official India Code landing page links to the broken URL, so this is a genuine upstream broken link. The build now records it as an upstream fetch failure and OCR cannot help when the file is missing entirely.

### Problem 2: 0-law languages shown as clickable links

**Root cause: Language grid did not check law count before rendering `<a>` elements.**

In `src/app.jsx`, the language grid section (lines 113–125 before this fix) used:
```jsx
catalog.languages.map((entry) => (
  <a className={`language-link...`} href={`#/${entry.code}`} ...>
```

This rendered all 7 languages as clickable links regardless of whether they had laws visible for that language. Bengali, Kannada, Marathi, Tamil, and Telugu each had 0 visible laws (no Markdown, no source-only), so clicking them led to an empty table — confusing and misleading.

The fix adds a `lawsForLanguage(catalog, entry.code).length > 0` check. Languages with 0 laws are rendered as a `<span class="language-link disabled">` with `opacity: 0.5` and `cursor: default`, making it visually clear they are not yet available.

## Implemented Fix

### Fix 1: Language grid disables 0-law languages (`src/app.jsx`)

The language grid now checks whether each language has any visible laws before rendering as a link:

```jsx
catalog.languages.map((entry) => {
  const hasLaws = lawsForLanguage(catalog, entry.code).length > 0;
  if (!hasLaws) {
    return (
      <span className="language-link disabled" key={entry.code} lang={entry.code}>
        ...
      </span>
    );
  }
  return <a className={`language-link...`} ...>;
})
```

### Fix 2: CSS for disabled language cards (`src/styles.css`)

Added `.language-link.disabled` rule:
```css
.language-link.disabled {
  cursor: default;
  opacity: 0.5;
}
```

### Fix 3: OCR fallback for image-only PDFs (PR 29)

A new module `scripts/lib/ocr.mjs` provides `extractPdfTextSectionsViaOcr(buffer, options)` which:

1. Loads the PDF via `pdfjs-dist/legacy/build/pdf.mjs` (Node-friendly build).
2. Renders each page to a bitmap with `@napi-rs/canvas` — a Skia-based canvas that ships prebuilt N-API binaries (no native compile needed in CI).
3. Passes the PNG buffer to a `tesseract.js` worker created with the configured language pack (Hindi `hin` + English `eng` by default for Hindi sources).
4. Caches the downloaded traineddata under `INDIAN_LAW_TESSDATA_CACHE` (defaults to a temp dir) so repeat builds skip the download.
5. Returns `{ pageCount, sections }` where each section is `{ kind: "ocr-page", sectionId, sectionNo, orderNo, title: "Page N", content, sourcePage, ocrLanguages }`.

`scripts/build-site.mjs` invokes this fallback inside `hydratePdfTextFromSources` only when `extractPdfTextSections` returns 0 sections AND the new `--ocr` flag is set. OCR-derived translations are recorded with `sourceKind: "pdf-ocr"` and `ocrLanguages` so reviewers can distinguish them from natively-extracted PDFs (per `docs/REQUIREMENTS.md`). The renderer (`scripts/lib/markdown.mjs`) emits `## Page N` headings for OCR pages and labels the part range as `Pages: X to Y`.

The CI workflow `.github/workflows/refresh-laws.yml` enables OCR by default with `--ocr --ocr-languages hin,eng`. Local maintenance refreshes can opt in with the same flags. Per-law/per-language overrides are available via `--ocr-scale` (default 2x rendering) and `--ocr-max-pages` (defaults to all pages).

#### CLI flags added

| Flag | Default | Purpose |
| --- | --- | --- |
| `--ocr` | off | Enable Tesseract OCR fallback for PDFs with no text layer. |
| `--ocr-languages hin,eng` | per-language auto (`hin+eng` for `hi`, `eng` for `en`) | Tesseract traineddata bundle. |
| `--ocr-scale 2` | 2 | pdf.js render scale before OCR. Higher = sharper bitmaps but slower. |
| `--ocr-max-pages N` | all | Cap recognised page count per PDF. |

#### Verification

Smoke test against a real upstream image-only PDF (Maritime Anti-Piracy Act, Hindi):

```
OCR: hin+eng on 22/22 page(s) at scale=2
OCR: page 1/22 produced 1683 char(s) in 4922ms
OCR: page 2/22 produced 2058 char(s) in 5319ms
... (recognition continues per page)
```

Unit-level integration (added in `tests/build-site.test.mjs`):

- `fetch site build runs OCR fallback when a Hindi PDF has no embedded text layer` — uses a generated `tests/fixtures/image-only.pdf` (rasterised "HELLO TEST" / "OCR FALLBACK PAGE" with no text layer). Asserts `status: "markdown"` in the catalog, generated Markdown contains `HELLO TEST`, cached law has `sourceKind: "pdf-ocr"`, `ocrLanguages: "eng"`, and section `kind: "ocr-page"`.
- `fetch site build leaves Hindi PDF as source-only when OCR is not enabled` — same fixture without `--ocr`. Asserts `status: "source-only"` and the existing warning `No extractable text found in Hindi PDF`. Confirms the OCR path is opt-in and non-regressive.

Both tests pass; the full suite (10/10 build-site tests, 5/5 markdown tests) remains green.

#### Cache reset is not required

The 13 affected laws have a fresh-and-complete cache hit (`hydratePdfTextFromSources` is always called even on cache hits). Since `law.translations.hi` is missing for them, the function detects zero existing sections and runs OCR on the next CI refresh without any manual cache invalidation.

## Requirements Cross-Check (Issues 19–25)

All requirements from `docs/REQUIREMENTS.md` were checked. Each requirement below references the file and line where it is implemented.

| Requirement | Status | Location |
| --- | --- | --- |
| Language route shows only selected-language laws (Markdown or source links) | ✅ | `src/catalog-status.mjs:29–31` (`lawsForLanguage`) |
| Non-default language route must not show default-language rows as Unavailable | ✅ | `src/catalog-status.mjs:29–31` (filters to only records with known sources) |
| Non-default language must not use English titles/long-title/ministry as fallback | ✅ | `src/app.jsx:178`, `src/catalog-status.mjs:41–50` (`displayTitleForLanguage`) |
| Neutral title label if localized title unavailable | ✅ | `src/catalog-status.mjs:58–68` (`neutralLawLabel`) |
| Language metrics scoped to selected language | ✅ | `src/app.jsx:94–95` (`languageCoverageForCatalog`) |
| Empty language views render empty table and zero-law metric (not fallback rows) | ✅ | `src/app.jsx:93, 140–165` |
| Language grid disables languages with 0 laws | ✅ **Fixed in this PR** | `src/app.jsx:113–136` |
| Placeholder titles (`null`, `undefined`, `n/a`) not presented | ✅ | `src/catalog-status.mjs:70–76` (`cleanDisplayTitle`) |
| Catalog distinguishes Markdown / Pending / Unavailable states | ✅ | `src/catalog-status.mjs:9–21` |
| Source fetch failures logged with URL and language | ✅ | `scripts/build-site.mjs:447–450` |
| Source-only laws expose official source link with Pending status | ✅ | `src/app.jsx:162` (`SourceLinks`) |
| Fresh complete caches skip re-downloading within TTL | ✅ | `scripts/build-site.mjs:482–508` (`lawFromFreshCache`) |

## Upstream Issues

### India Code: Image-only Hindi PDFs

**Repository**: https://github.com/nicin/indiacode (if available) or file via India Code contact form.

**Problem**: 12 Hindi PDF translations hosted at `indiacode.nic.in` contain scanned page images with no embedded text layer, making automated text extraction impossible with standard PDF parsers (pdfjs-dist, pdf.js, pdfreader, pypdf, etc.).

**Affected URLs**:
- `https://www.indiacode.nic.in/bitstream/123456789/19621/2/h20233.pdf` (Maritime Anti-Piracy Act, 2022)
- `https://www.indiacode.nic.in/bitstream/123456789/2255/3/H2017-20.pdf` (Footwear Design and Development Institute Act, 2017)
- `https://www.indiacode.nic.in/bitstream/123456789/13079/2/H2019-44.pdf` (Dadra and Nagar Haveli merger Act, 2019)
- `https://www.indiacode.nic.in/bitstream/123456789/11641/2/H2019-21.pdf` (Banning of Unregulated Deposit Schemes Act, 2019)
- `https://www.indiacode.nic.in/bitstream/123456789/19581/2/h202213.pdf` (Indian Antarctic Act, 2022)
- `https://www.indiacode.nic.in/bitstream/123456789/11956/2/H2019-31.pdf` (Repealing and Amending Act, 2019)
- `https://www.indiacode.nic.in/bitstream/123456789/15623/3/H2020-32.pdf` (National Forensic Sciences University Act, 2020)
- `https://www.indiacode.nic.in/bitstream/123456789/12142/3/H2015-17.pdf` (Repealing and Amending Act, 2015)
- `https://www.indiacode.nic.in/bitstream/123456789/20064/2/h202343.pdf` (Post Office Act, 2023)
- `https://www.indiacode.nic.in/bitstream/123456789/16901/2/h202133.pdf` (Tribunals Reforms Act, 2021)
- `https://www.indiacode.nic.in/bitstream/123456789/19137/2/H1872-04.pdf` (Punjab Laws Act, 1872)
- `https://www.indiacode.nic.in/bitstream/123456789/2138/3/H2014-37.pdf` (School of Planning and Architecture Act, 2014)

**Additional**: FEMA 1999 Hindi PDF returns HTTP 404:
- `https://www.indiacode.nic.in/bitstream/123456789/1988/3/H1999%20-42.pdf`

**Suggested fix**: Re-upload the PDFs as born-digital text PDFs (not scanned images).

**Workaround**: Consumer applications can integrate an OCR fallback (Tesseract with Hindi `hin` language pack) to extract text from image-based PDFs when pdfjs-dist returns 0 sections.
