# Case Study: Initial Indian Law Pages Prototype

Issue: https://github.com/Svetozar-Technologies/indian-law/issues/1

Prepared branch: `issue-1-983a320683f7`

## Requirement Map

| ID | Requirement | Implementation in this PR |
| --- | --- | --- |
| R1 | Make a first prototype of an active-law list republished as GitHub Pages. | `docs/index.html` is the single React app entry point produced by `scripts/build-site.mjs`. |
| R2 | Download official law sources and convert to Markdown. | `scripts/discover-laws.mjs` discovers India Code acts; `scripts/build-site.mjs --fetch` fetches section JSON and renders Markdown parts. |
| R3 | Support official languages such as English, Hindi, Tamil, Telugu, Bengali, Kannada, and Marathi when available. | `data/languages.lino` configures these languages; `scripts/discover-regional-sources.mjs` records regional official PDF availability. |
| R4 | Detect the user's language and show available law in that language. | The React app uses `navigator.languages`, enables only languages with generated Markdown for a law, and falls back to English when a requested language has no Markdown text. |
| R5 | Split every law/codex into parts no larger than 1500 lines without splitting sections. | `splitSectionsIntoParts` in `scripts/lib/markdown.mjs`, covered by `tests/markdown.test.mjs`. |
| R6 | Make the repository fully updatable using GitHub Actions CI/CD. | `.github/workflows/ci.yml` runs PR checks plus a one-law live corpus smoke download; `.github/workflows/refresh-laws.yml` discovers, fetches all active laws on the default branch, builds, and deploys Pages. |
| R7 | Allow manual execution for fresh data or retry after network errors. | `workflow_dispatch` inputs on `refresh-laws.yml`. |
| R8 | Avoid overloading government websites. | Fetch scripts retry transient errors, send a project contact header, and default to 1100 ms between requests. |
| R9 | Reuse best practices from the JS AI-driven development pipeline template. | Adopted Node 20, `npm ci`, explicit workflow permissions, job timeouts, deterministic PR build, and generated output verification. |
| R10 | Study related work, including russian-law. | `konard/russian-law` was reviewed as a simple static-law mirror with checked-in generated data. |
| R11 | Compile issue research under `docs/case-studies/issue-1`. | This case study plus `data/issue-1.lino`, `data/js-template-file-tree.txt`, and `data/reference-urls.txt`. |
| R12 | Store own data/metadata in Links Notation instead of JSON. | Seed manifests, language config, generated catalog metadata, and issue metadata are `.lino` files encoded/decoded with `lino-objects-codec` and validated with `links-notation`. |

## Source Findings

India Code is the primary official source for Central and State/UT Acts. Its Central Acts listing is available at:

https://www.indiacode.nic.in/handle/123456789/1362/simple-search

Each Act page exposes metadata, source PDFs, section links, and a section JSON endpoint used by the site builder:

https://www.indiacode.nic.in/SectionPageContent

For the seeded Copyright Act example, India Code exposes an English PDF, a Hindi PDF, metadata, and section JSON:

https://www.indiacode.nic.in/handle/123456789/1367

The Legislative Department also publishes regional-language pages. The prototype treats those pages as official source availability records and avoids inventing text when a source is PDF-only:

https://lddashboard.legislative.gov.in/regional-language

## Prototype Scope

The PR includes a deterministic `.lino` seed manifest with several major active Central Acts and a small section excerpt for one law so CI can verify the offline build path. PR CI also performs a bounded live smoke download for one law corpus. The default-branch refresh workflow is the production path for discovering the full active list and replacing seed excerpts with current official section text.

PDF-only regional sources are recorded and linked. Language switching for law text remains disabled until Markdown text exists for that language; this avoids automated translation and defaults readers to English when no original-language Markdown is available. Full conversion of scanned regional PDFs to Markdown should be added as a separate OCR/extraction stage after validating source quality and legal labeling.

## CI/CD Notes

The JS template comparison drove these choices:

- use explicit `permissions`;
- keep PR checks deterministic and quick while adding one bounded live corpus smoke test;
- add job-level timeouts;
- keep generated output checked by `git diff --exit-code`;
- use `.lino` for repository-owned metadata and generated catalog data;
- provide a manual workflow for recovery and reruns;
- avoid broad write permissions in CI.

## Follow-Up Plan

1. Enable GitHub Pages for the repository if it is not already enabled.
2. Run the refresh workflow with `fetch_limit=0` on the default branch.
3. Review regional PDF extraction quality and add an OCR pipeline only after the raw source inventory is stable.
4. Add link checking once the first full Pages artifact is generated.
