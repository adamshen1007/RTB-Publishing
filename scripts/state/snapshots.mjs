import { closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const STATE_DIRECTORY = ".rtb-state";
export const CONTENT_DIRECTORY = ".rtb-content";
const deniedSegments = new Set([".git", STATE_DIRECTORY, CONTENT_DIRECTORY, ".env", ".ssh", "node_modules", "build", "dist", "coverage", "credentials", "secrets", "keys"]);
const excludedDirectories = new Set([".git", STATE_DIRECTORY, CONTENT_DIRECTORY, ".rtb-publishing", "node_modules", "build", "dist", "output", "coverage", ".next", ".cache", ".tmp", ".vale", ".pnpm-store", ".ssh", ".aws", ".gnupg", ".credentials", ".secrets", ".idea", ".vscode", "credentials", "secrets", "keys"]);
const sensitiveFile = (name) => name.startsWith(".env") || [".npmrc", ".netrc", ".DS_Store", "Thumbs.db", "id_rsa", "id_ed25519", "credentials", "secrets"].includes(name) || /(?:credential|secret|token)/i.test(name) || /\.(?:key|pem|p12|pfx)$/i.test(name);

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function stateDirectory(root) { return resolve(root, STATE_DIRECTORY); }
export function contentDirectory(root) { return resolve(root, CONTENT_DIRECTORY); }
export function snapshotsDirectory(root) { return resolve(contentDirectory(root), "snapshots"); }
export function preimagesDirectory(root) { return resolve(stateDirectory(root), "preimages"); }
export function pointerPath(root) { return resolve(contentDirectory(root), "current.json"); }

export function assertSafeRelativePath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 240) throw new Error("Mutation path must be a bounded non-empty relative path.");
  if (path.includes("\\") || path.includes("%") || path.startsWith("/") || path.includes("\0")) throw new Error("Mutation path must be a literal relative POSIX path.");
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || deniedSegments.has(part) || part.startsWith(".env"))) throw new Error("Mutation path contains a denied segment.");
  return path;
}

function fsyncFile(path, trace) { const fd = openSync(path, "r"); try { fsyncSync(fd); trace?.("file", path); } finally { closeSync(fd); } }
function fsyncDirectory(path, trace) { const fd = openSync(path, "r"); try { fsyncSync(fd); trace?.("directory", path); } finally { closeSync(fd); } }

export function ensureStateDirectories(root) {
  for (const directory of [stateDirectory(root), preimagesDirectory(root), contentDirectory(root), snapshotsDirectory(root)]) mkdirSync(directory, { recursive: true, mode: 0o700 });
}

function children(directory) { return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)); }
function excluded(entry) { return excludedDirectories.has(entry.name) || (entry.isDirectory() ? entry.name.startsWith(".env") : sensitiveFile(entry.name)); }
function sourcePattern(pattern) { assertSafeRelativePath(pattern.replaceAll("*", "placeholder")); return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`); }
function sourceAllowed(root, file, patterns) { return patterns.length === 0 || patterns.some((pattern) => pattern.test(relative(root, file).split(sep).join("/"))); }
function compileSourcePaths(paths = []) { return paths.map(sourcePattern); }

function assertNoSymlinkTree(root, directory = root) {
  for (const entry of children(directory)) {
    if (excluded(entry)) continue;
    const full = resolve(directory, entry.name);
    const status = lstatSync(full);
    if (status.isSymbolicLink()) throw new Error(`Canonical tree contains a symbolic link: ${relative(root, full)}`);
    if (status.isDirectory()) assertNoSymlinkTree(root, full);
    else if (!status.isFile() || status.nlink !== 1) throw new Error(`Canonical tree contains an unsupported or multiply linked entry: ${relative(root, full)}`);
  }
}

function treeEntries(root, directory = root, entries = [], patterns = []) {
  for (const entry of children(directory)) {
    if (excluded(entry)) continue;
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) treeEntries(root, full, entries, patterns);
    else if (sourceAllowed(root, full, patterns)) entries.push(relative(root, full).split(sep).join("/"));
  }
  return entries;
}

export function snapshotHash(root, { sourcePaths = [] } = {}) {
  assertNoSymlinkTree(root);
  const digest = createHash("sha256");
  for (const path of treeEntries(root, root, [], compileSourcePaths(sourcePaths))) {
    const bytes = readFileSync(resolve(root, path));
    digest.update(path); digest.update("\0"); digest.update(sha256(bytes)); digest.update("\0");
  }
  return digest.digest("hex");
}

function copyTree(source, destination, { sourceRoot = source, sourcePaths = [] } = {}) {
  assertNoSymlinkTree(source);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const entry of children(source)) {
    if (excluded(entry)) continue;
    const from = resolve(source, entry.name); const to = resolve(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to, { sourceRoot, sourcePaths });
    else if (sourceAllowed(sourceRoot, from, compileSourcePaths(sourcePaths))) copyFileSync(from, to);
  }
}

function durableTree(root, trace, sourcePaths = []) {
  for (const path of treeEntries(root, root, [], compileSourcePaths(sourcePaths))) fsyncFile(resolve(root, path), trace);
  const directories = [root];
  const collect = (directory) => { for (const entry of children(directory)) if (entry.isDirectory()) { const full = resolve(directory, entry.name); directories.push(full); collect(full); } };
  collect(root);
  for (const directory of directories.reverse()) fsyncDirectory(directory, trace);
}

export function readPointer(root) {
  const pointerEntry = lstatSync(pointerPath(root)); if (pointerEntry.isSymbolicLink() || !pointerEntry.isFile() || pointerEntry.nlink !== 1) throw new Error("Current snapshot pointer must be a private regular file with one link.");
  const pointer = JSON.parse(readFileSync(pointerPath(root), "utf8"));
  if (!/^[a-f0-9]{64}$/.test(pointer.snapshotHash) || !Number.isInteger(pointer.version) || pointer.version < 1) throw new Error("Current snapshot pointer is corrupt.");
  return pointer;
}

export function snapshotRoot(root, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid snapshot hash.");
  return resolve(snapshotsDirectory(root), hash);
}

export function verifySnapshot(root, hash) {
  const snapshot = snapshotRoot(root, hash);
  if (!existsSync(snapshot) || !statSync(snapshot).isDirectory() || snapshotHash(snapshot) !== hash) throw new Error(`Snapshot verification failed: ${hash}`);
  return snapshot;
}

export function initializeSnapshots(root, { trace, sourcePaths } = {}) {
  ensureStateDirectories(root);
  assertNoSymlinkTree(root);
  if (existsSync(pointerPath(root))) return readPointer(root);
  const initial = materializeSnapshot(root, { trace, sourcePaths });
  writePointer(root, { expected: null, nextSnapshotHash: initial.hash, nextVersion: 1, trace });
  return readPointer(root);
}

export function materializeSnapshot(projectRoot, { sourceRoot = projectRoot, sourcePaths = [], changes = [], trace } = {}) {
  const root = resolve(projectRoot);
  const source = resolve(sourceRoot);
  ensureStateDirectories(root);
  const temporary = resolve(stateDirectory(root), `snapshot-${randomUUID()}`);
  copyTree(source, temporary, { sourceRoot: source, sourcePaths });
  for (const change of changes) {
    const path = assertSafeRelativePath(change.path);
    const target = resolve(temporary, path);
    if (!target.startsWith(`${temporary}${sep}`)) throw new Error("Mutation path escapes the snapshot root.");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, change.content, { encoding: "utf8", mode: 0o600 });
  }
  durableTree(temporary, trace, sourcePaths);
  const hash = snapshotHash(temporary, { sourcePaths });
  const finalRoot = snapshotRoot(root, hash);
  if (existsSync(finalRoot)) rmSync(temporary, { recursive: true, force: true });
  else { renameSync(temporary, finalRoot); fsyncDirectory(snapshotsDirectory(root), trace); fsyncDirectory(contentDirectory(root), trace); }
  return { hash, root: finalRoot };
}

export function preservePreimages(root, snapshotHashValue, paths, { trace } = {}) {
  const prior = verifySnapshot(root, snapshotHashValue);
  const results = [];
  for (const path of paths) {
    const safe = assertSafeRelativePath(path);
    const file = resolve(prior, safe);
    if (!file.startsWith(`${prior}${sep}`)) throw new Error(`Preimage path escapes the snapshot: ${safe}`);
    if (!existsSync(file)) { results.push({ path: safe, hash: null, storage: null }); continue; }
    if (lstatSync(file).isSymbolicLink()) throw new Error(`Preimage is unavailable: ${safe}`);
    const bytes = readFileSync(file);
    const hash = sha256(bytes);
    const destination = resolve(preimagesDirectory(root), hash);
    if (!existsSync(destination)) { writeFileSync(destination, bytes, { mode: 0o600 }); fsyncFile(destination, trace); fsyncDirectory(preimagesDirectory(root), trace); }
    results.push({ path: safe, hash, storage: relative(root, destination).split(sep).join("/") });
  }
  return results;
}

export function writePointer(root, { expected, nextSnapshotHash, nextVersion, trace }) {
  verifySnapshot(root, nextSnapshotHash);
  if (expected) {
    const current = readPointer(root);
    if (current.snapshotHash !== expected.snapshotHash || current.version !== expected.version) throw new Error("Current pointer changed before publication.");
  }
  const target = pointerPath(root);
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ snapshotHash: nextSnapshotHash, version: nextVersion })}\n`, { mode: 0o600 });
  fsyncFile(temporary, trace);
  renameSync(temporary, target);
  fsyncFile(target, trace); fsyncDirectory(dirname(target), trace);
  return readPointer(root);
}

export function readSnapshot(root) {
  const pointer = readPointer(root);
  return { ...pointer, root: verifySnapshot(root, pointer.snapshotHash) };
}

export function readSnapshotFile(root, path) {
  return openSnapshotReader(root).read(path);
}

/** Pins one immutable root for the whole caller operation. */
export function openSnapshotReader(root) {
  const snapshot = readSnapshot(root);
  const read = (path) => {
  const safe = assertSafeRelativePath(path);
  const file = resolve(snapshot.root, safe);
  if (!file.startsWith(`${snapshot.root}${sep}`) || lstatSync(file).isSymbolicLink()) throw new Error("Snapshot read path is unsafe.");
  return { snapshotHash: snapshot.snapshotHash, pointerVersion: snapshot.version, content: readFileSync(file, "utf8") };
  };
  return { snapshotHash: snapshot.snapshotHash, pointerVersion: snapshot.version, read, readFiles: (paths) => paths.map((path) => ({ path, ...read(path) })) };
}
