# Requirements

This project is an official-source law mirror and catalog viewer. These requirements describe the expected behavior for discovery, generated data, publication, and review evidence.

## Source and Legal Requirements

- Use official public sources for law text and source links. India Code is the primary source for Central Acts; Legislative Department regional-language pages may be used for official regional-language PDFs.
- Preserve source attribution in generated metadata and pages. A generated law entry must keep the official source URL for every language where a source is known.
- Do not invent law text, translations, titles, sections, or source availability. If the official source does not provide usable text for a language, the catalog must record that state instead of falling back to another language.
- Keep the publication posture in `LEGAL.md` intact. Generated output must include repository-added metadata, processing notes, or source context rather than acting as an unattributed bare mirror.

## Catalog Requirements

- The catalog must include active Central Acts discovered from official sources and must be serialized as readable Links Notation.
- Repository-owned `.lino` files must remain reviewable: indented object definitions, explicit string references for identifier-like values, and readable multiline strings.
- Each law entry must include a stable slug, act metadata where available, default-language source metadata, and per-language status records.
- The generated catalog must distinguish these language states:
  - `Markdown`: selected-language text was converted into generated Markdown parts.
  - `Pending`: an official selected-language source is known, but generated Markdown is not available yet.
  - `Unavailable`: no official selected-language source or generated selected-language text is known.
- Placeholder upstream values such as `null`, `undefined`, `n/a`, `na`, `-`, and `--` must not be presented as titles.

## Language Isolation Requirements

- A language route must show only laws that have selected-language Markdown or selected-language official source links.
- A language route must not show default-language-only rows as `Unavailable`.
- A non-default language route must not display English law titles, long titles, ministries, Markdown, or source links as fallback content.
- If a selected-language title is unavailable, the UI and Markdown generator may use a neutral metadata label such as `Act 31 of 2010`; it must not use the default-language title.
- Language metrics must be scoped to the selected language. For a partial language, the denominator is the selected-language visible set, not the full default-language catalog.
- Default-language routes may use default-language title, long-title, ministry, source, and Markdown data.

## Generated Site Requirements

- The Pages app must work from the repository root path and the `/indian-law/` alias path.
- The app must load the generated catalog from the configured asset base and expose a direct `Catalog source: Links Notation` link.
- Document routes must render selected-language Markdown only when that language record is enabled. Missing selected-language text must not route to another language's document.
- Source-only laws may expose the official selected-language source link with `Pending` status.
- Empty language views must render an empty table and zero-law metric rather than fallback rows.

## Refresh and Cache Requirements

- Scheduled or manual refreshes must use repeatable discovery inputs and verbose logs that explain source discovery, cache decisions, generated output, and checkpoint behavior.
- Fresh complete law caches may skip re-downloading for the configured cache TTL.
- Incomplete caches should be reusable so future refreshes continue from already fetched data.
- Long refreshes must preserve progress through generated docs, cache files, and refresh-status metadata.
- Source fetch failures must be logged with the affected URL and language, then represented in catalog status rather than silently converted into fallback content.

## Testing and Review Requirements

- Bug fixes must include a focused regression test that fails before the fix and passes after it when the issue can be reproduced locally.
- UI or catalog behavior changes must include browser or generated-output verification where applicable.
- Case studies must preserve issue metadata, relevant PR metadata, CI or refresh logs, live/generated catalog summaries, reproduction evidence, and final verification logs.
- Large raw logs or catalogs may be compressed, but case studies should keep short excerpts for review.
- Pull requests should report reproduction steps, implemented changes, automated tests, and any remaining upstream data limitations.
