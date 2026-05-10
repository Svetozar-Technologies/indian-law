import { Parser } from "links-notation";

const parser = new Parser({ maxInputSize: 128 * 1024 * 1024 });
const MAX_ID_LENGTH = 96;
const TYPE_MARKERS = new Set(["null", "undefined", "bool", "int", "float", "str", "string", "array", "object"]);

export function readLino(notation) {
  const links = parser.parse(notation);
  return new ReadableLinoDecoder(links).decode();
}

export function writeLino(value) {
  const notation = encodeIndentedLino(value);
  try {
    parser.parse(notation);
  } catch (error) {
    const line = error.location?.start?.line;
    const context = line ? notation.split(/\r?\n/).slice(Math.max(0, line - 12), line + 3).join("\n") : "";
    const validationError = new Error(
      `Generated invalid Links Notation${line ? ` near line ${line}` : ""}: ${error.message}${context ? `\n${context}` : ""}`
    );
    throw validationError;
  }
  return notation;
}

class ReadableLinoDecoder {
  constructor(links) {
    this.links = links;
    this.definitions = new Map(links.filter((link) => link.id).map((link) => [link.id, link]));
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

  decodeLink(link, options = {}) {
    if (link.id && this.memo.has(link.id)) {
      return this.memo.get(link.id);
    }

    if (!link.values || link.values.length === 0) {
      if (isObjectReference(link.id)) {
        const definition = this.definitions.get(link.id);
        if (definition && definition !== link) {
          return this.decodeLink(definition);
        }
        if (definition === link) {
          return [];
        }
      }
      return decodeUntypedScalar(link.id);
    }

    if (options.stringWrapper && isStringWrapper(link)) {
      return decodeStringWrapper(link);
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
    if (typeMarker === "string") {
      return link.values.slice(1).map(decodeStringLine).join("\n");
    }
    if (typeMarker === "array") {
      const result = [];
      if (selfReferenceId) {
        this.memo.set(selfReferenceId, result);
      }
      for (const item of link.values.slice(1)) {
        result.push(isArrayStringMarker(item) ? decodeArrayStringMarker(item) : this.decodeLink(item, { stringWrapper: true }));
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

    return this.decodeUntypedCollection(link, selfReferenceId);
  }

  decodeUntypedCollection(link, selfReferenceId) {
    if (isEmptyObjectMarker(link)) {
      const result = {};
      if (selfReferenceId) {
        this.memo.set(selfReferenceId, result);
      }
      return result;
    }

    if (isUntypedObject(link)) {
      const result = {};
      if (selfReferenceId) {
        this.memo.set(selfReferenceId, result);
      }
      for (const pair of link.values) {
        const key = decodeUntypedKey(pair.values[0]);
        result[key] = this.decodeLink(pair.values[1], { stringWrapper: true });
      }
      return result;
    }

    const result = [];
    if (selfReferenceId) {
      this.memo.set(selfReferenceId, result);
    }
    for (const item of link.values) {
      result.push(this.decodeLink(item, { stringWrapper: true }));
    }
    return result;
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
  if (typeof value === "string" && (value === "" || /[\r\n]/.test(value))) {
    return encodeStringDefinition(value, context, pathHint);
  }
  return encodeScalar(value);
}

function encodeStringDefinition(value, context, pathHint) {
  const id = reserveId(context, pathHint);
  context.definitions.push({
    id,
    type: "string",
    entries: value.split("\n")
  });
  return { kind: "ref", id };
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
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return { kind: "scalar", value };
  }
  throw new TypeError(`Unsupported type: ${typeof value}`);
}

function formatDefinition(definition) {
  const lines = [`${definition.id}:`];
  if (definition.type === "string") {
    lines.push("  string");
    for (const line of definition.entries) {
      lines.push(line === "" ? "  line" : `  line ${formatStringLiteral(line)}`);
    }
  } else if (definition.type === "array") {
    const explicitArray = definition.entries.some(needsArrayStringMarker);
    if (explicitArray) {
      lines.push("  array");
    }
    for (const entry of definition.entries) {
      lines.push(`  ${formatArrayValue(entry, explicitArray)}`);
    }
  } else {
    if (definition.entries.length === 0) {
      lines.push("  object");
    } else {
      for (const entry of definition.entries) {
        lines.push(`  ${formatKey(entry.key)} ${formatValue(entry.value, "pair")}`);
      }
    }
  }
  return lines.join("\n");
}

function formatArrayValue(value, explicitArray) {
  if (explicitArray && needsArrayStringMarker(value)) {
    return `string ${formatStringLiteral(value.value)}`;
  }
  return formatValue(value, "array");
}

function formatValue(value, mode) {
  if (value.kind === "ref") {
    return value.id;
  }
  return formatScalar(value, mode);
}

function formatScalar(value, mode) {
  if (value.value === null) {
    return "null";
  }
  if (value.value === undefined) {
    return "undefined";
  }
  if (typeof value.value === "boolean") {
    return String(value.value);
  }
  if (typeof value.value === "number") {
    if (Number.isNaN(value.value)) {
      return "NaN";
    }
    if (!Number.isFinite(value.value)) {
      return value.value > 0 ? "Infinity" : "-Infinity";
    }
    return String(value.value);
  }
  if (typeof value.value === "string") {
    const reference = formatStringLiteral(value.value);
    return needsStringWrapper(value.value) ? `(${reference})` : reference;
  }
  throw new TypeError(`Unsupported scalar type: ${typeof value.value}`);
}

function formatKey(value) {
  return formatStringLiteral(value.value);
}

function formatStringLiteral(value) {
  return value === "" ? "``" : formatReference(value);
}

function formatReference(value) {
  if (value === "") {
    return "";
  }
  const text = String(value);
  if (!/[\s()'":`]/.test(text)) {
    return text;
  }
  if (text.includes("`")) {
    return `'${text.replace(/'/g, "''")}'`;
  }
  return `\`${text}\``;
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

function isStringWrapper(link) {
  return !link.id && link.values?.length === 1 && (!link.values[0].values || link.values[0].values.length === 0);
}

function decodeStringWrapper(link) {
  const value = link.values[0]?.id ?? "";
  return value === "\"\"" || value === "''" || value === "``" ? "" : value;
}

function decodeStringLine(link) {
  if (!link.id && link.values?.[0]?.id === "line") {
    const value = link.values[1]?.id ?? "";
    return value === "\"\"" || value === "''" || value === "``" ? "" : value;
  }
  if (link.id === "line") {
    const value = link.values?.[0]?.id ?? "";
    return value === "\"\"" || value === "''" || value === "``" ? "" : value;
  }
  const value = link.id ?? "";
  return value === "\"\"" || value === "''" || value === "``" ? "" : value;
}

function decodeUntypedScalar(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "null") {
    return null;
  }
  if (value === "undefined") {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "NaN") {
    return NaN;
  }
  if (value === "Infinity") {
    return Infinity;
  }
  if (value === "-Infinity") {
    return -Infinity;
  }
  if (isNumericReference(value)) {
    return Number(value);
  }
  return value;
}

function decodeUntypedKey(link) {
  if (isStringWrapper(link)) {
    return decodeStringWrapper(link);
  }
  if (link.id === "\"\"" || link.id === "''" || link.id === "``") {
    return "";
  }
  return link.id ?? String(decodeUntypedScalar(link.id));
}

function isUntypedObject(link) {
  return link.values.every((child) => child.values?.length === 2);
}

function isEmptyObjectMarker(link) {
  return link.values.length === 1 && link.values[0]?.id === "object" && (!link.values[0].values || link.values[0].values.length === 0);
}

function needsStringWrapper(value) {
  return (
    value === "" ||
    TYPE_MARKERS.has(value) ||
    isObjectReference(value) ||
    isNumericReference(value) ||
    ["true", "false", "NaN", "Infinity", "-Infinity"].includes(value)
  );
}

function needsArrayStringMarker(value) {
  return value.kind === "scalar" && typeof value.value === "string" && needsStringWrapper(value.value);
}

function isArrayStringMarker(link) {
  return link.values?.length === 2 && link.values[0]?.id === "string";
}

function decodeArrayStringMarker(link) {
  const value = link.values[1]?.id ?? "";
  return value === "\"\"" || value === "''" || value === "``" ? "" : value;
}

function isNumericReference(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value));
}
