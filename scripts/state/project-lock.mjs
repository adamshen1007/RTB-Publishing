import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const liveHandles = new WeakMap();
function openHandle(lockPath, ownerId, now) { mkdirSync(dirname(lockPath), { recursive: true }); const fd = openSync(lockPath, "wx", 0o600); writeFileSync(fd, `${JSON.stringify({ pid: process.pid, ownerId, acquiredAt: new Date(now()).toISOString() })}\n`); const inode = fstatSync(fd).ino; let released = false; const handle = { ownerId, path: lockPath, release() { if (released) return; released = true; liveHandles.delete(handle); try { closeSync(fd); } finally { try { const current = lstatSync(lockPath), owner = JSON.parse(readFileSync(lockPath, "utf8")); if (current.ino === inode && owner.ownerId === ownerId && owner.pid === process.pid) rmSync(lockPath); } catch (error) { if (error.code !== "ENOENT") throw error; } } } }; liveHandles.set(handle, { lockPath }); return handle; }

function ownerIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

/**
 * An O_EXCL lock is deliberately non-expiring. A stale file can be removed only
 * after its recorded process is proven dead; a lease expiry never authorizes it.
 */
async function acquireLockAt(lockPath, { timeoutMs = 5000, pollMs = 20, ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now(), heldMessage = "Project writer lock is held by a live writer." } = {}) {
  const started = now();
  while (true) {
    try {
      return openHandle(lockPath, ownerId, now);
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

export async function acquireProjectLock(projectRoot, options = {}) { return acquireLockAt(projectLockPath(projectRoot), options); }

export function projectLockPath(projectRoot) { return resolve(projectRoot, ".rtb-state", "writer.lock"); }
export function workspaceOutputLockPath(workspaceRoot) { return resolve(workspaceRoot, ".rtb-state", "workspace-output.lock"); }
export function hasProjectLock(projectRoot) { return existsSync(projectLockPath(projectRoot)); }
export function assertLiveProjectLock(handle, projectRoot) { if (!handle || liveHandles.get(handle)?.lockPath !== projectLockPath(projectRoot)) throw new Error("A live unforgeable project lock handle for this exact root is required."); return handle; }
export function assertLiveWorkspaceOutputLock(handle, workspaceRoot) { if (!handle || liveHandles.get(handle)?.lockPath !== workspaceOutputLockPath(workspaceRoot)) throw new Error("A live unforgeable workspace output lock handle for this exact root is required."); return handle; }
export async function acquireWorkspaceOutputLock(workspaceRoot, options = {}) { return acquireLockAt(workspaceOutputLockPath(workspaceRoot), { ...options, heldMessage: "Workspace output lock is held by a live writer." }); }
export function acquireWorkspaceOutputLockImmediate(workspaceRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return openHandle(workspaceOutputLockPath(workspaceRoot), ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Workspace output lock is held by a live writer."); throw error; } }
export function acquireProjectLockImmediate(projectRoot, { ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) { try { return openHandle(projectLockPath(projectRoot), ownerId, now); } catch (error) { if (error.code === "EEXIST") throw new Error("Project writer lock is held by a live writer."); throw error; } }
