import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { acquireLease, durableCheckpoint, initializeLifecycle, lifecycle, openStateDatabase, releaseLease } from "./database.mjs";
import { acquireProjectLock } from "./project-lock.mjs";
import { assertSafeRelativePath, initializeSnapshots, materializeSnapshot, openSnapshotReader, preservePreimages, readPointer, readSnapshotFile, sha256, snapshotRoot, verifySnapshot, writePointer } from "./snapshots.mjs";
import { recoverProject } from "./recovery.mjs";

const commandSchema = JSON.parse(readFileSync(new URL("../../schemas/operations/mutation-command.schema.json", import.meta.url), "utf8"));
const resultSchema = JSON.parse(readFileSync(new URL("../../schemas/operations/mutation-result.schema.json", import.meta.url), "utf8"));
const validator = new Ajv2020({ allErrors: true, strict: false });
const validateCommandSchema = validator.compile(commandSchema);
const validateResultSchema = validator.compile(resultSchema);
const states = new Set(["queued", "running", "blocked", "conflict", "failed", "cancelled", "succeeded", "needs_review"]);
const jsonHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const time = (now) => new Date(now()).toISOString();

function pathPattern(pattern) {
  assertSafeRelativePath(pattern.replaceAll("*", "placeholder"));
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
}

export class InjectedMutationCrash extends Error { constructor(phase) { super(`Injected crash at ${phase}.`); this.name = "InjectedMutationCrash"; this.phase = phase; } }

function safeMessage(error) {
  if (error instanceof InjectedMutationCrash) return "Mutation was interrupted for deterministic recovery testing.";
  return /(?:conflict|stale|changed|lease|lock)/i.test(error.message) ? "The mutation conflicts with newer project state; both versions were preserved." : "The mutation could not be completed safely.";
}

function assertCommand(command) {
  if (!validateCommandSchema(command)) throw new Error(`Mutation command schema validation failed: ${validator.errorsText(validateCommandSchema.errors)}`);
  if (Buffer.byteLength(JSON.stringify(command)) > 256 * 1024) throw new Error("Mutation command exceeds the 256 KB limit.");
  const paths = new Set();
  for (const file of command.files) {
    assertSafeRelativePath(file.path);
    if (paths.has(file.path)) throw new Error("Mutation command cannot contain duplicate paths.");
    paths.add(file.path);
    if (Buffer.byteLength(file.content) > 64 * 1024) throw new Error("Mutation file content exceeds the 64 KB limit.");
  }
}

function stateResult(command, state, message, pointer, proposed = null) {
  if (!states.has(state)) throw new Error("Invalid visible operation state.");
  const value = { schemaVersion: 1, id: command.id, projectId: command.projectId, state, message, priorSnapshotHash: pointer?.snapshotHash ?? null, proposedSnapshotHash: proposed, pointerVersion: pointer?.version ?? null };
  if (!validateResultSchema(value)) throw new Error(`Mutation result schema validation failed: ${validator.errorsText(validateResultSchema.errors)}`);
  return value;
}

function insertJournal(database, command, pointer, ownerId, fencingToken, phase, operationState, effects, nextSnapshotHash, now) {
  database.prepare(`INSERT INTO mutation_journal
    (command_id, project_id, owner_id, fencing_token, command_hash, phase, operation_state, expected_snapshot_hash, expected_pointer_version, prior_snapshot_hash, next_snapshot_hash, expected_lifecycle_version, expected_lifecycle_guard, effects_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(command.id, command.projectId, ownerId, fencingToken, jsonHash(command), phase, operationState, command.expectedSnapshotHash, pointer.version, pointer.snapshotHash, nextSnapshotHash, command.expectedLifecycleVersion, command.expectedLifecycleGuard, JSON.stringify(effects), time(now), time(now));
  durableCheckpoint(database);
}

function finishJournal(database, command, state, result, now) {
  database.prepare("UPDATE mutation_journal SET phase = 'complete', operation_state = ?, result_json = ?, updated_at = ? WHERE command_id = ?")
    .run(state, JSON.stringify(result), time(now), command.id);
  durableCheckpoint(database);
}

function existingResult(database, command) {
  const row = database.prepare("SELECT command_hash, result_json, phase, operation_state FROM mutation_journal WHERE command_id = ?").get(command.id);
  if (!row) return null;
  if (row.command_hash !== jsonHash(command)) throw new Error("Command ID was replayed with different input.");
  if (!row.result_json) return stateResult(command, "running", "The original mutation is still being recovered.", null);
  return JSON.parse(row.result_json);
}

function proposedSnapshot(root, pointer, command, trace) {
  // A conflict never discards user-proposed bytes: the immutable snapshot is a review artifact.
  return materializeSnapshot(root, { sourceRoot: snapshotRoot(root, pointer.snapshotHash), changes: command.files, trace }).hash;
}

export class MutationService {
  constructor({ root, projectId, allowedPaths = [], databaseFile = resolve(root, ".rtb-state", "state.sqlite"), now = () => Date.now(), trace, crashAt, beforeStateCommit } = {}) {
    if (!root || !projectId) throw new Error("MutationService requires a project root and project ID.");
    this.root = resolve(root); this.projectId = projectId; this.allowedPaths = allowedPaths.map(pathPattern); this.databaseFile = databaseFile; this.now = now; this.trace = trace; this.crashAt = crashAt; this.beforeStateCommit = beforeStateCommit;
  }

  allowsPath(path) { return this.allowedPaths.some((pattern) => pattern.test(path)); }

  async recover() {
    initializeSnapshots(this.root, { trace: this.trace });
    const lock = await acquireProjectLock(this.root, { ownerId: `recovery-${randomUUID()}`, now: this.now });
    const database = openStateDatabase(this.databaseFile, { now: this.now });
    try { initializeLifecycle(database, this.projectId, { now: this.now }); return recoverProject({ root: this.root, projectId: this.projectId, database, now: this.now, trace: this.trace }); }
    finally { database.close(); lock.release(); }
  }

  current() { initializeSnapshots(this.root, { trace: this.trace }); return readPointer(this.root); }
  read(path) { return readSnapshotFile(this.root, path); }
  openReader() { initializeSnapshots(this.root, { trace: this.trace }); return openSnapshotReader(this.root); }
  readFiles(paths) { return this.openReader().readFiles(paths); }

  async execute(command) {
    assertCommand(command);
    if (command.projectId !== this.projectId) throw new Error("Mutation command project does not match this service.");
    if (command.files.some((file) => !this.allowsPath(file.path))) throw new Error("Mutation path is not approved for this action.");
    initializeSnapshots(this.root, { trace: this.trace });
    const lock = await acquireProjectLock(this.root, { ownerId: `mutation-${randomUUID()}`, now: this.now });
    const database = openStateDatabase(this.databaseFile, { now: this.now });
    let token;
    try {
      initializeLifecycle(database, this.projectId, { now: this.now });
      recoverProject({ root: this.root, projectId: this.projectId, database, now: this.now, trace: this.trace });
      const replay = existingResult(database, command); if (replay) return replay;
      token = acquireLease(database, { projectId: this.projectId, ownerId: lock.ownerId, operationId: command.id, now: this.now });
      let pointer = readPointer(this.root);
      const lifecycleRecord = lifecycle(database, this.projectId);
      const staleSnapshot = pointer.snapshotHash !== command.expectedSnapshotHash;
      const staleLifecycle = lifecycleRecord.version !== command.expectedLifecycleVersion || lifecycleRecord.guard !== command.expectedLifecycleGuard || lifecycleRecord.status === "blocked";
      let staleFile = false;
      for (const file of command.files) {
        const target = resolve(snapshotRoot(this.root, pointer.snapshotHash), file.path);
        const actual = (() => { try { return sha256(readFileSync(target)); } catch { return null; } })();
        if (actual !== file.expectedHash) staleFile = true;
      }
      if (staleSnapshot || staleLifecycle || staleFile) {
        const proposed = proposedSnapshot(this.root, pointer, command, this.trace);
        const result = stateResult(command, "conflict", "The project changed before this mutation; prior and proposed snapshots are preserved.", pointer, proposed);
        insertJournal(database, command, pointer, lock.ownerId, token, "complete", "conflict", { conflict: { staleSnapshot, staleLifecycle, staleFile } }, proposed, this.now);
        database.prepare("UPDATE mutation_journal SET result_json = ? WHERE command_id = ?").run(JSON.stringify(result), command.id); durableCheckpoint(database);
        return result;
      }
      if (this.crashAt === "before_intent") throw new InjectedMutationCrash("before_intent");
      const preimages = preservePreimages(this.root, pointer.snapshotHash, command.files.map((file) => file.path), { trace: this.trace });
      insertJournal(database, command, pointer, lock.ownerId, token, "intent_durable", "running", { preimages }, null, this.now);
      if (this.crashAt === "intent_durable") throw new InjectedMutationCrash("intent_durable");
      const next = materializeSnapshot(this.root, { sourceRoot: snapshotRoot(this.root, pointer.snapshotHash), changes: command.files, trace: this.trace });
      database.prepare("UPDATE mutation_journal SET next_snapshot_hash = ?, phase = 'snapshot_prepared', updated_at = ? WHERE command_id = ?").run(next.hash, time(this.now), command.id); durableCheckpoint(database);
      if (this.crashAt === "snapshot_prepared") throw new InjectedMutationCrash("snapshot_prepared");
      // This durable bridge represents every pointer-write instruction window.
      database.prepare("UPDATE mutation_journal SET phase = 'pointer_publish_pending', updated_at = ? WHERE command_id = ?").run(time(this.now), command.id); durableCheckpoint(database);
      if (this.crashAt === "pointer_publish_pending") throw new InjectedMutationCrash("pointer_publish_pending");
      // Check again directly before visibility; the shared lock serializes lifecycle transitions too.
      const latestLifecycle = lifecycle(database, this.projectId);
      if (latestLifecycle.version !== command.expectedLifecycleVersion || latestLifecycle.guard !== command.expectedLifecycleGuard) throw new Error("Lifecycle changed before pointer publication.");
      const priorPointer = pointer;
      pointer = writePointer(this.root, { expected: pointer, nextSnapshotHash: next.hash, nextVersion: pointer.version + 1, trace: this.trace });
      if (this.crashAt === "after_pointer_write") throw new InjectedMutationCrash("after_pointer_write");
      database.prepare("UPDATE mutation_journal SET phase = 'pointer_published', updated_at = ? WHERE command_id = ?").run(time(this.now), command.id); durableCheckpoint(database);
      if (this.crashAt === "pointer_published") throw new InjectedMutationCrash("pointer_published");
      this.beforeStateCommit?.(database, command);
      database.exec("BEGIN IMMEDIATE;");
      try {
        const lease = database.prepare("SELECT fencing_token FROM mutation_leases WHERE project_id = ? AND owner_id = ? AND operation_id = ?").get(this.projectId, lock.ownerId, command.id);
        const guarded = database.prepare("SELECT version, guard FROM lifecycle_state WHERE project_id = ?").get(this.projectId);
        if (!lease || lease.fencing_token !== token || !guarded || guarded.version !== command.expectedLifecycleVersion || guarded.guard !== command.expectedLifecycleGuard) throw new Error("Guarded state commit rejected a stale fence or lifecycle version.");
        const journalHash = jsonHash({ command, prior: readPointer(this.root), next: next.hash });
        database.prepare("INSERT INTO immutable_audit_references (project_id, command_id, snapshot_hash, journal_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(this.projectId, command.id, next.hash, journalHash, time(this.now));
        database.prepare("UPDATE mutation_journal SET phase = 'state_committed', operation_state = 'running', updated_at = ? WHERE command_id = ? AND fencing_token = ?").run(time(this.now), command.id, token);
        database.exec("COMMIT;"); durableCheckpoint(database);
      } catch (error) { database.exec("ROLLBACK;"); throw error; }
      if (this.crashAt === "state_committed") throw new InjectedMutationCrash("state_committed");
      verifySnapshot(this.root, next.hash);
      const complete = stateResult(command, "succeeded", "Canonical mutation completed.", priorPointer, next.hash);
      complete.pointerVersion = readPointer(this.root).version;
      finishJournal(database, command, "succeeded", complete, this.now);
      return complete;
    } catch (error) {
      if (error instanceof InjectedMutationCrash) throw error;
      // Pointer publication without a guarded database commit must be repaired before allowing more work.
      try { recoverProject({ root: this.root, projectId: this.projectId, database, now: this.now, trace: this.trace }); } catch { /* recovery records the blocked incident */ }
      const pointer = (() => { try { return readPointer(this.root); } catch { return null; } })();
      return stateResult(command, "failed", safeMessage(error), pointer);
    } finally {
      if (token) { try { releaseLease(database, { projectId: this.projectId, ownerId: lock.ownerId, fencingToken: token }); } catch { /* recovery fenced or retained the failed lease */ } }
      database.close(); lock.release();
    }
  }
}
