import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { acquireLease, durableCheckpoint, initializeLifecycle, lifecycle, openStateDatabase, releaseLease } from "../state/database.mjs";
import { acquireProjectLock } from "../state/project-lock.mjs";
import { ensureStateDirectories } from "../state/snapshots.mjs";
import { materialHash } from "../publishing/common.mjs";
import { createApproval } from "./approvals.mjs";
import { GATES, id, lifecycleRecord, timestamp } from "./model.mjs";
import { currentApproval, gateGuard, materialBlueprintChange } from "./guards.mjs";

const next = { blueprint: ["evidence", "blueprint_approved"], beta: ["notion_beta", "beta_approved"], publish: ["published", "published"] };

export class LifecycleService {
  constructor({ root, projectId, projectPath = null, bindingProvider, databaseFile = resolve(root, ".rtb-state", "state.sqlite"), now = () => Date.now() } = {}) {
    this.root = resolve(root);
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.databaseFile = databaseFile;
    this.bindingProvider = bindingProvider;
    this.now = now;
  }

  db() {
    const database = openStateDatabase(this.databaseFile, { now: this.now });
    initializeLifecycle(database, this.projectId, { guard: "blueprint_required", status: "blueprint_review", now: this.now });
    return database;
  }

  approvals(database) {
    return database.prepare("SELECT a.*,i.id AS invalidation_id FROM lifecycle_approvals a LEFT JOIN lifecycle_approval_invalidations i ON i.approval_id=a.id WHERE a.project_id=? ORDER BY a.created_at,id").all(this.projectId).map((row) => ({ id: row.id, projectId: row.project_id, gate: row.gate, decision: row.decision, actor: { type: row.actor_type, id: row.actor_id }, explicitConfirmation: Boolean(row.explicit_confirmation), lifecycleVersion: row.lifecycle_version, bindings: JSON.parse(row.bindings_json), expiresAt: row.expires_at, createdAt: row.created_at, invalidated: Boolean(row.invalidation_id) }));
  }

  resolved(gate, database) { return this.bindingProvider?.resolve(gate, database ? { database } : undefined) ?? { available: false, message: "No authoritative binding provider is configured." }; }

  status() {
    const database = this.db();
    try {
      const current = lifecycleRecord(lifecycle(database, this.projectId));
      const approvals = this.approvals(database);
      const gates = Object.fromEntries(GATES.map((gate) => {
        const binding = this.resolved(gate, database);
        if (!binding.available) return [gate, { ok: false, message: binding.message, materialRevision: null }];
        return [gate, { ...gateGuard({ gate, approvals, bindings: binding.bindings, lifecycleVersion: current.version, now: this.now() }), materialRevision: materialHash(binding.bindings) }];
      }));
      return { lifecycle: current, approvals, gates };
    } finally { database.close(); }
  }

  mutationExpectation() {
    const database = this.db();
    try {
      const current = lifecycleRecord(lifecycle(database, this.projectId));
      const binding = this.resolved("blueprint", database);
      if (!binding.available || current.guard !== "blueprint_approved") return null;
      return currentApproval(this.approvals(database), "blueprint", binding.bindings, this.now()) ? { version: current.version, guard: current.guard } : null;
    } finally { database.close(); }
  }

  async approve({ gate, expectedVersion, expectedMaterialRevision, actor, explicitConfirmation, reason = "Explicit human approval", beforeCommit } = {}) {
    if (!GATES.includes(gate)) throw new Error("Unknown lifecycle gate.");
    ensureStateDirectories(this.root);
    const lock = await acquireProjectLock(this.root, { ownerId: `lifecycle-${randomUUID()}`, now: this.now });
    const database = this.db();
    let lease;
    try {
      lease = acquireLease(database, { projectId: this.projectId, ownerId: lock.ownerId, operationId: `gate-${randomUUID()}`, now: this.now });
      // The immediate transaction fences Beta binding and candidate registration
      // while the exact displayed material is re-resolved and committed.
      database.exec("BEGIN IMMEDIATE");
      try {
        const prior = lifecycleRecord(lifecycle(database, this.projectId));
        if (prior.version !== expectedVersion) { database.exec("ROLLBACK"); return { state: "conflict", lifecycle: prior }; }
        const binding = this.resolved(gate, database);
        if (!binding.available) { database.exec("ROLLBACK"); return { state: "blocked", message: binding.message }; }
        const materialRevision = materialHash(binding.bindings);
        if (expectedMaterialRevision && materialRevision !== expectedMaterialRevision) {
          database.exec("ROLLBACK");
          return { state: "stale", message: `The ${gate} material changed after it was displayed. Review the current exact material before approving it.` };
        }
        const guard = gateGuard({ gate, approvals: this.approvals(database), bindings: binding.bindings, lifecycleVersion: prior.version, now: this.now() });
        if (!guard.ok) { database.exec("ROLLBACK"); return { state: "blocked", message: guard.message }; }
        const approval = createApproval({ projectId: this.projectId, gate, actor, explicitConfirmation, lifecycleVersion: prior.version + 1, bindings: binding.bindings }, { now: this.now });
        const at = timestamp(this.now), [status, guardName] = next[gate];
        database.prepare("INSERT INTO lifecycle_approvals VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(approval.id, this.projectId, gate, "approved", "human", actor.id, 1, approval.lifecycleVersion, JSON.stringify(approval.bindings), null, approval.createdAt);
        database.prepare("UPDATE lifecycle_state SET version=?,status=?,guard=?,updated_at=? WHERE project_id=? AND version=?").run(prior.version + 1, status, guardName, at, this.projectId, prior.version);
        database.prepare("INSERT INTO lifecycle_transitions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id("TRN"), this.projectId, prior.version, prior.state, status, prior.version + 1, "human", actor.id, reason, JSON.stringify(guard), at);
        beforeCommit?.();
        const confirmation = this.resolved(gate, database);
        if (!confirmation.available || materialHash(confirmation.bindings) !== materialRevision) {
          database.exec("ROLLBACK");
          return { state: "stale", message: `The ${gate} material changed before approval commit. Review the current exact material and try again.` };
        }
        database.exec("COMMIT");
        durableCheckpoint(database);
        return { state: "succeeded", approval, lifecycle: lifecycleRecord(lifecycle(database, this.projectId)) };
      } catch (error) {
        if (database.inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      if (lease) releaseLease(database, { projectId: this.projectId, ownerId: lock.ownerId, fencingToken: lease });
      database.close();
      lock.release();
    }
  }

  async invalidateBlueprint({ expectedVersion, changedFields, reason = "Material Blueprint change", actor = { type: "system", id: "canonical-mutation" } } = {}) {
    if (!materialBlueprintChange(changedFields)) return { state: "succeeded", invalidated: false };
    ensureStateDirectories(this.root);
    const lock = await acquireProjectLock(this.root, { ownerId: `lifecycle-${randomUUID()}`, now: this.now });
    const database = this.db();
    try {
      const prior = lifecycleRecord(lifecycle(database, this.projectId));
      if (prior.version !== expectedVersion) return { state: "conflict" };
      const approvals = this.approvals(database).filter((approval) => !approval.invalidated);
      const at = timestamp(this.now);
      database.exec("BEGIN IMMEDIATE");
      for (const approval of approvals) database.prepare("INSERT INTO lifecycle_approval_invalidations VALUES (?,?,?,?,?)").run(id("INV"), approval.id, this.projectId, reason, at);
      database.prepare("UPDATE lifecycle_state SET version=?,status='blueprint_review',guard='blueprint_required',updated_at=? WHERE project_id=? AND version=?").run(prior.version + 1, at, this.projectId, prior.version);
      database.prepare("INSERT INTO lifecycle_transitions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id("TRN"), this.projectId, prior.version, prior.state, "blueprint_review", prior.version + 1, actor.type, actor.id, reason, JSON.stringify({ changedFields }), at);
      database.exec("COMMIT");
      durableCheckpoint(database);
      return { state: "succeeded", invalidated: approvals.length > 0 };
    } finally { database.close(); lock.release(); }
  }
}
