import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { acquireProjectLock, acquireWorkspaceOutputLock, assertLiveProjectLock, assertLiveWorkspaceOutputLock, projectLockPath } from "../scripts/state/project-lock.mjs";
import { cleanOutputs } from "../scripts/clean.mjs";

test("project lock authority rejects forged, wrong-root, and released handles", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-root-")), other = mkdtempSync(resolve(tmpdir(), "rtb-lock-other-"));
  try {
    const handle = await acquireProjectLock(root);
    assert.throws(() => assertLiveProjectLock({ path: handle.path, ownerId: handle.ownerId }, root), /unforgeable/);
    assert.throws(() => assertLiveProjectLock(handle, other), /exact root/);
    handle.path = projectLockPath(other);
    assert.throws(() => assertLiveProjectLock(handle, other), /exact root/, "mutating public handle fields cannot change private root authority");
    assert.equal(assertLiveProjectLock(handle, root), handle);
    handle.release();
    assert.throws(() => assertLiveProjectLock(handle, root), /unforgeable/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); }
});

test("double release cannot unlink a successor lock", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-successor-"));
  try {
    const first = await acquireProjectLock(root); first.release(); first.release();
    const successor = await acquireProjectLock(root); first.release();
    assert.equal(existsSync(projectLockPath(root)), true);
    assert.equal(assertLiveProjectLock(successor, root), successor);
    successor.release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("locks reject symbolic lock directories and physical root replacement", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-physical-")), moved = `${root}-moved`, external = mkdtempSync(resolve(tmpdir(), "rtb-lock-external-"));
  try {
    symlinkSync(external, resolve(root, ".rtb-state"));
    await assert.rejects(() => acquireWorkspaceOutputLock(root), /symbolic link/);
    rmSync(resolve(root, ".rtb-state"));
    const handle = await acquireWorkspaceOutputLock(root);
    renameSync(root, moved); mkdirSync(root);
    assert.throws(() => assertLiveWorkspaceOutputLock(handle, root), /physical identity/);
    handle.release();
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(moved, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});

test("lock authority pins its parent and release never unlinks a successor parent", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-parent-")), displaced = resolve(root, ".rtb-state-old");
  try {
    const first = await acquireProjectLock(root);
    renameSync(resolve(root, ".rtb-state"), displaced); mkdirSync(resolve(root, ".rtb-state"));
    const successor = await acquireProjectLock(root);
    assert.throws(() => assertLiveProjectLock(first, root), /parent|physical identity/);
    first.release();
    assert.equal(existsSync(projectLockPath(root)), true, "stale release must preserve the successor lock");
    assert.equal(assertLiveProjectLock(successor, root), successor); successor.release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("lock authority rejects file replacement, unlink, and extra hard links", async (context) => {
  await context.test("replacement with copied owner content", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-replace-"));
    try {
      const handle = await acquireProjectLock(root), lock = projectLockPath(root), moved = `${lock}.old`, content = readFileSync(lock, "utf8");
      renameSync(lock, moved); writeFileSync(lock, content, { mode: 0o600 });
      assert.throws(() => assertLiveProjectLock(handle, root), /file|physical identity/); handle.release();
      assert.equal(existsSync(lock), true, "stale release must not remove replacement lock");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  await context.test("unlink", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-unlink-"));
    try { const handle = await acquireProjectLock(root), lock = projectLockPath(root); unlinkSync(lock); assert.throws(() => assertLiveProjectLock(handle, root), /physical identity/); handle.release(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  await context.test("hard link", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-hardlink-"));
    try { const handle = await acquireProjectLock(root), lock = projectLockPath(root); linkSync(lock, `${lock}.alias`); assert.throws(() => assertLiveProjectLock(handle, root), /physical identity/); handle.release(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
});

test("stale lock reclamation never deletes a changed inode", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-stale-race-")), lock = projectLockPath(root); mkdirSync(resolve(lock, "..")); writeFileSync(lock, `${JSON.stringify({ pid: 2147483647, ownerId: "stale" })}\n`);
  try {
    await assert.rejects(() => acquireProjectLock(root, { timeoutMs: 0, beforeStaleReclaim: () => { renameSync(lock, `${lock}.stale`); writeFileSync(lock, `${JSON.stringify({ pid: process.pid, ownerId: "successor" })}\n`); } }), /held by a live writer/);
    assert.match(readFileSync(lock, "utf8"), /successor/); assert.equal(readdirSync(resolve(lock, "..")).some((name) => name.startsWith(".lock-reclaim-")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("two stale-lock waiters serialize without reclamation artifacts", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-stale-two-")), lock = projectLockPath(root); mkdirSync(resolve(lock, "..")); writeFileSync(lock, `${JSON.stringify({ pid: 2147483647, ownerId: "stale" })}\n`);
  try {
    const acquireAndRelease = async (ownerId) => { const handle = await acquireProjectLock(root, { ownerId, timeoutMs: 1000, pollMs: 5 }); assert.equal(assertLiveProjectLock(handle, root), handle); await new Promise((done) => setTimeout(done, 20)); handle.release(); return ownerId; };
    assert.deepEqual(new Set(await Promise.all([acquireAndRelease("waiter-a"), acquireAndRelease("waiter-b")])), new Set(["waiter-a", "waiter-b"]));
    assert.equal(existsSync(lock), false); assert.equal(readdirSync(resolve(lock, "..")).some((name) => name.startsWith(".lock-reclaim-")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("clean waits for a nested project's workspace output lock before removing outputs", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lock-clean-")), projectRoot = resolve(root, "books", "nested"), buildDirectory = resolve(root, "build"), distributionDirectory = resolve(root, "dist");
  try {
    mkdirSync(projectRoot, { recursive: true }); mkdirSync(buildDirectory); mkdirSync(distributionDirectory); writeFileSync(resolve(distributionDirectory, "release.pdf"), "published evidence");
    const workspace = await acquireWorkspaceOutputLock(root), publication = await acquireProjectLock(projectRoot);
    assert.equal(assertLiveWorkspaceOutputLock(workspace, root), workspace);
    const cleaning = cleanOutputs({ root, buildDirectory, distributionDirectory });
    await new Promise((done) => setTimeout(done, 50));
    assert.equal(existsSync(distributionDirectory), true, "clean must not mutate output while finalization owns the lock");
    publication.release(); workspace.release(); await cleaning;
    assert.equal(existsSync(buildDirectory), false); assert.equal(existsSync(distributionDirectory), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
