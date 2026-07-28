import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const liveHandles = new WeakMap();
export function pinPhysicalDirectory(path) { const requested = resolve(path), entry = lstatSync(requested); if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Trusted root must be a real directory, not a symbolic link."); const physicalPath = realpathSync(requested), status = statSync(physicalPath); return Object.freeze({ path: physicalPath, dev: status.dev, ino: status.ino }); }
function sameIdentity(left, right) { return left?.path === right.path && left?.dev === right.dev && left?.ino === right.ino; }
export function assertPinnedDirectory(identity) { const current = pinPhysicalDirectory(identity.path); if (!sameIdentity(identity, current)) throw new Error("Trusted directory identity changed after it was pinned."); return current; }
export function assertNoSymlinkPath(root, target, { allowMissing = true } = {}) { const base = pinPhysicalDirectory(root), destination = resolve(target), rel = relative(base.path, destination); if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Trusted path escapes its physical root."); let cursor = base.path; for (const part of rel.split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if (!existsSync(cursor)) { if (!allowMissing) throw new Error(`Trusted path does not exist: ${cursor}`); continue; } const entry = lstatSync(cursor); if (entry.isSymbolicLink()) throw new Error(`Trusted path contains a symbolic link: ${cursor}`); } return { root: base, path: destination }; }
export function ensurePhysicalDirectory(root, target) { const checked = assertNoSymlinkPath(root, target); let cursor = checked.root.path; for (const part of relative(checked.root.path, checked.path).split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 }); const entry = lstatSync(cursor); if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Trusted directory path is not a physical directory: ${cursor}`); assertPinnedDirectory(checked.root); } return pinPhysicalDirectory(checked.path); }
function ensureSecureParent(identity, lockPath) { assertPinnedDirectory(identity); const parent = dirname(lockPath); assertNoSymlinkPath(identity.path, parent); if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 }); assertNoSymlinkPath(identity.path, parent, { allowMissing: false }); }
function openHandle(lockPath, ownerId, now, rootIdentity, kind) { ensureSecureParent(rootIdentity, lockPath); const fd = openSync(lockPath, "wx", 0o600); writeFileSync(fd, `${JSON.stringify({ pid: process.pid, ownerId, acquiredAt: new Date(now()).toISOString() })}\n`); const inode = fstatSync(fd).ino; let released = false; const handle = { ownerId, path: lockPath, release() { if (released) return; released = true; liveHandles.delete(handle); try { closeSync(fd); } finally { try { const current = lstatSync(lockPath), owner = JSON.parse(readFileSync(lockPath, "utf8")); if (current.ino === inode && owner.ownerId === ownerId && owner.pid === process.pid) rmSync(lockPath); } catch (error) { if (error.code !== "ENOENT") throw error; } } } }; liveHandles.set(handle, { lockPath, rootIdentity, kind }); return handle; }

function ownerIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

/**
 * An O_EXCL lock is deliberately non-expiring. A stale file can be removed only
 * after its recorded process is proven dead; a lease expiry never authorizes it.
 */
async function acquireLockAt(root, kind, { timeoutMs = 5000, pollMs = 20, ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now(), heldMessage = "Project writer lock is held by a live writer." } = {}) {
  const rootIdentity = pinPhysicalDirectory(root), lockPath = kind === "workspace" ? workspaceOutputLockPath(rootIdentity.path) : projectLockPath(rootIdentity.path);
  const started = now();
  while (true) {
    try {
      return openHandle(lockPath, ownerId, now, rootIdentity, kind);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(lockPath, "utf8")); } catch { owner = undefined; }
      if (owner && !ownerIsAlive(owner.pid)) { rmSync(lockPath, { force: true }); continue; }
      if (now() - started >= timeoutMs) throw new Error(heldMessage);
      await pause(pollMs);
    }
  }
}

export async function acquireProjectLock(projectRoot, options = {}) { return acquireLockAt(projectRoot, "project", options); }

export function projectLockPath(projectRoot) { return resolve(projectRoot, ".rtb-state", "writer.lock"); }
export function workspaceOutputLockPath(workspaceRoot) { return resolve(workspaceRoot, ".rtb-state", "workspace-output.lock"); }
export function hasProjectLock(projectRoot) { return existsSync(projectLockPath(projectRoot)); }
function assertLive(handle, root, kind) { const state = handle && liveHandles.get(handle), current = pinPhysicalDirectory(root), lockPath = kind === "workspace" ? workspaceOutputLockPath(current.path) : projectLockPath(current.path); if (!state || state.kind !== kind || state.lockPath !== lockPath || !sameIdentity(state.rootIdentity, current)) throw new Error(`A live unforgeable ${kind === "workspace" ? "workspace output" : "project"} lock handle for this exact root and physical identity is required.`); assertNoSymlinkPath(current.path, dirname(lockPath), { allowMissing: false }); return handle; }
export function assertLiveProjectLock(handle, projectRoot) { return assertLive(handle, projectRoot, "project"); }
export function assertLiveWorkspaceOutputLock(handle, workspaceRoot) { return assertLive(handle, workspaceRoot, "workspace"); }
export async function acquireWorkspaceOutputLock(workspaceRoot, options = {}) { return acquireLockAt(workspaceRoot, "workspace", { ...options, heldMessage: "Workspace output lock is held by a live writer." }); }
function acquireImmediate(root, kind, ownerId, now) { const identity = pinPhysicalDirectory(root), path = kind === "workspace" ? workspaceOutputLockPath(identity.path) : projectLockPath(identity.path); return openHandle(path, ownerId, now, identity, kind); }
export function acquireWorkspaceOutputLockImmediate(workspaceRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return acquireImmediate(workspaceRoot, "workspace", ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Workspace output lock is held by a live writer."); throw error; } }
export function acquireProjectLockImmediate(projectRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return acquireImmediate(projectRoot, "project", ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Project writer lock is held by a live writer."); throw error; } }
