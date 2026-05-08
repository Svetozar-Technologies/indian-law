import { readFile, writeFile } from "node:fs/promises";

import { decode, encode } from "lino-objects-codec";
import { Parser } from "links-notation";

const parser = new Parser();

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
  const notation = encode({ obj: value });
  parser.parse(notation);
  return notation;
}
