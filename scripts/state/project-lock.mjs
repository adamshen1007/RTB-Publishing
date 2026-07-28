import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function ownerIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

/**
 * An O_EXCL lock is deliberately non-expiring. A stale file can be removed only
 * after its recorded process is proven dead; a lease expiry never authorizes it.
 */
export async function acquireProjectLock(projectRoot, { timeoutMs = 5000, pollMs = 20, ownerId = `${process.pid}-${Date.now()}`, now = () => Date.now() } = {}) {
  const lockPath = resolve(projectRoot, ".rtb-state", "writer.lock");
  const started = now();
  while (true) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid, ownerId, acquiredAt: new Date(now()).toISOString() })}\n`);
      return {
        ownerId,
        path: lockPath,
        release() {
          try { closeSync(fd); } finally { rmSync(lockPath, { force: true }); }
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(lockPath, "utf8")); } catch { owner = undefined; }
      if (owner && !ownerIsAlive(owner.pid)) { rmSync(lockPath, { force: true }); continue; }
      if (now() - started >= timeoutMs) throw new Error("Project writer lock is held by a live writer.");
      await pause(pollMs);
    }
  }
}

export function projectLockPath(projectRoot) { return resolve(projectRoot, ".rtb-state", "writer.lock"); }
export function hasProjectLock(projectRoot) { return existsSync(projectLockPath(projectRoot)); }
