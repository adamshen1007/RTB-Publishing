import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BUILD_DIR = resolve(ROOT, "build");
export const DIST_DIR = resolve(ROOT, "dist");
/** Default command target only; discovery remains manifest-driven. */
export const DEFAULT_BOOK_PROJECT = resolve(ROOT, "books", "volume-01-yc-playbook");

const EXCLUDED_DIRECTORIES = new Set([".git", ".superpowers", "build", "dist", "node_modules"]);

export function listFiles(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...listFiles(absolutePath, predicate));
      }
    } else if (predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

export function markdownFiles() {
  return listFiles(ROOT, (file) => extname(file).toLowerCase() === ".md");
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    throw new Error(`${command} exited with status ${result.status}.${detail}`);
  }
  return result;
}

export function localBinary(name) {
  const executable = process.platform === "win32" ? `${name}.cmd` : name;
  return resolve(ROOT, "node_modules", ".bin", executable);
}

export function relativeToRoot(file) {
  return file.slice(ROOT.length + 1);
}
