import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createCandidate, verifyCandidate } from "../scripts/publishing/candidate.mjs";
import { pendingReleasePolicies, evaluateReleasePolicies } from "../scripts/publishing/policies.mjs";
import { registerReleaseCandidate } from "../scripts/publishing/release-registry.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";
import { ReleaseReviewStore } from "../scripts/publishing/release-review-store.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";

function candidate({ lifecycleVersion = 2, sourceFingerprint = "a".repeat(64), pdfHash = "2".repeat(64) } = {}) {
  const artifacts = {
    html: { path: "book.html", mediaType: "text/html", bytes: 1, sha256: "1".repeat(64) },
    pdf: { path: "book.pdf", mediaType: "application/pdf", bytes: 1, sha256: pdfHash },
    epub: { path: "book.epub", mediaType: "application/epub+zip", bytes: 1, sha256: "3".repeat(64) },
  };
  return createCandidate({
    projectId: "fixture-book",
    lifecycleVersion,
    sourceFingerprint,
    snapshot: { repository: { revision: "4".repeat(40), tree: "5".repeat(40) }, bundle: { path: "source-snapshot", files: [{ path: "book.md", sha256: "6".repeat(64), bytes: 1 }] } },
    verification: { status: "passed", semanticParity: { status: "passed" }, artifacts },
    policies: pendingReleasePolicies(),
  });
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-release-reviews-"));
  const project = { id: "fixture-book", root, legacyRoot: root };
  let time = Date.parse("2026-07-28T00:00:00.000Z");
  const service = new ReleaseReviewService({ root, projectId: project.id, actorResolver: () => ({ type: "human", id: "server-operator" }), now: () => time++ });
  return { root, project, service, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("release review service resolves candidate hashes and actor, and keeps evidence append-only", () => {
  const item = fixture();
  try {
    const current = candidate(); registerReleaseCandidate(item.root, current);
    assert.throws(() => item.service.record({ kind: "migration-visual-review", decision: "approved", candidateHash: "f".repeat(64) }), /cannot author candidateHash/);
    assert.throws(() => item.service.record({ kind: "migration-visual-review", decision: "approved", reviewer: { type: "human", id: "browser" } }), /cannot author reviewer/);
    const review = item.service.record({ kind: "migration-visual-review", decision: "approved" });
    assert.equal(review.candidateHash, current.candidateHash);
    assert.equal(review.sourceFingerprint, current.sourceFingerprint);
    assert.deepEqual(review.artifactHashes, { html: "1".repeat(64), pdf: "2".repeat(64), epub: "3".repeat(64) });
    assert.deepEqual(review.reviewer, { type: "human", id: "server-operator" });
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    assert.throws(() => database.prepare("UPDATE release_reviews SET decision = 'rejected' WHERE id = ?").run(review.id), /append-only/);
    assert.throws(() => database.prepare("DELETE FROM release_reviews WHERE id = ?").run(review.id), /append-only/);
    database.close();
  } finally { item.dispose(); }
});

test("release policy requires exact current evidence and a qualified rights approver", () => {
  const item = fixture();
  try {
    const reviewed = candidate(); registerReleaseCandidate(item.root, reviewed);
    assert.throws(() => item.service.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "   " }), /qualified reviewer role/);
    const priorReview = item.service.record({ kind: "migration-visual-review", decision: "approved" });
    item.service.record({ kind: "pdf-screen-reader-visual-review", decision: "approved" });
    item.service.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "publishing rights owner" });
    const approved = evaluateReleasePolicies(item.project, reviewed);
    assert.equal(approved.releaseEligible, true);
    assert.equal(approved.candidateHash, reviewed.candidateHash);

    const stale = candidate({ lifecycleVersion: 3, sourceFingerprint: "b".repeat(64), pdfHash: "7".repeat(64) });
    registerReleaseCandidate(item.root, stale);
    const staleResult = evaluateReleasePolicies(item.project, stale);
    assert.equal(staleResult.releaseEligible, false);
    assert.deepEqual(new Set(Object.values(staleResult.manualReviews)), new Set(["awaiting-named-reviewer"]));
    assert.equal(evaluateReleasePolicies(item.project, reviewed).releaseEligible, true, "a later candidate does not rewrite prior evidence");
    const store = new ReleaseReviewStore({ root: item.root });
    assert.throws(() => store.append({ ...priorReview, id: "REV-WRONG-CANDIDATE" }), /current registered candidate changed/);

    item.service.record({ kind: "migration-visual-review", decision: "rejected" });
    assert.equal(evaluateReleasePolicies(item.project, stale).manualReviews["migration-visual-review"], "rejected");
  } finally { item.dispose(); }
});

test("review evidence does not self-reference into canonical or candidate identity", () => {
  const item = fixture();
  try {
    const current = candidate(); const identity = current.candidateHash; const fingerprint = current.sourceFingerprint;
    registerReleaseCandidate(item.root, current);
    mkdirSync(resolve(item.root, "reviews"));
    writeFileSync(resolve(item.root, "reviews", "migration-visual-review.json"), JSON.stringify({ decision: "approved", candidateHash: current.candidateHash }));
    assert.equal(evaluateReleasePolicies(item.project, current).releaseEligible, false, "canonical-tree JSON cannot approve a release");
    for (const kind of ["migration-visual-review", "pdf-screen-reader-visual-review"]) item.service.record({ kind, decision: "approved" });
    item.service.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "rights counsel" });
    assert.equal(evaluateReleasePolicies(item.project, current).releaseEligible, true);
    assert.equal(current.candidateHash, identity);
    assert.equal(current.sourceFingerprint, fingerprint);
    assert.equal(current.policies.releaseEligible, false);
    assert.equal(verifyCandidate(current), true);
  } finally { item.dispose(); }
});
