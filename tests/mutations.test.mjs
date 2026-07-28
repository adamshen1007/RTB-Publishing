import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { MutationService, InjectedMutationCrash } from "../scripts/state/mutation-journal.mjs";
import { sha256, snapshotRoot } from "../scripts/state/snapshots.mjs";
import { createPlatformServer } from "../scripts/platform/server.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-mutations-"));
  writeFileSync(resolve(root, "chapter.md"), "before\n");
  writeFileSync(resolve(root, "worksheet.md"), "before worksheet\n");
  const service = new MutationService({ root, projectId: "fixture-book" });
  return { root, service, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
function command(service, changes, id = "MUT-TEST-001") {
  const pointer = service.current();
  return {
    schemaVersion: 1, id, command: "replace_files", projectId: "fixture-book", actor: "human-editor",
    expectedSnapshotHash: pointer.snapshotHash, expectedLifecycleVersion: 0, expectedLifecycleGuard: "ready",
    files: changes.map(({ path, content }) => ({ path, content, expectedHash: sha256(readFileSync(resolve(snapshotRoot(service.root, pointer.snapshotHash), path))) }))
  };
}

test("MUT-001 applies a single-file mutation as one immutable snapshot", async () => {
  const item = fixture();
  try {
    const before = item.service.current();
    const result = await item.service.execute(command(item.service, [{ path: "chapter.md", content: "after\n" }]));
    assert.equal(result.state, "succeeded");
    assert.equal(result.priorSnapshotHash, before.snapshotHash);
    assert.notEqual(result.proposedSnapshotHash, before.snapshotHash);
    assert.equal(item.service.read("chapter.md").content, "after\n");
    assert.equal(readFileSync(resolve(snapshotRoot(item.root, before.snapshotHash), "chapter.md"), "utf8"), "before\n");
  } finally { item.dispose(); }
});

test("MUT-002 readers resolve a complete old or new snapshot, never a mixed tree", async () => {
  const item = fixture();
  try {
    const old = item.service.current();
    const operation = item.service.execute(command(item.service, [{ path: "chapter.md", content: "after\n" }, { path: "worksheet.md", content: "after worksheet\n" }]));
    const result = await operation;
    const oldRoot = snapshotRoot(item.root, old.snapshotHash);
    const oldRead = ["chapter.md", "worksheet.md"].map((path) => readFileSync(resolve(oldRoot, path), "utf8"));
    const newRead = [item.service.read("chapter.md").content, item.service.read("worksheet.md").content];
    assert.equal(result.state, "succeeded");
    assert.deepEqual(oldRead, ["before\n", "before worksheet\n"]);
    assert.deepEqual(newRead, ["after\n", "after worksheet\n"]);
  } finally { item.dispose(); }
});

test("MUT-003/MUT-004 preserve a proposed immutable snapshot for stale hashes and lifecycle", async () => {
  const item = fixture();
  try {
    const stale = command(item.service, [{ path: "chapter.md", content: "stale proposal\n" }]);
    await item.service.execute(command(item.service, [{ path: "chapter.md", content: "winner\n" }], "MUT-TEST-002"));
    const conflict = await item.service.execute(stale);
    assert.equal(conflict.state, "conflict");
    assert.equal(item.service.read("chapter.md").content, "winner\n");
    assert.equal(readFileSync(resolve(snapshotRoot(item.root, conflict.proposedSnapshotHash), "chapter.md"), "utf8"), "stale proposal\n");
    const lifecycle = command(item.service, [{ path: "worksheet.md", content: "blocked\n" }], "MUT-TEST-003");
    lifecycle.expectedLifecycleVersion = 3;
    const lifecycleConflict = await item.service.execute(lifecycle);
    assert.equal(lifecycleConflict.state, "conflict");
  } finally { item.dispose(); }
});

test("MUT-005/MUT-006 concurrent writers serialize and command replay has no duplicate effect", async () => {
  const item = fixture();
  try {
    const first = command(item.service, [{ path: "chapter.md", content: "first\n" }], "MUT-TEST-004");
    const second = { ...command(item.service, [{ path: "chapter.md", content: "second\n" }], "MUT-TEST-005") };
    const [one, two] = await Promise.all([item.service.execute(first), item.service.execute(second)]);
    assert.deepEqual(new Set([one.state, two.state]), new Set(["succeeded", "conflict"]));
    const replay = await item.service.execute(first);
    assert.deepEqual(replay, one);
  } finally { item.dispose(); }
});

for (const phase of ["before_intent", "intent_durable", "snapshot_prepared", "pointer_published", "state_committed"]) {
  test(`MUT crash recovery is deterministic after ${phase}`, async () => {
    const item = fixture();
    try {
      const crashing = new MutationService({ root: item.root, projectId: "fixture-book", crashAt: phase });
      const before = crashing.current();
      await assert.rejects(() => crashing.execute(command(crashing, [{ path: "chapter.md", content: `${phase}\n` }], `MUT-CRASH-${phase.replaceAll("_", "-").toUpperCase()}`)), InjectedMutationCrash);
      const recovered = new MutationService({ root: item.root, projectId: "fixture-book" });
      await recovered.recover();
      if (phase === "state_committed") assert.equal(recovered.read("chapter.md").content, `${phase}\n`);
      else assert.equal(recovered.current().snapshotHash, before.snapshotHash);
    } finally { item.dispose(); }
  });
}

test("MUT-012 blocks unsafe links and stale guarded commits without publishing a new root", async () => {
  const item = fixture();
  try {
    const pointer = item.service.current();
    const unsafe = command(item.service, [{ path: "chapter.md", content: "x\n" }], "MUT-TEST-006");
    unsafe.files[0].path = "../secret";
    await assert.rejects(() => item.service.execute(unsafe), /schema validation|path/i);
    const link = resolve(item.root, "link.md"); symlinkSync(resolve(item.root, "chapter.md"), link);
    const linked = { ...unsafe, id: "MUT-TEST-007", files: [{ path: "link.md", content: "x\n", expectedHash: sha256("before\n") }] };
    await assert.rejects(() => item.service.execute(linked), /symbolic link|schema/i);
    rmSync(link, { force: true });
    const fenced = new MutationService({ root: item.root, projectId: "fixture-book", beforeStateCommit: (database) => database.prepare("UPDATE lifecycle_state SET version = 1 WHERE project_id = ?").run("fixture-book") });
    const failed = await fenced.execute(command(fenced, [{ path: "chapter.md", content: "fenced\n" }], "MUT-TEST-008"));
    assert.equal(failed.state, "failed");
    assert.equal(fenced.current().snapshotHash, pointer.snapshotHash);
  } finally { item.dispose(); }
});

test("MUT-013 rebuilds derived SQLite state without changing canonical snapshots", async () => {
  const item = fixture();
  try {
    await item.service.execute(command(item.service, [{ path: "chapter.md", content: "durable\n" }]));
    const pointer = item.service.current();
    rmSync(resolve(item.root, ".rtb-state", "state.sqlite"), { force: true });
    rmSync(resolve(item.root, ".rtb-state", "state.sqlite-wal"), { force: true });
    rmSync(resolve(item.root, ".rtb-state", "state.sqlite-shm"), { force: true });
    const rebuilt = new MutationService({ root: item.root, projectId: "fixture-book" });
    assert.equal(rebuilt.current().snapshotHash, pointer.snapshotHash);
    assert.equal(rebuilt.read("chapter.md").content, "durable\n");
    await rebuilt.recover();
    assert.equal(existsSync(resolve(item.root, ".rtb-state", "state.sqlite")), true);
  } finally { item.dispose(); }
});

test("SEC-001/002/003/006 mutation HTTP boundary has one fixed command and rejects hostile input", async () => {
  const item = fixture();
  const platform = createPlatformServer({ mutationService: item.service, csrfToken: "csrf-test", mutationCapability: "capability-test" });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const { port } = platform.server.address(); const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", "x-rtb-publishing-csrf": "csrf-test", "x-rtb-publishing-capability": "capability-test" };
  try {
    const valid = command(item.service, [{ path: "chapter.md", content: "via service\n" }], "MUT-HTTP-001");
    const accepted = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(valid) });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).state, "succeeded");
    const traversal = { ...valid, id: "MUT-HTTP-002", files: [{ ...valid.files[0], path: "../secret" }] };
    const rejected = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(traversal) });
    assert.equal(rejected.status, 400);
    const wrongOrigin = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: { ...headers, origin: "http://evil.test" }, body: JSON.stringify(valid) });
    assert.equal(wrongOrigin.status, 403);
    const missingCapability = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: { ...headers, "x-rtb-publishing-capability": "wrong" }, body: JSON.stringify(valid) });
    assert.equal(missingCapability.status, 403);
    const arbitrary = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files?token=no`, { method: "POST", headers, body: JSON.stringify(valid) });
    assert.equal(arbitrary.status, 400);
    const unsupported = await fetch(`${base}/api/projects/fixture-book/mutations/other`, { method: "POST", headers, body: JSON.stringify(valid) });
    assert.equal(unsupported.status, 404);
    const oversized = { ...valid, id: "MUT-HTTP-003", files: [{ ...valid.files[0], content: "x".repeat(300 * 1024) }] };
    const tooLarge = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(oversized) });
    assert.equal(tooLarge.status, 400);
  } finally { await new Promise((done) => platform.server.close(done)); item.dispose(); }
});
