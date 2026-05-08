# indian-law

Prototype GitHub Pages mirror for active Indian laws from official public sources.

The first implementation focuses on a repeatable pipeline:

- discovers Central Acts from [India Code](https://www.indiacode.nic.in/);
- records official English, Hindi, and regional-language source availability in Links Notation `.lino` files;
- converts available India Code section HTML into Markdown;
- splits Markdown output into files with a 1500-line budget without splitting sections across files;
- builds a single-entry React GitHub Pages viewer under `docs/` that reads a `.lino` catalog and loads Markdown text on demand;
- runs deterministic PR checks from a small seed manifest plus a live official source download smoke, while scheduled/manual Actions on the default branch refresh from live official sources.

Published Pages URL, once enabled for the repository:

https://svetozar-technologies.github.io/indian-law/

## Local Usage

```bash
npm ci
npm test
npm run build:offline
```

To test a live network refresh on a small sample:

```bash
node scripts/discover-laws.mjs --limit 3 --output data/laws.discovered.lino
node scripts/discover-regional-sources.mjs --max-pages 1 --output data/regional-sources.discovered.lino
node scripts/build-site.mjs --fetch --manifest data/laws.discovered.lino --regional-sources data/regional-sources.discovered.lino --max-sections 5
```

Long live refreshes can persist fetched law data between runs:

```bash
node scripts/build-site.mjs --fetch \
  --manifest data/laws.discovered.lino \
  --regional-sources data/regional-sources.discovered.lino \
  --cache-dir data/cache/laws \
  --cache-ttl-days 30 \
  --max-runtime-ms 3300000
```

Fresh cache entries skip re-downloading law sections for 30 days by default. When `--max-runtime-ms` is reached, the script writes the current `docs/` output, exits with code `75`, and leaves cache files ready for the next run to continue.

Repository scripts emit detailed timestamped diagnostics by default, including inputs, option choices, HTTP attempts, cache decisions, page parsing counts, generated files, and checkpoint decisions. Pass `--quiet` only when intentionally suppressing routine trace output.

To smoke-test one official law source download without rebuilding the site:

```bash
node scripts/smoke-download-source.mjs --manifest data/laws.seed.lino --max-sources 1
```

Repository-owned `.lino` files use indented Links Notation with plain string references, so the metadata remains readable in reviews and manual edits.

The live fetcher retries transient failures, waits between requests by default, and sends a project contact header. India Code currently rejects Node's default fetch profile, so the HTTP client uses a curl-compatible request profile for that host.

## Repository Layout

- `data/laws.seed.lino` - deterministic seed law manifest used in PR checks.
- `data/languages.lino` - language configuration for browser-language routing and source discovery.
- `data/regional-sources.seed.lino` - deterministic regional-language source seed metadata.
- `src/app.jsx` - React law viewer loaded by the single `docs/index.html` entry point.
- `src/styles.css` - source stylesheet copied into the Pages artifact.
- `scripts/discover-laws.mjs` - discovers Central Acts from India Code search results.
- `scripts/discover-regional-sources.mjs` - discovers official regional-language PDF sources.
- `scripts/build-site.mjs` - fetches, converts, splits Markdown, writes `.lino` catalog data, and renders the Pages site.
- `scripts/smoke-download-source.mjs` - downloads one official source file for PR CI network smoke coverage.
- `tests/` - parser, splitter, and offline site generation tests.
- `docs/` - generated GitHub Pages output plus case-study documentation.
- `LEGAL.md` - legal posture and source attribution notes.

## Legal

This repository adds editorial metadata, source links, section anchors, and processing notes around official law text. See `LEGAL.md` for the publication posture and disclaimers. This is an engineering implementation note, not legal advice.
