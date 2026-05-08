import http from "node:http";
import https from "node:https";

import { createLogger } from "./logging.mjs";

const DEFAULT_HEADERS = {
  // India Code currently rejects Node fetch and several descriptive agents,
  // while accepting curl's default agent. Keep contact details in a header.
  "User-Agent": "curl/8.5.0",
  "X-Contact": "https://github.com/Svetozar-Technologies/indian-law",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8"
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(url, options = {}) {
  const body = await fetchBuffer(url, options);
  return body.toString("utf8");
}

export async function fetchBuffer(url, options = {}) {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 60000;
  const logger = options.logger === false ? undefined : options.logger ?? createLogger("http", { quiet: options.quiet });
  let lastError;

  logger?.info(`HTTP fetch scheduled for ${url} with ${retries + 1} attempt(s), timeout ${timeoutMs}ms`);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      logger?.info(`HTTP attempt ${attempt + 1}/${retries + 1}: GET ${url}`);
      return await requestBuffer(url, {
        headers: {
          ...DEFAULT_HEADERS,
          ...(options.headers ?? {})
        },
        logger,
        timeoutMs
      });
    } catch (error) {
      lastError = error;
      logger?.warn(`HTTP attempt ${attempt + 1}/${retries + 1} failed for ${url}: ${error.message}`);
      if (attempt < retries) {
        logger?.info(`Waiting ${options.retryDelayMs ?? 1000}ms before retrying ${url}`);
        await sleep(options.retryDelayMs ?? 1000);
      }
    }
  }

  logger?.error(`HTTP fetch failed after ${retries + 1} attempt(s) for ${url}: ${lastError.message}`);
  throw lastError;
}

function requestBuffer(rawUrl, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const client = url.protocol === "http:" ? http : https;
    const request = client.get(
      url,
      {
        headers: options.headers
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        options.logger?.info(`HTTP response ${statusCode} ${response.statusMessage ?? ""} for ${rawUrl}`.trim());
        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume();
          if (redirectCount >= 5) {
            reject(new Error(`Too many redirects for ${rawUrl}`));
            return;
          }
          const redirectUrl = new URL(response.headers.location, url).toString();
          options.logger?.info(`Following redirect ${redirectCount + 1}/5 from ${rawUrl} to ${redirectUrl}`);
          resolve(requestBuffer(redirectUrl, options, redirectCount + 1));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode} ${response.statusMessage} for ${rawUrl}`));
            return;
          }
          options.logger?.info(`HTTP completed ${rawUrl}: ${body.byteLength} byte(s)`);
          resolve(body);
        });
      }
    );

    request.setTimeout(options.timeoutMs ?? 60000, () => {
      options.logger?.warn(`HTTP timeout after ${options.timeoutMs ?? 60000}ms for ${rawUrl}`);
      request.destroy(new Error(`Request timed out for ${rawUrl}`));
    });
    request.on("error", reject);
  });
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    headers: {
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      ...(options.headers ?? {})
    }
  });
  return JSON.parse(text);
}
