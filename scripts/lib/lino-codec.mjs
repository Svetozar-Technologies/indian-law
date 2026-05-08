import { Parser } from "links-notation";

const parser = new Parser();
const MAX_ID_LENGTH = 96;

export function readLino(notation) {
  const links = parser.parse(notation);
  return new ReadableLinoDecoder(links).decode();
}

export function writeLino(value) {
  const notation = encodeIndentedLino(value);
  parser.parse(notation);
  return notation;
}

class ReadableLinoDecoder {
  constructor(links) {
    this.links = links;
    this.memo = new Map();
  }

  decode() {
    if (!this.links || this.links.length === 0) {
      return null;
    }

    let link = this.links[0];
    if (!link.id && link.values?.length === 1 && isObjectReference(link.values[0].id)) {
      link = link.values[0];
    }

    return this.decodeLink(link);
  }

  decodeLink(link) {
    if (link.id && this.memo.has(link.id)) {
      return this.memo.get(link.id);
    }

    if (!link.values || link.values.length === 0) {
      if (isObjectReference(link.id)) {
        const definition = this.links.find((candidate) => candidate.id === link.id && candidate.values?.length > 0);
        if (definition) {
          return this.decodeLink(definition);
        }
      }
      return link.id ?? null;
    }

    const selfReferenceId = isObjectReference(link.id) ? link.id : "";
    const typeMarker = link.values[0]?.id;

    if (typeMarker === "null") {
      return null;
    }
    if (typeMarker === "undefined") {
      return undefined;
    }
    if (typeMarker === "bool") {
      return link.values[1]?.id === "true";
    }
    if (typeMarker === "int") {
      return Number.parseInt(link.values[1]?.id ?? "0", 10);
    }
    if (typeMarker === "float") {
      return decodeFloat(link.values[1]?.id ?? "0");
    }
    if (typeMarker === "str") {
      return link.values[1]?.id ?? "";
    }
    if (typeMarker === "array") {
      const result = [];
      if (selfReferenceId) {
        this.memo.set(selfReferenceId, result);
      }
      for (const item of link.values.slice(1)) {
        result.push(this.decodeLink(item));
      }
      return result;
    }
    if (typeMarker === "object") {
      const result = {};
      if (selfReferenceId) {
        this.memo.set(selfReferenceId, result);
      }
      for (const pair of link.values.slice(1)) {
        if (!pair.values || pair.values.length < 2) {
          continue;
        }
        const key = this.decodeLink(pair.values[0]);
        result[key] = this.decodeLink(pair.values[1]);
      }
      return result;
    }

    throw new Error(`Unknown Lino type marker: ${typeMarker}`);
  }
}

function decodeFloat(value) {
  if (value === "NaN") {
    return NaN;
  }
  if (value === "Infinity") {
    return Infinity;
  }
  if (value === "-Infinity") {
    return -Infinity;
  }
  return Number.parseFloat(value);
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
      tokens: ["str", formatReference(value)]
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

function formatReference(value) {
  if (value === "") {
    return "";
  }
  const text = String(value);
  if (!/[\s()'":`]/.test(text)) {
    return text;
  }
  for (let size = 1; size <= 6; size += 1) {
    const quote = "`".repeat(size);
    if (!text.includes(quote)) {
      return `${quote}${text}${quote}`;
    }
  }
  return `\`${text.replace(/`/g, "``")}\``;
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

function isObjectReference(value) {
  return typeof value === "string" && value.startsWith("obj_");
}
