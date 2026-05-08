import { readFile, writeFile } from "node:fs/promises";

export { readLino, writeLino } from "./lino-codec.mjs";
import { readLino, writeLino } from "./lino-codec.mjs";

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
