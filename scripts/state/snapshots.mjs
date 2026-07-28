import { closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const STATE_DIRECTORY = ".rtb-state";
const deniedSegments = new Set([".git", ".rtb-state", ".env", ".ssh", "node_modules"]);

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function stateDirectory(root) { return resolve(root, STATE_DIRECTORY); }
export function snapshotsDirectory(root) { return resolve(stateDirectory(root), "snapshots"); }
export function preimagesDirectory(root) { return resolve(stateDirectory(root), "preimages"); }
export function pointerPath(root) { return resolve(stateDirectory(root), "current.json"); }

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
  for (const directory of [stateDirectory(root), snapshotsDirectory(root), preimagesDirectory(root)]) mkdirSync(directory, { recursive: true, mode: 0o700 });
}

function children(directory) { return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)); }

function assertNoSymlinkTree(root, directory = root) {
  for (const entry of children(directory)) {
    if (entry.name === STATE_DIRECTORY && directory === root) continue;
    const full = resolve(directory, entry.name);
    const status = lstatSync(full);
    if (status.isSymbolicLink()) throw new Error(`Canonical tree contains a symbolic link: ${relative(root, full)}`);
    if (status.isDirectory()) assertNoSymlinkTree(root, full);
    else if (!status.isFile()) throw new Error(`Canonical tree contains an unsupported entry: ${relative(root, full)}`);
  }
}

function treeEntries(root, directory = root, entries = []) {
  for (const entry of children(directory)) {
    if (entry.name === STATE_DIRECTORY && directory === root) continue;
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) treeEntries(root, full, entries);
    else entries.push(relative(root, full).split(sep).join("/"));
  }
  return entries;
}

export function snapshotHash(root) {
  assertNoSymlinkTree(root);
  const digest = createHash("sha256");
  for (const path of treeEntries(root)) {
    const bytes = readFileSync(resolve(root, path));
    digest.update(path); digest.update("\0"); digest.update(sha256(bytes)); digest.update("\0");
  }
  return digest.digest("hex");
}

function copyTree(source, destination) {
  assertNoSymlinkTree(source);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const entry of children(source)) {
    if (entry.name === STATE_DIRECTORY) continue;
    const from = resolve(source, entry.name); const to = resolve(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else copyFileSync(from, to);
  }
}

function durableTree(root, trace) {
  for (const path of treeEntries(root)) fsyncFile(resolve(root, path), trace);
  const directories = [root];
  const collect = (directory) => { for (const entry of children(directory)) if (entry.isDirectory()) { const full = resolve(directory, entry.name); directories.push(full); collect(full); } };
  collect(root);
  for (const directory of directories.reverse()) fsyncDirectory(directory, trace);
}

export function readPointer(root) {
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

export function initializeSnapshots(root, { trace } = {}) {
  ensureStateDirectories(root);
  assertNoSymlinkTree(root);
  if (existsSync(pointerPath(root))) return readPointer(root);
  const initial = materializeSnapshot(root, { trace });
  writePointer(root, { expected: null, nextSnapshotHash: initial.hash, nextVersion: 1, trace });
  return readPointer(root);
}

export function materializeSnapshot(projectRoot, { sourceRoot = projectRoot, changes = [], trace } = {}) {
  const root = resolve(projectRoot);
  const source = resolve(sourceRoot);
  ensureStateDirectories(root);
  const temporary = resolve(stateDirectory(root), `snapshot-${randomUUID()}`);
  copyTree(source, temporary);
  for (const change of changes) {
    const path = assertSafeRelativePath(change.path);
    const target = resolve(temporary, path);
    if (!target.startsWith(`${temporary}${sep}`)) throw new Error("Mutation path escapes the snapshot root.");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, change.content, { encoding: "utf8", mode: 0o600 });
  }
  durableTree(temporary, trace);
  const hash = snapshotHash(temporary);
  const finalRoot = snapshotRoot(root, hash);
  if (existsSync(finalRoot)) rmSync(temporary, { recursive: true, force: true });
  else { renameSync(temporary, finalRoot); fsyncDirectory(snapshotsDirectory(root), trace); }
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
  const snapshot = readSnapshot(root); // Resolve exactly once; readers never mix roots.
  const safe = assertSafeRelativePath(path);
  const file = resolve(snapshot.root, safe);
  if (!file.startsWith(`${snapshot.root}${sep}`) || lstatSync(file).isSymbolicLink()) throw new Error("Snapshot read path is unsafe.");
  return { snapshotHash: snapshot.snapshotHash, pointerVersion: snapshot.version, content: readFileSync(file, "utf8") };
}
