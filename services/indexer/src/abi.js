import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const abi = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "abi-NarrativeThrone.json"), "utf8"));

export const throneAbi = abi.filter((item) => item.type === "event");

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : ZERO_ADDRESS;
}

export function normalizeBytes(value) {
  return value ? String(value).toLowerCase() : "0x";
}
