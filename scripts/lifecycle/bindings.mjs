import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openStateDatabase } from "../state/database.mjs";
import { evaluateReleasePolicies } from "../publishing/policies.mjs";

const hash = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value, Object.keys(value).sort())).digest("hex");

export class CanonicalLifecycleBindingProvider {
  constructor({ book, approvalProjectId = book.id, databaseFile = resolve(book.legacyRoot, ".rtb-state", "state.sqlite") }) { this.book = book; this.approvalProjectId = approvalProjectId; this.databaseFile = databaseFile; }
  blueprint() { const blueprint = this.book.blueprint; return { briefHash: hash(readFileSync(this.book.metadataPath)), sourcePolicyHash: hash(blueprint.source_policy), budgetsHash: hash(blueprint.budgets), egressPolicyHash: hash(blueprint.provider_egress_policy), blueprintHash: hash(readFileSync(resolve(this.book.root, this.book.manifest.blueprint.path))) }; }
  registerBeta(input) { return registerBetaBinding({ book: this.book, approvalProjectId: this.approvalProjectId, ...input }); }
  resolve(gate) {
    if (gate === "blueprint") return { available: true, bindings: this.blueprint() };
    const database = openStateDatabase(this.databaseFile);
    try {
      if (gate === "beta") { const row = database.prepare("SELECT bindings_json FROM lifecycle_material_bindings WHERE project_id = ? AND kind = 'beta' ORDER BY created_at DESC, id DESC LIMIT 1").get(this.approvalProjectId); return row ? { available: true, bindings: JSON.parse(row.bindings_json) } : { available: false, message: "Beta is unavailable until a verified Notion review snapshot is registered." }; }
      const candidate = database.prepare("SELECT candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(this.book.id);
      if (!candidate) return { available: false, message: "Publish is unavailable until a verified release candidate is registered." };
      const value = JSON.parse(candidate.candidate_json), approvals = database.prepare("SELECT gate, bindings_json FROM lifecycle_approvals WHERE project_id = ? AND decision = 'approved' AND id NOT IN (SELECT approval_id FROM lifecycle_approval_invalidations) ORDER BY created_at DESC").all(this.approvalProjectId), binding = (kind) => JSON.parse(approvals.find((item) => item.gate === kind)?.bindings_json ?? "null"), releasePolicies = evaluateReleasePolicies(this.book, value, { databaseFile: this.databaseFile });
      return { available: true, bindings: { releaseCandidateHash: value.candidateHash, candidateLifecycleVersion: value.lifecycleVersion, blockingFindings: releasePolicies.releaseEligible ? 0 : 1, blueprint: binding("blueprint"), beta: binding("beta") } };
    } finally { database.close(); }
  }
}

export class StaticLifecycleBindingProvider { constructor(values = {}) { this.values = values; } resolve(gate) { return this.values[gate] ? { available: true, bindings: this.values[gate] } : { available: false, message: "No verified binding is available." }; } }

export function registerBetaBinding({ book, approvalProjectId = book.id, betaSnapshotHash, policyResultsHash, reviewerId }) {
  if (![betaSnapshotHash, policyResultsHash].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) || typeof reviewerId !== "string" || reviewerId.length < 2) throw new Error("Verified Beta registration requires two exact SHA-256 hashes and a human reviewer.");
  const database = openStateDatabase(resolve(book.legacyRoot, ".rtb-state", "state.sqlite"));
  try {
    const blueprint = database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE project_id = ? AND gate = 'blueprint' AND decision = 'approved' AND id NOT IN (SELECT approval_id FROM lifecycle_approval_invalidations) ORDER BY created_at DESC LIMIT 1").get(approvalProjectId);
    if (!blueprint) throw new Error("A current Blueprint approval is required before registering Beta evidence.");
    const bindings = { betaSnapshotHash, policyResultsHash, blueprint: JSON.parse(blueprint.bindings_json), reviewerId }, id = `BETA-${hash(bindings).slice(0, 24)}`;
    database.prepare("INSERT OR IGNORE INTO lifecycle_material_bindings VALUES (?, ?, 'beta', ?, ?)").run(id, approvalProjectId, JSON.stringify(bindings), new Date().toISOString());
    return { id, bindings };
  } finally { database.close(); }
}
