import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { ROOT, run } from "../lib.mjs";

export const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex");
export const fileHash = (file) => sha256(readFileSync(file));
export function fileHashChunked(file, chunkBytes = 8 * 1024 * 1024) { const hash = createHash("sha256"), descriptor = openSync(file, "r"), buffer = Buffer.allocUnsafe(chunkBytes); try { for (;;) { const bytes = readSync(descriptor, buffer, 0, buffer.length, null); if (!bytes) break; hash.update(buffer.subarray(0, bytes)); } return hash.digest("hex"); } finally { closeSync(descriptor); } }
export const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function writeJson(file, value) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
export function command(command, args, options = {}) { return run(command, args, { ...options, capture: true }); }
export const repositoryPath = (file) => relative(ROOT, resolve(file)).split("\\").join("/");
export function requireFile(name, value) { if (!value) throw new Error(`${name} is required for the pinned publishing profile.`); try { readFileSync(value); } catch { throw new Error(`${name} must name an existing pinned tool file.`); } return resolve(value); }
export function materialHash(value) { return sha256(stable(value)); }
