# indian-law

Prototype GitHub Pages mirror for active Indian laws from official public sources.

The first implementation focuses on a repeatable pipeline:

- discovers Central Acts from [India Code](https://www.indiacode.nic.in/);
- records official English, Hindi, and regional-language source availability;
- converts available India Code section HTML into Markdown;
- splits Markdown output into files with a 1500-line budget without splitting sections across files;
- builds a static, language-aware site under `docs/`;
- runs deterministic PR checks from a small seed manifest while scheduled/manual Actions can refresh from live official sources.

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
node scripts/discover-laws.mjs --limit 3 --output data/laws.discovered.json
node scripts/discover-regional-sources.mjs --max-pages 1 --output data/regional-sources.discovered.json
node scripts/build-site.mjs --fetch --manifest data/laws.discovered.json --regional-sources data/regional-sources.discovered.json --max-sections 5
```

The live fetcher retries transient failures, waits between requests by default, and sends a project contact header. India Code currently rejects Node's default fetch profile, so the HTTP client uses a curl-compatible request profile for that host.

## Repository Layout

- `data/laws.seed.json` - deterministic seed law manifest used in PR checks.
- `data/languages.json` - language configuration for browser-language routing and source discovery.
- `scripts/discover-laws.mjs` - discovers Central Acts from India Code search results.
- `scripts/discover-regional-sources.mjs` - discovers official regional-language PDF sources.
- `scripts/build-site.mjs` - fetches, converts, splits, and renders the Pages site.
- `tests/` - parser, splitter, and offline site generation tests.
- `docs/` - generated GitHub Pages output plus case-study documentation.
- `LEGAL.md` - legal posture and source attribution notes.

## Legal

This repository adds editorial metadata, source links, section anchors, and processing notes around official law text. See `LEGAL.md` for the publication posture and disclaimers. This is an engineering implementation note, not legal advice.
