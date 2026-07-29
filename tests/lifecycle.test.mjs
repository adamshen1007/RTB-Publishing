import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { StaticLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";

const blueprint = { briefHash: "brief", sourcePolicyHash: "source", budgetsHash: "budget", egressPolicyHash: "egress", blueprintHash: "blueprint" };
const beta = { betaSnapshotHash: "beta", policyResultsHash: "policy" };

test("LIF gates use authoritative bindings, version conflicts, and material invalidation", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-lifecycle-"));
  const bindings = { blueprint, beta: { ...beta, blueprint }, publish: { releaseCandidateHash: "candidate", blockingFindings: 0, blueprint, beta } };
  const service = new LifecycleService({ root, projectId: "fixture", bindingProvider: new StaticLifecycleBindingProvider(bindings), now: () => Date.parse("2026-07-28T00:00:00Z") });
  try {
    assert.equal(service.status().gates.blueprint.ok, true);
    const first = await service.approve({ gate: "blueprint", expectedVersion: 0, actor: { type: "human", id: "operator" }, explicitConfirmation: true });
    assert.equal(first.state, "succeeded");
    assert.equal((await service.approve({ gate: "beta", expectedVersion: 0, actor: { type: "human", id: "operator" }, explicitConfirmation: true })).state, "conflict");
    assert.equal((await service.approve({ gate: "beta", expectedVersion: 1, actor: { type: "human", id: "operator" }, explicitConfirmation: true })).state, "succeeded");
    assert.equal((await service.approve({ gate: "publish", expectedVersion: 2, actor: { type: "human", id: "operator" }, explicitConfirmation: true })).state, "succeeded");
    assert.equal((await service.invalidateBlueprint({ expectedVersion: 3, changedFields: ["reader"] })).invalidated, true);
    assert.equal(service.status().gates.publish.ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
