#!/usr/bin/env sh
set -eu

node scripts/discover-laws.mjs --limit 3 --output data/laws.discovered.lino
node scripts/discover-regional-sources.mjs --max-pages 1 --output data/regional-sources.discovered.lino
node scripts/build-site.mjs \
  --fetch \
  --manifest data/laws.discovered.lino \
  --regional-sources data/regional-sources.discovered.lino \
  --max-sections 5
