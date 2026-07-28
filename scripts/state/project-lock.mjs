import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const liveHandles = new WeakMap();
export function pinPhysicalDirectory(path) { const requested = resolve(path), entry = lstatSync(requested); if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Trusted root must be a real directory, not a symbolic link."); const physicalPath = realpathSync(requested), status = statSync(physicalPath); return Object.freeze({ path: physicalPath, dev: status.dev, ino: status.ino }); }
function sameIdentity(left, right) { return left?.path === right.path && left?.dev === right.dev && left?.ino === right.ino; }
function entryIdentity(path, expected) { const value = lstatSync(path); if (value.isSymbolicLink() || expected === "directory" && !value.isDirectory() || expected === "file" && (!value.isFile() || value.nlink !== 1)) throw new Error(`Trusted ${expected} identity is unsafe.`); return Object.freeze({ path: realpathSync(path), dev: value.dev, ino: value.ino, mode: value.mode, nlink: value.nlink }); }
export function pinPhysicalEntry(path, expected = "directory") { return entryIdentity(resolve(path), expected); }
export function assertPinnedEntry(identity, expected = "directory") { const current = entryIdentity(identity.path, expected); if (!sameIdentity(identity, current) || expected === "file" && current.nlink !== 1) throw new Error(`Trusted ${expected} identity changed after it was pinned.`); return current; }
export function assertPinnedDirectory(identity) { const current = pinPhysicalDirectory(identity.path); if (!sameIdentity(identity, current)) throw new Error("Trusted directory identity changed after it was pinned."); return current; }
export function assertNoSymlinkPath(root, target, { allowMissing = true } = {}) { const base = pinPhysicalDirectory(root), destination = resolve(target), rel = relative(base.path, destination); if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Trusted path escapes its physical root."); let cursor = base.path; for (const part of rel.split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if (!existsSync(cursor)) { if (!allowMissing) throw new Error(`Trusted path does not exist: ${cursor}`); continue; } const entry = lstatSync(cursor); if (entry.isSymbolicLink()) throw new Error(`Trusted path contains a symbolic link: ${cursor}`); } return { root: base, path: destination }; }
export function ensurePhysicalDirectory(root, target) { const checked = assertNoSymlinkPath(root, target); let cursor = checked.root.path; for (const part of relative(checked.root.path, checked.path).split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 }); const entry = lstatSync(cursor); if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Trusted directory path is not a physical directory: ${cursor}`); assertPinnedDirectory(checked.root); } return pinPhysicalDirectory(checked.path); }
function ensureSecureParent(identity, lockPath) { assertPinnedDirectory(identity); const parent = dirname(lockPath); assertNoSymlinkPath(identity.path, parent); if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 }); assertNoSymlinkPath(identity.path, parent, { allowMissing: false }); }
function quarantineObserved(lockPath, observed, parentIdentity) {
  assertPinnedEntry(parentIdentity, "directory");
  const current = lstatSync(lockPath); if (current.dev !== observed.dev || current.ino !== observed.ino) return false;
  const quarantine = resolve(dirname(lockPath), `.lock-reclaim-${randomUUID()}`); renameSync(lockPath, quarantine); assertPinnedEntry(parentIdentity, "directory");
  const moved = lstatSync(quarantine);
  if (moved.dev !== observed.dev || moved.ino !== observed.ino) { if (!existsSync(lockPath)) renameSync(quarantine, lockPath); return false; }
  rmSync(quarantine); return true;
}
function openHandle(lockPath, ownerId, now, rootIdentity, kind) { ensureSecureParent(rootIdentity, lockPath); const parentIdentity = entryIdentity(dirname(lockPath), "directory"), fd = openSync(lockPath, "wx", 0o600), content = `${JSON.stringify({ pid: process.pid, ownerId, acquiredAt: new Date(now()).toISOString() })}\n`; writeFileSync(fd, content); const descriptor = fstatSync(fd), fileIdentity = entryIdentity(lockPath, "file"); if (!descriptor.isFile() || descriptor.nlink !== 1 || descriptor.dev !== fileIdentity.dev || descriptor.ino !== fileIdentity.ino) { closeSync(fd); try { quarantineObserved(lockPath, descriptor, parentIdentity); } catch {} throw new Error("Lock descriptor identity is unsafe."); } let released = false; const handle = { ownerId, path: lockPath, release() { if (released) return; released = true; const state = liveHandles.get(handle); liveHandles.delete(handle); try { if (state && liveState(state, rootIdentity.path, kind, false)) quarantineObserved(lockPath, state.fileIdentity, state.parentIdentity); } finally { closeSync(fd); } } }; liveHandles.set(handle, { lockPath, rootIdentity, parentIdentity, fileIdentity, content, fd, kind }); return handle; }

function liveState(state, root, kind, throwOnFailure = true) { try { const currentRoot = pinPhysicalDirectory(root), expectedPath = kind === "workspace" ? workspaceOutputLockPath(currentRoot.path) : projectLockPath(currentRoot.path), parent = entryIdentity(dirname(expectedPath), "directory"), file = entryIdentity(expectedPath, "file"), descriptor = fstatSync(state.fd), content = readFileSync(expectedPath, "utf8"); const valid = state.kind === kind && state.lockPath === expectedPath && sameIdentity(state.rootIdentity, currentRoot) && sameIdentity(state.parentIdentity, parent) && state.fileIdentity.dev === file.dev && state.fileIdentity.ino === file.ino && descriptor.isFile() && descriptor.nlink === 1 && descriptor.dev === file.dev && descriptor.ino === file.ino && content === state.content; if (!valid) throw new Error("Lock authority physical identity changed."); return true; } catch (error) { if (throwOnFailure) throw new Error("A live unforgeable lock handle with its original exact root physical identity, parent, file, descriptor, and owner content is required.", { cause: error }); return false; } }

function ownerIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

/**
 * An O_EXCL lock is deliberately non-expiring. A stale file can be removed only
 * after its recorded process is proven dead; a lease expiry never authorizes it.
 */
async function acquireLockAt(root, kind, { timeoutMs = 5000, pollMs = 20, ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now(), heldMessage = "Project writer lock is held by a live writer.", beforeStaleReclaim } = {}) {
  const rootIdentity = pinPhysicalDirectory(root), lockPath = kind === "workspace" ? workspaceOutputLockPath(rootIdentity.path) : projectLockPath(rootIdentity.path);
  const started = now();
  while (true) {
    try {
      return openHandle(lockPath, ownerId, now, rootIdentity, kind);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner, observed;
      try { observed = lstatSync(lockPath); owner = JSON.parse(readFileSync(lockPath, "utf8")); } catch { owner = undefined; }
      if (owner && !ownerIsAlive(owner.pid)) { beforeStaleReclaim?.({ lockPath, observed }); const parentIdentity = pinPhysicalEntry(dirname(lockPath), "directory"); try { if (quarantineObserved(lockPath, observed, parentIdentity)) continue; } catch (race) { if (race.code !== "ENOENT") throw race; } continue; }
      if (now() - started >= timeoutMs) throw new Error(heldMessage);
      await pause(pollMs);
    }
  }
}

export async function acquireProjectLock(projectRoot, options = {}) { return acquireLockAt(projectRoot, "project", options); }

export function projectLockPath(projectRoot) { return resolve(projectRoot, ".rtb-state", "writer.lock"); }
export function workspaceOutputLockPath(workspaceRoot) { return resolve(workspaceRoot, ".rtb-state", "workspace-output.lock"); }
export function hasProjectLock(projectRoot) { return existsSync(projectLockPath(projectRoot)); }
function assertLive(handle, root, kind) { const state = handle && liveHandles.get(handle); if (!state) throw new Error(`A live unforgeable ${kind === "workspace" ? "workspace output" : "project"} lock handle for this exact root and physical identity is required.`); liveState(state, root, kind); return handle; }
export function assertLiveProjectLock(handle, projectRoot) { return assertLive(handle, projectRoot, "project"); }
export function assertLiveWorkspaceOutputLock(handle, workspaceRoot) { return assertLive(handle, workspaceRoot, "workspace"); }
export async function acquireWorkspaceOutputLock(workspaceRoot, options = {}) { return acquireLockAt(workspaceRoot, "workspace", { ...options, heldMessage: "Workspace output lock is held by a live writer." }); }
function acquireImmediate(root, kind, ownerId, now) { const identity = pinPhysicalDirectory(root), path = kind === "workspace" ? workspaceOutputLockPath(identity.path) : projectLockPath(identity.path); return openHandle(path, ownerId, now, identity, kind); }
export function acquireWorkspaceOutputLockImmediate(workspaceRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return acquireImmediate(workspaceRoot, "workspace", ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Workspace output lock is held by a live writer."); throw error; } }
export function acquireProjectLockImmediate(projectRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return acquireImmediate(projectRoot, "project", ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Project writer lock is held by a live writer."); throw error; } }
