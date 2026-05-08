import { readFile, writeFile } from "node:fs/promises";

import { decode } from "lino-objects-codec";
import { Parser } from "links-notation";

const parser = new Parser();
const MAX_ID_LENGTH = 96;

export async function readDataFile(filePath) {
  const text = await readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return JSON.parse(text);
  }
  return readLino(text);
}

export async function writeDataFile(filePath, value) {
  if (filePath.endsWith(".json")) {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  await writeFile(filePath, `${writeLino(value)}\n`);
}

export function readLino(notation) {
  parser.parse(notation);
  return decode({ notation });
}

export function writeLino(value) {
  const notation = encodeIndentedLino(value);
  parser.parse(notation);
  return notation;
}

function encodeIndentedLino(value) {
  const context = {
    seen: new Map(),
    definitions: [],
    usedIds: new Map()
  };
  const root = encodeValue(value, context, "root");
  if (root.kind === "ref") {
    return context.definitions.map(formatDefinition).join("\n");
  }
  return formatScalar(root, "root");
}

function encodeValue(value, context, pathHint) {
  if (value !== null && typeof value === "object") {
    return encodeCollection(value, context, pathHint);
  }
  return encodeScalar(value);
}

function encodeCollection(value, context, pathHint) {
  const existingId = context.seen.get(value);
  if (existingId) {
    return { kind: "ref", id: existingId };
  }

  const id = reserveId(context, pathHint);
  context.seen.set(value, id);
  const definition = {
    id,
    type: Array.isArray(value) ? "array" : "object",
    entries: []
  };
  context.definitions.push(definition);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      definition.entries.push(encodeValue(item, context, arrayItemPath(pathHint, item, index)));
    });
  } else {
    for (const [key, entryValue] of Object.entries(value)) {
      definition.entries.push({
        key: encodeScalar(key),
        value: encodeValue(entryValue, context, `${pathHint}_${key}`)
      });
    }
  }

  return { kind: "ref", id };
}

function encodeScalar(value) {
  if (value === null) {
    return { kind: "scalar", tokens: ["null"] };
  }
  if (value === undefined) {
    return { kind: "scalar", tokens: ["undefined"] };
  }
  if (typeof value === "boolean") {
    return { kind: "scalar", tokens: ["bool", String(value)] };
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return { kind: "scalar", tokens: ["float", "NaN"] };
    }
    if (!Number.isFinite(value)) {
      return { kind: "scalar", tokens: ["float", value > 0 ? "Infinity" : "-Infinity"] };
    }
    return {
      kind: "scalar",
      tokens: [Number.isInteger(value) ? "int" : "float", String(value)]
    };
  }
  if (typeof value === "string") {
    return {
      kind: "scalar",
      tokens: ["str", Buffer.from(value, "utf8").toString("base64")]
    };
  }
  throw new TypeError(`Unsupported type: ${typeof value}`);
}

function formatDefinition(definition) {
  const lines = [`${definition.id}:`, `  ${definition.type}`];
  if (definition.type === "array") {
    for (const entry of definition.entries) {
      lines.push(`  ${formatValue(entry, "array")}`);
    }
  } else {
    for (const entry of definition.entries) {
      lines.push(`  ${formatScalar(entry.key, "pair")} ${formatValue(entry.value, "pair")}`);
    }
  }
  return lines.join("\n");
}

function formatValue(value, mode) {
  if (value.kind === "ref") {
    return value.id;
  }
  return formatScalar(value, mode);
}

function formatScalar(value, mode) {
  const inline = value.tokens.join(" ");
  if (mode === "array" && value.tokens.length === 1) {
    return `${inline} ()`;
  }
  if (mode === "array" && value.tokens.length > 1 && value.tokens[1] !== "") {
    return inline;
  }
  if (mode === "root" && value.tokens.length > 1 && value.tokens[1] !== "") {
    return inline;
  }
  return `(${inline})`;
}

function reserveId(context, pathHint) {
  const base = `obj_${sanitizeId(pathHint)}`;
  const count = context.usedIds.get(base) ?? 0;
  context.usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

function sanitizeId(value) {
  const sanitized = String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_ID_LENGTH)
    .replace(/_+$/g, "");
  return sanitized || "value";
}

function arrayItemPath(pathHint, item, index) {
  const semanticId = semanticArrayItemId(item);
  return semanticId ? `${pathHint}_${semanticId}` : `${pathHint}_${index + 1}`;
}

function semanticArrayItemId(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "";
  }
  for (const key of ["slug", "code", "handle", "language", "sectionNo", "file", "title", "name"]) {
    if (typeof item[key] === "string" && item[key]) {
      return item[key];
    }
  }
  return "";
}
