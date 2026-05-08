#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchBuffer, sleep } from "./lib/http.mjs";
import { readDataFile } from "./lib/lino.mjs";
import { createLogger } from "./lib/logging.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(ROOT, args.manifest ?? "data/laws.seed.lino");
  const outputDir = path.resolve(args.output ?? "/tmp/indian-law-source-smoke");
  const maxSources = Number(args["max-sources"] ?? 1);
  const minBytes = Number(args["min-bytes"] ?? 1024);
  const delayMs = Number(args["delay-ms"] ?? 1100);
  const quiet = Boolean(args.quiet);
  const logger = createLogger("smoke-download-source", { quiet });
  const httpLogger = createLogger("http", { quiet });
  logger.info("Starting official source smoke download");
  logger.info(
    `Options: manifest=${path.relative(ROOT, manifestPath)}, output=${outputDir}, maxSources=${maxSources}, minBytes=${minBytes}, delayMs=${delayMs}`
  );
  logger.info(`Reading law manifest from ${path.relative(ROOT, manifestPath)}`);
  const manifest = await readDataFile(manifestPath);
  logger.info(`Loaded ${manifest.laws?.length ?? 0} law(s) from manifest`);
  const sources = officialSources(manifest.laws ?? []);
  logger.info(`Queued ${sources.length} official source(s) after sorting by source type`);

  if (sources.length === 0) {
    throw new Error(`No official source URLs found in ${path.relative(ROOT, manifestPath)}`);
  }

  logger.info(`Creating download output directory ${outputDir}`);
  await mkdir(outputDir, { recursive: true });
  let downloaded = 0;
  for (const source of sources) {
    logger.info(
      `Downloading source ${downloaded + 1}/${Math.min(maxSources, sources.length)}: ${source.language} ${
        source.kind
      } for ${source.lawSlug} from ${source.url}`
    );
    const body = await fetchBuffer(source.url, {
      logger: httpLogger,
      headers: {
        Accept: source.kind === "pdf" ? "application/pdf,*/*;q=0.8" : "text/html,*/*;q=0.8"
      }
    });
    logger.info(`Downloaded ${body.byteLength} byte(s) from ${source.url}`);
    if (body.byteLength < minBytes) {
      throw new Error(`Downloaded ${body.byteLength} bytes from ${source.url}; expected at least ${minBytes}`);
    }

    const fileName = `${String(downloaded + 1).padStart(2, "0")}-${source.lawSlug}-${source.language}.${source.kind}`;
    logger.info(`Writing source body to ${path.join(outputDir, fileName)}`);
    await writeFile(path.join(outputDir, fileName), body);
    console.log(`Downloaded ${body.byteLength} bytes from ${source.url}`);
    downloaded += 1;
    if (downloaded >= maxSources) {
      logger.info(`Reached max-sources limit ${maxSources}`);
      break;
    }
    logger.info(`Waiting ${delayMs}ms before next source download`);
    await sleep(delayMs);
  }

  logger.info(`Completed official source smoke download with ${downloaded} file(s)`);
  console.log(`Downloaded ${downloaded} official law source(s) into ${outputDir}`);
}

function officialSources(laws) {
  const sources = [];
  for (const law of laws) {
    for (const [language, entries] of Object.entries(law.sources ?? {})) {
      for (const source of entries ?? []) {
        if (!source.url) {
          continue;
        }
        sources.push({
          lawSlug: law.slug ?? "law",
          language,
          kind: source.kind ?? fileKind(source.url),
          url: source.url
        });
      }
    }
  }
  return sources.sort((left, right) => sourceRank(left) - sourceRank(right));
}

function sourceRank(source) {
  return source.kind === "pdf" ? 0 : 1;
}

function fileKind(url) {
  return new URL(url).pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args[key] = argv[index + 1];
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
