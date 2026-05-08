#!/usr/bin/env sh
set -eu

node scripts/discover-laws.mjs --limit 3 --output data/laws.discovered.json
node scripts/discover-regional-sources.mjs --max-pages 1 --output data/regional-sources.discovered.json
node scripts/build-site.mjs \
  --fetch \
  --manifest data/laws.discovered.json \
  --regional-sources data/regional-sources.discovered.json \
  --max-sections 5
