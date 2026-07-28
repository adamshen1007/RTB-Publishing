import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
