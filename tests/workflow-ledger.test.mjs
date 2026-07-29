import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { WorkflowLedger } from "../scripts/lifecycle/ledger.mjs";

test("JOB ledger fences stale owners, preserves retry lineage, and refuses duplicate dispatch", () => {
  let now = Date.parse("2026-07-28T00:00:00Z"); const root = mkdtempSync(resolve(tmpdir(), "rtb-ledger-"));
  const ledger = new WorkflowLedger({ file: resolve(root, "ledger.sqlite"), now: () => now });
  try {
    const first = ledger.submit({ projectId: "p", operationKind: "publish", idempotencyKey: "request-1", inputFingerprint: "input-1" });
    assert.equal(ledger.submit({ projectId: "p", operationKind: "publish", idempotencyKey: "request-1", inputFingerprint: "input-1" }).runId, first.runId);
    const ownerA = ledger.claim(first.runId, "a"); assert.ok(ownerA);
    assert.equal(ledger.dispatch(ownerA.attempt_id, "a", ownerA.fencingToken, { destination: "adapter", operation: "publish", idempotencyKey: "request-1", inputFingerprint: "input-1" }).safeToSend, true);
    assert.equal(ledger.dispatch(ownerA.attempt_id, "a", ownerA.fencingToken, { destination: "adapter", operation: "publish", idempotencyKey: "request-1", inputFingerprint: "input-1" }).safeToSend, false);
    now += 120000; ledger.recoverStale({ olderThanMs: 1 });
    assert.equal(ledger.claim(first.runId, "b"), null, "stale work requires a linked retry, never takeover");
    assert.throws(() => ledger.finish(ownerA.attempt_id, "a", ownerA.fencingToken, { status: "succeeded" }), /fence/);
    assert.throws(() => ledger.retry(first.runId), /reconciliation/);
    const second = ledger.submit({ projectId: "p", operationKind: "research", idempotencyKey: "request-2", inputFingerprint: "input-2" });
    const owner = ledger.claim(second.runId, "worker"); ledger.finish(owner.attempt_id, "worker", owner.fencingToken, { status: "failed", retryClass: "retryable" });
    const retry = ledger.retry(second.runId); assert.equal(retry.attempt.parent_attempt_id, owner.attempt_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
