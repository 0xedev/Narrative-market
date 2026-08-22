import { keccak256, toBytes } from "viem";

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createContentUri(kind: "question" | "answer", text: string) {
  const payload = JSON.stringify({ kind, text: text.trim() });
  return `data:application/json;base64,${toBase64(payload)}`;
}

export function contentHash(text: string) {
  return keccak256(toBytes(normalizeAnswer(text)));
}

export function decodeContentUri(uri: string) {
  if (!uri) return "";
  if (!uri.startsWith("data:application/json;base64,")) return uri;
  const encoded = uri.slice("data:application/json;base64,".length);
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as { text?: string; content?: string };
  return payload.text ?? payload.content ?? "";
}
