import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { MutationService, InjectedMutationCrash } from "../scripts/state/mutation-journal.mjs";
import { sha256, snapshotRoot, writePointer } from "../scripts/state/snapshots.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";
import { LocalSessionManager, createPlatformServer, startPlatform } from "../scripts/platform/server.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-mutations-"));
  writeFileSync(resolve(root, "chapter.md"), "before\n");
  writeFileSync(resolve(root, "worksheet.md"), "before worksheet\n");
  const service = new MutationService({ root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"], sourcePaths: ["chapter.md", "worksheet.md", "README.md"] });
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

test("material canonical mutations atomically invalidate lifecycle approvals", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-mutation-lifecycle-"));
  writeFileSync(resolve(root, "chapter.md"), "before\n");
  const service = new MutationService({
    root,
    projectId: "fixture-book",
    allowedPaths: ["chapter.md"],
    sourcePaths: ["chapter.md"],
    requireCurrentBlueprint: true,
    materialBlueprintFieldsForCommand: () => ["chapter_contracts"],
  });
  try {
    await service.recover();
    const database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    database.prepare("UPDATE lifecycle_state SET version = 1, status = 'evidence', guard = 'blueprint_approved' WHERE project_id = ?").run("fixture-book");
    database.prepare("INSERT INTO lifecycle_approvals VALUES (?, ?, 'blueprint', 'approved', 'human', 'operator', 1, 1, '{}', NULL, ?)")
      .run("APR-MUTATION", "fixture-book", "2026-07-28T00:00:00.000Z");
    database.close();
    const mutation = command(service, [{ path: "chapter.md", content: "after\n" }], "MUT-MATERIAL-001");
    mutation.expectedLifecycleVersion = 1;
    mutation.expectedLifecycleGuard = "blueprint_approved";
    assert.equal((await service.execute(mutation)).state, "succeeded");
    const verified = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    const lifecycle = verified.prepare("SELECT version, status, guard FROM lifecycle_state WHERE project_id = ?").get("fixture-book");
    const invalidation = verified.prepare("SELECT reason FROM lifecycle_approval_invalidations WHERE approval_id = ?").get("APR-MUTATION");
    const transition = verified.prepare("SELECT actor_id, resulting_version FROM lifecycle_transitions WHERE project_id = ? ORDER BY resulting_version DESC LIMIT 1").get("fixture-book");
    verified.close();
    assert.equal(lifecycle.version, 2);
    assert.equal(lifecycle.status, "blueprint_review");
    assert.equal(lifecycle.guard, "blueprint_required");
    assert.match(invalidation.reason, /Material Blueprint change/);
    assert.equal(transition.resulting_version, 2);
    assert.match(transition.actor_id, /MUT-MATERIAL-001/);
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test("a pinned multi-file reader keeps one root across a concurrent publication", async () => {
  const item = fixture();
  try {
    const reader = item.service.openReader();
    const writer = item.service.execute(command(item.service, [{ path: "chapter.md", content: "after\n" }, { path: "worksheet.md", content: "after worksheet\n" }], "MUT-READER-001"));
    await writer;
    const pinned = reader.readFiles(["chapter.md", "worksheet.md"]);
    assert.equal(pinned[0].snapshotHash, pinned[1].snapshotHash);
    assert.deepEqual(pinned.map((entry) => entry.content), ["before\n", "before worksheet\n"]);
    assert.deepEqual(item.service.readFiles(["chapter.md", "worksheet.md"]).map((entry) => entry.content), ["after\n", "after worksheet\n"]);
  } finally { item.dispose(); }
});

test("canonical snapshots exclude Git, state, generated, and secret material", () => {
  const item = fixture();
  try {
    writeFileSync(resolve(item.root, ".git"), "gitdir: ignored\n");
    writeFileSync(resolve(item.root, ".env"), "TOKEN=secret\n");
    writeFileSync(resolve(item.root, "private.pem"), "secret-key\n");
    mkdirSync(resolve(item.root, "dist")); writeFileSync(resolve(item.root, "dist", "output.html"), "generated\n");
    mkdirSync(resolve(item.root, "output")); writeFileSync(resolve(item.root, "output", "artifact.txt"), "generated\n");
    mkdirSync(resolve(item.root, ".tmp")); writeFileSync(resolve(item.root, ".tmp", "scratch.txt"), "local\n");
    mkdirSync(resolve(item.root, ".vale")); writeFileSync(resolve(item.root, ".vale", "cache.txt"), "local\n");
    writeFileSync(resolve(item.root, ".DS_Store"), "local\n"); writeFileSync(resolve(item.root, "Thumbs.db"), "local\n");
    writeFileSync(resolve(item.root, "README.md"), "canonical markdown\n");
    const pointer = item.service.current();
    const snapshot = snapshotRoot(item.root, pointer.snapshotHash);
    assert.equal(existsSync(resolve(snapshot, ".git")), false);
    assert.equal(existsSync(resolve(snapshot, ".env")), false);
    assert.equal(existsSync(resolve(snapshot, "private.pem")), false);
    assert.equal(existsSync(resolve(snapshot, "dist")), false);
    assert.equal(existsSync(resolve(snapshot, "output")), false);
    assert.equal(existsSync(resolve(snapshot, ".tmp")), false);
    assert.equal(existsSync(resolve(snapshot, ".vale")), false);
    assert.equal(existsSync(resolve(snapshot, ".DS_Store")), false);
    assert.equal(existsSync(resolve(snapshot, "Thumbs.db")), false);
    assert.equal(readFileSync(resolve(snapshot, "README.md"), "utf8"), "canonical markdown\n");
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

for (const phase of ["before_intent", "intent_durable", "snapshot_prepared", "pointer_publish_pending", "after_pointer_write", "pointer_published", "state_committed"]) {
  test(`MUT crash recovery is deterministic after ${phase}`, async () => {
    const item = fixture();
    try {
      const crashing = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"], crashAt: phase });
      const before = crashing.current();
      await assert.rejects(() => crashing.execute(command(crashing, [{ path: "chapter.md", content: `${phase}\n` }], `MUT-CRASH-${phase.replaceAll("_", "-").toUpperCase()}`)), InjectedMutationCrash);
      const recovered = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"] });
      await recovered.recover();
      if (phase === "state_committed") assert.equal(recovered.read("chapter.md").content, `${phase}\n`);
      else assert.equal(recovered.current().snapshotHash, before.snapshotHash);
    } finally { item.dispose(); }
  });
}

test("P0 recovery restores a next pointer left beside a snapshot_prepared journal", async () => {
  const item = fixture();
  try {
    const crashing = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"], crashAt: "snapshot_prepared" });
    const prior = crashing.current();
    await assert.rejects(() => crashing.execute(command(crashing, [{ path: "chapter.md", content: "prepared\n" }], "MUT-CRASH-PREPARED-POINTER")), InjectedMutationCrash);
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    const row = database.prepare("SELECT next_snapshot_hash FROM mutation_journal WHERE command_id = ?").get("MUT-CRASH-PREPARED-POINTER");
    writePointer(item.root, { expected: prior, nextSnapshotHash: row.next_snapshot_hash, nextVersion: prior.version + 1 });
    database.close();
    const recovered = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"] });
    await recovered.recover();
    assert.equal(recovered.current().snapshotHash, prior.snapshotHash);
    assert.equal(recovered.read("chapter.md").content, "before\n");
  } finally { item.dispose(); }
});

test("MUT-012 blocks unsafe links and stale guarded commits without publishing a new root", async () => {
  const item = fixture();
  try {
    const pointer = item.service.current();
    const unsafe = command(item.service, [{ path: "chapter.md", content: "x\n" }], "MUT-TEST-006");
    unsafe.files[0].path = "../secret";
    await assert.rejects(() => item.service.execute(unsafe), /schema validation|path/i);
    const link = resolve(item.root, "link.md"); symlinkSync(resolve(item.root, "chapter.md"), link);
    const linked = { ...unsafe, id: "MUT-TEST-007", files: [{ path: "link.md", content: "x\n", expectedHash: sha256("before\n") }] };
    const linkService = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md", "link.md"] });
    await assert.rejects(() => linkService.execute(linked), /symbolic link|schema/i);
    rmSync(link, { force: true });
    const fenced = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"], beforeStateCommit: (database) => database.prepare("UPDATE lifecycle_state SET version = 1 WHERE project_id = ?").run("fixture-book") });
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
    rmSync(resolve(item.root, ".rtb-state"), { recursive: true, force: true });
    const rebuilt = new MutationService({ root: item.root, projectId: "fixture-book", allowedPaths: ["chapter.md", "worksheet.md"] });
    assert.equal(rebuilt.current().snapshotHash, pointer.snapshotHash);
    assert.equal(rebuilt.read("chapter.md").content, "durable\n");
    await rebuilt.recover();
    assert.equal(existsSync(resolve(item.root, ".rtb-state", "state.sqlite")), true);
    assert.equal(existsSync(resolve(item.root, ".rtb-content", "current.json")), true);
  } finally { item.dispose(); }
});

test("successful mutation writes a Git-visible canonical snapshot and pointer", async () => {
  const item = fixture();
  try {
    writeFileSync(resolve(item.root, ".gitignore"), ".rtb-state/\n");
    execFileSync("git", ["init"], { cwd: item.root });
    execFileSync("git", ["add", "chapter.md", "worksheet.md", ".gitignore"], { cwd: item.root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"], { cwd: item.root });
    await item.service.execute(command(item.service, [{ path: "chapter.md", content: "git-visible\n" }], "MUT-GIT-001"));
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: item.root, encoding: "utf8" });
    assert.match(status, /\?\? \.rtb-content\//);
    assert.doesNotMatch(status, /\.rtb-state/);
    assert.equal(item.service.read("chapter.md").content, "git-visible\n");
  } finally { item.dispose(); }
});

test("SEC-001/002/003/006 mutation HTTP boundary has one fixed command and rejects hostile input", async () => {
  const item = fixture();
  let clock = Date.parse("2026-07-28T00:00:00Z");
  const platform = createPlatformServer({ mutationService: item.service, sessions: new LocalSessionManager({ now: () => clock, ttlMs: 1000 }) });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const { port } = platform.server.address(); const base = `http://127.0.0.1:${port}`;
  const issueSession = async () => { const response = await fetch(`${base}/api/session`); return { body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] }; };
  const authHeaders = (session) => ({ "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie: session.cookie, "x-rtb-publishing-csrf": session.body.csrfToken, "x-rtb-publishing-capability": session.body.mutationCapability });
  try {
    const wrongListener = await new Promise((done, fail) => { const request = httpRequest(`${base}/api/session`, { headers: { host: "127.0.0.1:1" } }, (response) => { response.resume(); response.on("end", () => done(response.statusCode)); }); request.on("error", fail); request.end(); });
    assert.equal(wrongListener, 400);
    let session = await issueSession();
    const valid = command(item.service, [{ path: "chapter.md", content: "via service\n" }], "MUT-HTTP-001");
    const accepted = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: authHeaders(session), body: JSON.stringify(valid) });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).state, "succeeded");
    const oldHeaders = authHeaders(session);
    session.body.csrfToken = accepted.headers.get("x-rtb-publishing-next-csrf");
    session.body.mutationCapability = accepted.headers.get("x-rtb-publishing-next-capability");
    const replay = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: oldHeaders, body: JSON.stringify(valid) });
    assert.equal(replay.status, 403);
    const traversal = { ...valid, id: "MUT-HTTP-002", files: [{ ...valid.files[0], path: "../secret" }] };
    const rejected = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: authHeaders(session), body: JSON.stringify(traversal) });
    assert.equal(rejected.status, 403);
    const arbitraryFile = { ...valid, id: "MUT-HTTP-ARBITRARY", files: [{ ...valid.files[0], path: "README.md" }] };
    const unauthorized = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: authHeaders(session), body: JSON.stringify(arbitraryFile) });
    assert.equal(unauthorized.status, 403);
    const wrongOrigin = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: { ...authHeaders(session), origin: "http://evil.test" }, body: JSON.stringify(valid) });
    assert.equal(wrongOrigin.status, 403);
    const second = await issueSession();
    const crossSession = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: { ...authHeaders(second), "x-rtb-publishing-capability": session.body.mutationCapability }, body: JSON.stringify(valid) });
    assert.equal(crossSession.status, 403);
    const missingCapability = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: { ...authHeaders(session), "x-rtb-publishing-capability": "wrong" }, body: JSON.stringify(valid) });
    assert.equal(missingCapability.status, 403);
    const querySession = await issueSession();
    const arbitrary = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files?token=no`, { method: "POST", headers: authHeaders(querySession), body: JSON.stringify(valid) });
    assert.equal(arbitrary.status, 400);
    const unsupported = await fetch(`${base}/api/projects/fixture-book/mutations/other`, { method: "POST", headers: authHeaders(session), body: JSON.stringify(valid) });
    assert.equal(unsupported.status, 404);
    const oversized = { ...valid, id: "MUT-HTTP-003", files: [{ ...valid.files[0], content: "x".repeat(300 * 1024) }] };
    const sizeSession = await issueSession();
    const tooLarge = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: authHeaders(sizeSession), body: JSON.stringify(oversized) });
    assert.equal(tooLarge.status, 400);
    session = await issueSession();
    clock += 1001;
    const expired = await fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers: authHeaders(session), body: JSON.stringify(valid) });
    assert.equal(expired.status, 403);
  } finally { await new Promise((done) => platform.server.close(done)); item.dispose(); }
});

test("a session capability is consumed synchronously and execution failures return a safe re-bootstrap pair", async () => {
  const item = fixture();
  const platform = createPlatformServer({ mutationService: item.service });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const { port } = platform.server.address(); const base = `http://127.0.0.1:${port}`;
  const issue = async () => { const response = await fetch(`${base}/api/session`); return { body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] }; };
  const input = command(item.service, [{ path: "chapter.md", content: "concurrent\n" }], "MUT-SESSION-RACE");
  try {
    const session = await issue();
    const headers = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie: session.cookie, "x-rtb-publishing-csrf": session.body.csrfToken, "x-rtb-publishing-capability": session.body.mutationCapability };
    const [first, second] = await Promise.all([fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(input) }), fetch(`${base}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(input) })]);
    assert.deepEqual(new Set([first.status, second.status]), new Set([200, 403]));
  } finally { await new Promise((done) => platform.server.close(done)); }
  const failingService = { projectId: "fixture-book", allowsPath: () => true, execute: async () => { throw new Error("token=private-value"); } };
  const failingPlatform = createPlatformServer({ mutationService: failingService });
  await new Promise((done) => failingPlatform.server.listen(0, "127.0.0.1", done));
  const failingPort = failingPlatform.server.address().port; const failingBase = `http://127.0.0.1:${failingPort}`;
  try {
    const sessionResponse = await fetch(`${failingBase}/api/session`); const session = { body: await sessionResponse.json(), cookie: sessionResponse.headers.get("set-cookie")?.split(";")[0] };
    const headers = { "content-type": "application/json", origin: failingBase, "sec-fetch-site": "same-origin", cookie: session.cookie, "x-rtb-publishing-csrf": session.body.csrfToken, "x-rtb-publishing-capability": session.body.mutationCapability };
    const failed = await fetch(`${failingBase}/api/projects/fixture-book/mutations/replace-files`, { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(failed.status, 400);
    assert.ok(failed.headers.get("x-rtb-publishing-next-csrf"));
    assert.ok(failed.headers.get("x-rtb-publishing-next-capability"));
    assert.doesNotMatch(JSON.stringify(await failed.json()), /private-value|token=/);
  } finally { await new Promise((done) => failingPlatform.server.close(done)); item.dispose(); }
});

test("normal platform startup wires only registered reviewed mutation services", async () => {
  const platform = await startPlatform({ host: "127.0.0.1", port: 0 });
  try { assert.equal(platform.mutationServices.has("rtb-publishing-core"), true); assert.equal(platform.mutationServices.has("ai-launch-copilot"), false); }
  finally { await new Promise((done) => platform.server.close(done)); }
});

test("SQLite migrations apply in numeric order and never reapply", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "rtb-migrations-"));
  try {
    writeFileSync(resolve(directory, "010-later.sql"), "CREATE TABLE later_marker (value TEXT);\n");
    writeFileSync(resolve(directory, "002-earlier.sql"), "CREATE TABLE earlier_marker (value TEXT);\n");
    const databaseFile = resolve(directory, "state.sqlite");
    let database = openStateDatabase(databaseFile, { migrationsDirectory: directory, now: () => 0 });
    assert.deepEqual(database.prepare("SELECT version FROM schema_migrations ORDER BY applied_at, version").all().map((row) => row.version), [2, 10]);
    database.close();
    database = openStateDatabase(databaseFile, { migrationsDirectory: directory, now: () => 1 });
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM schema_migrations").get().total, 2);
    database.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
