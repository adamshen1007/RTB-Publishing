import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { durableCheckpoint, fenceAbandonedLease } from "./database.mjs";
import { readPointer, sha256, verifySnapshot, writePointer } from "./snapshots.mjs";

function nowIso(now) { return new Date(now()).toISOString(); }
function effects(row) { try { return JSON.parse(row.effects_json); } catch { throw new Error("Mutation journal effects are corrupt."); } }
function update(database, row, phase, operationState, result, incident, now) {
  database.prepare("UPDATE mutation_journal SET phase = ?, operation_state = ?, result_json = ?, incident = ?, updated_at = ? WHERE command_id = ?")
    .run(phase, operationState, result ? JSON.stringify(result) : null, incident ?? null, nowIso(now), row.command_id);
  durableCheckpoint(database);
}
function resultFor(row, state, message, pointer) {
  return { schemaVersion: 1, id: row.command_id, projectId: row.project_id, state, message, priorSnapshotHash: row.prior_snapshot_hash ?? null, proposedSnapshotHash: row.next_snapshot_hash ?? null, pointerVersion: pointer?.version ?? null };
}

function verifyPreimages(root, entries) {
  for (const entry of entries) {
    if (entry.hash === null && entry.storage === null) continue;
    const file = resolve(root, entry.storage);
    if (!existsSync(file) || sha256(readFileSync(file)) !== entry.hash) throw new Error(`Preimage verification failed for ${entry.path}.`);
  }
}

/** Recover incomplete journals while the caller owns the project writer lock. */
export function recoverProject({ root, projectId, database, now = () => Date.now(), trace } = {}) {
  fenceAbandonedLease(database, projectId);
  const completed = database.prepare("SELECT * FROM mutation_journal WHERE project_id = ? AND phase = 'complete' AND operation_state = 'succeeded' ORDER BY created_at, command_id").all(projectId);
  for (const row of completed) {
    try {
      verifySnapshot(root, row.next_snapshot_hash);
      const audit = database.prepare("SELECT 1 FROM immutable_audit_references WHERE project_id = ? AND command_id = ? AND snapshot_hash = ?").get(projectId, row.command_id, row.next_snapshot_hash);
      if (!audit) throw new Error("Completed journal has no immutable audit reference.");
    } catch (error) {
      const pointer = readPointer(root);
      const blocked = resultFor(row, "blocked", "Completed mutation invariants are corrupt; incident recovery is required.", pointer);
      update(database, row, "blocked", "blocked", blocked, error.message.slice(0, 500), now);
      database.prepare("UPDATE lifecycle_state SET status = ?, updated_at = ? WHERE project_id = ?").run("blocked", nowIso(now), projectId);
      throw new Error("Completed mutation invariant failed; project is blocked.");
    }
  }
  const journals = database.prepare("SELECT * FROM mutation_journal WHERE project_id = ? AND phase != 'complete' ORDER BY created_at, command_id").all(projectId);
  const recovered = [];
  for (const row of journals) {
    const pointer = readPointer(root);
    const detail = effects(row);
    try {
      if (row.phase === "intent_durable") {
        verifyPreimages(root, detail.preimages ?? []);
        const result = resultFor(row, "cancelled", "Recovered before snapshot publication; the proposal remains available for review.", pointer);
        update(database, row, "complete", "cancelled", result, null, now); recovered.push(result); continue;
      }
      if (row.phase === "snapshot_prepared" || row.phase === "pointer_publish_pending") {
        verifyPreimages(root, detail.preimages ?? []); verifySnapshot(root, row.prior_snapshot_hash); verifySnapshot(root, row.next_snapshot_hash);
        if (pointer.snapshotHash !== row.prior_snapshot_hash && pointer.snapshotHash !== row.next_snapshot_hash) throw new Error("Prepared journal has an unrecognized visible pointer.");
        const restored = pointer.snapshotHash === row.next_snapshot_hash
          ? writePointer(root, { expected: pointer, nextSnapshotHash: row.prior_snapshot_hash, nextVersion: pointer.version + 1, trace })
          : pointer;
        const result = resultFor(row, "needs_review", pointer.snapshotHash === row.next_snapshot_hash
          ? "Recovered an unjournaled file publication and restored the verified prior snapshot."
          : "Recovered a prepared proposal without publishing it.", restored);
        update(database, row, "complete", "needs_review", result, null, now); recovered.push(result); continue;
      }
      if (row.phase === "pointer_published") {
        verifySnapshot(root, row.prior_snapshot_hash); verifySnapshot(root, row.next_snapshot_hash);
        if (pointer.snapshotHash !== row.next_snapshot_hash) throw new Error("Published pointer does not identify the journal snapshot.");
        const restored = writePointer(root, { expected: pointer, nextSnapshotHash: row.prior_snapshot_hash, nextVersion: pointer.version + 1, trace });
        const result = resultFor(row, "needs_review", "Recovered an incomplete file publication and restored the verified prior snapshot.", restored);
        update(database, row, "complete", "needs_review", result, null, now); recovered.push(result); continue;
      }
      if (row.phase === "state_committed") {
        verifySnapshot(root, row.next_snapshot_hash);
        if (pointer.snapshotHash !== row.next_snapshot_hash) throw new Error("State commit does not match the visible snapshot.");
        const audit = database.prepare("SELECT 1 FROM immutable_audit_references WHERE project_id = ? AND command_id = ? AND snapshot_hash = ?").get(projectId, row.command_id, row.next_snapshot_hash);
        if (!audit) throw new Error("State commit has no immutable audit reference.");
        const result = resultFor(row, "succeeded", "Recovered the committed canonical mutation.", pointer);
        update(database, row, "complete", "succeeded", result, null, now); recovered.push(result); continue;
      }
      throw new Error(`Unknown journal phase: ${row.phase}`);
    } catch (error) {
      const blocked = resultFor(row, "blocked", "Mutation recovery is blocked; verified incident recovery is required.", pointer);
      update(database, row, "blocked", "blocked", blocked, error.message.slice(0, 500), now);
      database.prepare("UPDATE lifecycle_state SET status = ?, updated_at = ? WHERE project_id = ?").run("blocked", nowIso(now), projectId);
      throw new Error("Mutation recovery blocked the project; inspect local incident evidence.");
    }
  }
  return recovered;
}
