import http from "node:http";
import https from "node:https";

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
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestBuffer(url, {
        headers: {
          ...DEFAULT_HEADERS,
          ...(options.headers ?? {})
        },
        timeoutMs
      });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(options.retryDelayMs ?? 1000);
      }
    }
  }

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
        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume();
          if (redirectCount >= 5) {
            reject(new Error(`Too many redirects for ${rawUrl}`));
            return;
          }
          resolve(requestBuffer(new URL(response.headers.location, url).toString(), options, redirectCount + 1));
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
          resolve(body);
        });
      }
    );

    request.setTimeout(options.timeoutMs ?? 60000, () => {
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
