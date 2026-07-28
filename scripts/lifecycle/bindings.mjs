import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { evaluateReleasePolicies } from "../publishing/policies.mjs";
import { inspectBetaMaterial } from "./beta-material.mjs";

const hash = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value, Object.keys(value).sort())).digest("hex");

export class CanonicalLifecycleBindingProvider {
  constructor({ book, approvalProjectId = book.id, databaseFile = resolve(book.legacyRoot, ".rtb-state", "state.sqlite"), betaStateFile = resolve(book.legacyRoot, ".rtb-publishing", "notion", "sync-state.json") }) { this.book = book; this.approvalProjectId = approvalProjectId; this.databaseFile = databaseFile; this.betaStateFile = betaStateFile; }
  blueprint() { const blueprint = this.book.blueprint; return { briefHash: hash(readFileSync(this.book.metadataPath)), sourcePolicyHash: hash(blueprint.source_policy), budgetsHash: hash(blueprint.budgets), egressPolicyHash: hash(blueprint.provider_egress_policy), blueprintHash: hash(readFileSync(resolve(this.book.root, this.book.manifest.blueprint.path))) }; }
  registerBeta(input) { return registerBetaBinding({ book: this.book, approvalProjectId: this.approvalProjectId, databaseFile: this.databaseFile, stateFile: this.betaStateFile, ...input }); }
  resolve(gate, { database: providedDatabase } = {}) {
    if (gate === "blueprint") return { available: true, bindings: this.blueprint() };
    const database = providedDatabase ?? openStateDatabase(this.databaseFile);
    try {
      if (gate === "beta") {
        const row = database.prepare("SELECT bindings_json FROM lifecycle_material_bindings WHERE project_id = ? AND kind = 'beta' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(this.approvalProjectId);
        if (!row) return { available: false, message: "Beta is unavailable until a verified Notion review snapshot is registered." };
        const current = inspectBetaMaterial(this.book, this.betaStateFile);
        if (current.state !== "ready") return { available: false, message: `Beta is unavailable because its canonical Notion evidence is no longer current. ${current.message}` };
        const bindings = JSON.parse(row.bindings_json);
        if (bindings.betaSnapshotHash !== current.betaSnapshotHash || bindings.policyResultsHash !== current.policyResultsHash) return { available: false, message: "Beta is unavailable because canonical or Notion material changed after preparation. Prepare the exact current Beta material again." };
        return { available: true, bindings };
      }
      const candidate = database.prepare("SELECT candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(this.book.id);
      if (!candidate) return { available: false, message: "Publish is unavailable until a verified release candidate is registered." };
      const value = JSON.parse(candidate.candidate_json), approvals = database.prepare("SELECT gate, bindings_json FROM lifecycle_approvals WHERE project_id = ? AND decision = 'approved' AND id NOT IN (SELECT approval_id FROM lifecycle_approval_invalidations) ORDER BY created_at DESC").all(this.approvalProjectId), binding = (kind) => JSON.parse(approvals.find((item) => item.gate === kind)?.bindings_json ?? "null"), beta = binding("beta");
      const currentBeta = inspectBetaMaterial(this.book, this.betaStateFile);
      if (currentBeta.state !== "ready" || beta?.betaSnapshotHash !== currentBeta.betaSnapshotHash || beta?.policyResultsHash !== currentBeta.policyResultsHash) return { available: false, message: "Publish is unavailable because the approved Beta no longer matches current canonical and Notion material. Sync and prepare Beta again." };
      const releasePolicies = evaluateReleasePolicies(this.book, value, { databaseFile: this.databaseFile, database });
      return { available: true, bindings: { releaseCandidateHash: value.candidateHash, candidateLifecycleVersion: value.lifecycleVersion, releasePolicyHash: releasePolicies.releasePolicyHash, blockingFindings: releasePolicies.releaseEligible ? 0 : 1, blueprint: binding("blueprint"), beta } };
    } finally { if (!providedDatabase) database.close(); }
  }
}

export class StaticLifecycleBindingProvider { constructor(values = {}) { this.values = values; } resolve(gate) { return this.values[gate] ? { available: true, bindings: this.values[gate] } : { available: false, message: "No verified binding is available." }; } }

export function registerBetaBinding({ book, approvalProjectId = book.id, betaSnapshotHash, policyResultsHash, reviewerId, databaseFile = resolve(book.legacyRoot, ".rtb-state", "state.sqlite"), stateFile = resolve(book.legacyRoot, ".rtb-publishing", "notion", "sync-state.json") }) {
  if (![betaSnapshotHash, policyResultsHash].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) || typeof reviewerId !== "string" || reviewerId.length < 2) throw new Error("Verified Beta registration requires two exact SHA-256 hashes and a human reviewer.");
  const database = openStateDatabase(databaseFile);
  try {
    database.exec("BEGIN IMMEDIATE");
    const current = inspectBetaMaterial(book, stateFile);
    if (current.state !== "ready" || current.betaSnapshotHash !== betaSnapshotHash || current.policyResultsHash !== policyResultsHash) throw new Error("Canonical or Notion material changed during Beta preparation. Refresh the real sync receipt and prepare Beta again.");
    const blueprint = database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE project_id = ? AND gate = 'blueprint' AND decision = 'approved' AND id NOT IN (SELECT approval_id FROM lifecycle_approval_invalidations) ORDER BY created_at DESC LIMIT 1").get(approvalProjectId);
    if (!blueprint) throw new Error("A current Blueprint approval is required before registering Beta evidence.");
    const bindings = { betaSnapshotHash, policyResultsHash, blueprint: JSON.parse(blueprint.bindings_json), reviewerId }, id = `BETA-${hash(bindings).slice(0, 24)}`;
    database.prepare("INSERT OR IGNORE INTO lifecycle_material_bindings VALUES (?, ?, 'beta', ?, ?)").run(id, approvalProjectId, JSON.stringify(bindings), new Date().toISOString());
    database.exec("COMMIT");
    durableCheckpoint(database);
    return { id, bindings };
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally { database.close(); }
}
