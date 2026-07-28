import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { StaticLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { createPlatformServer } from "../scripts/platform/server.mjs";
import { createCandidate } from "../scripts/publishing/candidate.mjs";
import { pendingReleasePolicies } from "../scripts/publishing/policies.mjs";
import { registerReleaseCandidate } from "../scripts/publishing/release-registry.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";

function candidate({ lifecycleVersion = 2, sourceFingerprint = "a".repeat(64), pdfHash = "2".repeat(64) } = {}) {
  return createCandidate({
    projectId: "fixture-book", lifecycleVersion, sourceFingerprint,
    snapshot: { repository: { revision: "4".repeat(40), tree: "5".repeat(40) }, bundle: { path: "source-snapshot", files: [{ path: "book.md", sha256: "6".repeat(64), bytes: 1 }] } },
    verification: { status: "passed", semanticParity: { status: "passed" }, artifacts: {
      html: { path: "book.html", mediaType: "text/html", bytes: 1, sha256: "1".repeat(64) },
      pdf: { path: "book.pdf", mediaType: "application/pdf", bytes: 1, sha256: pdfHash },
      epub: { path: "book.epub", mediaType: "application/epub+zip", bytes: 1, sha256: "3".repeat(64) },
    } }, policies: pendingReleasePolicies(),
  });
}

async function issueAndBootstrap(base, forged = false) {
  const sessionResponse = await fetch(`${base}/api/session`), session = await sessionResponse.json(), cookie = sessionResponse.headers.get("set-cookie").split(";")[0];
  const headers = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie, "x-rtb-publishing-csrf": session.csrfToken, "x-rtb-publishing-capability": session.mutationCapability };
  const response = await fetch(`${base}/api/session/bootstrap`, { method: "POST", headers, body: JSON.stringify(forged ? { confirm: true, operatorId: "browser-forgery" } : { confirm: true }) });
  const result = await response.json();
  return { response, result, cookie, headers: { ...headers, "x-rtb-publishing-csrf": result.csrfToken, "x-rtb-publishing-capability": result.mutationCapability } };
}

function rotate(headers, response) { return { ...headers, "x-rtb-publishing-csrf": response.headers.get("x-rtb-publishing-next-csrf"), "x-rtb-publishing-capability": response.headers.get("x-rtb-publishing-next-capability") }; }
async function workspace(base, headers) { return (await fetch(`${base}/api/workspace`, { headers: { cookie: headers.cookie } })).json(); }

test("guided publication routes are loopback-authenticated, server-authoritative, rotating, and durable", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-platform-lifecycle-"));
  const blueprint = { briefHash: "brief", sourcePolicyHash: "source", budgetsHash: "budget", egressPolicyHash: "egress", blueprintHash: "blueprint" };
  const bindings = new StaticLifecycleBindingProvider({ blueprint });
  const lifecycle = new LifecycleService({ root, projectId: "fixture-book", bindingProvider: bindings });
  registerReleaseCandidate(root, candidate());
  let betaActor = null;
  const releaseReviewServices = new Map([["fixture-book", (actor) => new ReleaseReviewService({ root, projectId: "fixture-book", actorResolver: () => actor })]]);
  const betaPreparationServices = new Map([["fixture-book", (actor) => ({ inspect: () => ({ state: "ready", code: "ready", message: "Receipt current.", chapterCount: 2 }), prepare: () => { betaActor = actor; bindings.values.beta = { betaSnapshotHash: "b".repeat(64), policyResultsHash: "c".repeat(64), blueprint, reviewerId: actor.id }; return { state: "prepared" }; } })]]);
  const platform = createPlatformServer({ lifecycleService: lifecycle, releaseReviewServices, betaPreparationServices });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${platform.server.address().port}`;
  try {
    const forgedBootstrap = await issueAndBootstrap(base, true);
    assert.equal(forgedBootstrap.response.status, 400); assert.match(forgedBootstrap.result.message, /identity is created by the local server/);
    const bootstrapped = await issueAndBootstrap(base);
    assert.equal(bootstrapped.response.status, 200); assert.match(bootstrapped.result.operator, /^human-[a-f0-9]{24}$/);
    let headers = bootstrapped.headers;

    const forgedGate = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/blueprint`, { method: "POST", headers, body: JSON.stringify({ confirm: true, expectedVersion: 0, bindings: { blueprintHash: "browser-forgery" } }) });
    assert.equal(forgedGate.status, 400);
    const replayAfterForgedGate = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/blueprint`, { method: "POST", headers, body: JSON.stringify({ confirm: true, expectedVersion: 0 }) });
    assert.equal(replayAfterForgedGate.status, 403, "a consumed capability cannot be replayed");

    ({ headers } = await issueAndBootstrap(base));
    const blueprintApproval = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/blueprint`, { method: "POST", headers, body: JSON.stringify({ confirm: true, expectedVersion: 0 }) });
    assert.equal(blueprintApproval.status, 202); headers = rotate(headers, blueprintApproval);

    const forgedBeta = await fetch(`${base}/api/projects/fixture-book/lifecycle/beta-preparation`, { method: "POST", headers, body: JSON.stringify({ confirm: true, betaSnapshotHash: "f".repeat(64), reviewerId: "browser" }) });
    assert.equal(forgedBeta.status, 400); assert.match((await forgedBeta.json()).message, /hashes and reviewer identity are resolved by the server/);
    const replay = await fetch(`${base}/api/projects/fixture-book/lifecycle/beta-preparation`, { method: "POST", headers, body: JSON.stringify({ confirm: true }) });
    assert.equal(replay.status, 403);
    headers = rotate(headers, forgedBeta);
    const prepared = await fetch(`${base}/api/projects/fixture-book/lifecycle/beta-preparation`, { method: "POST", headers, body: JSON.stringify({ confirm: true }) });
    assert.equal(prepared.status, 201); assert.match(betaActor.id, /^local-operator:human-/); headers = rotate(headers, prepared);

    const staleBetaView = await workspace(base, headers); const staleBetaIntent = staleBetaView.lifecycle["fixture-book"].gates.beta.intent;
    bindings.values.beta = { ...bindings.values.beta, betaSnapshotHash: "d".repeat(64) };
    const staleBetaApproval = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/beta`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: staleBetaIntent }) });
    assert.equal(staleBetaApproval.status, 409); assert.match((await staleBetaApproval.json()).message, /material changed/); headers = rotate(headers, staleBetaApproval);
    assert.equal(lifecycle.status().lifecycle.version, 1);
    const currentBetaView = await workspace(base, headers);
    const betaApproval = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/beta`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: currentBetaView.lifecycle["fixture-book"].gates.beta.intent }) });
    assert.equal(betaApproval.status, 202); headers = rotate(headers, betaApproval);

    bindings.values.publish = { releaseCandidateHash: "candidate-one", blockingFindings: 0, blueprint, beta: bindings.values.beta };
    const stalePublishView = await workspace(base, headers), stalePublishIntent = stalePublishView.lifecycle["fixture-book"].gates.publish.intent;
    bindings.values.publish = { ...bindings.values.publish, releaseCandidateHash: "candidate-two" };
    const stalePublishApproval = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/publish`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: stalePublishIntent }) });
    assert.equal(stalePublishApproval.status, 409); assert.match((await stalePublishApproval.json()).message, /material changed/); headers = rotate(headers, stalePublishApproval);
    assert.equal(lifecycle.status().lifecycle.version, 2);
    const currentPublishView = await workspace(base, headers);
    const publishApproval = await fetch(`${base}/api/projects/fixture-book/lifecycle/gates/publish`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: currentPublishView.lifecycle["fixture-book"].gates.publish.intent }) });
    assert.equal(publishApproval.status, 202); headers = rotate(headers, publishApproval);

    const staleReviewView = await workspace(base, headers), staleReviewIntent = staleReviewView.releaseReviews["fixture-book"].intent;
    const replacement = candidate({ lifecycleVersion: 3, sourceFingerprint: "e".repeat(64), pdfHash: "7".repeat(64) }); registerReleaseCandidate(root, replacement);
    const staleReview = await fetch(`${base}/api/projects/fixture-book/release-reviews/migration-visual-review`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: staleReviewIntent, decision: "approved" }) });
    assert.equal(staleReview.status, 409); assert.match((await staleReview.json()).message, /candidate changed/); headers = rotate(headers, staleReview);
    const afterRollover = await workspace(base, headers);
    assert.equal(afterRollover.releaseReviews["fixture-book"].candidateHash, replacement.candidateHash);
    assert.equal(afterRollover.releaseReviews["fixture-book"].reviews["migration-visual-review"].decision, "pending");

    const forgedReview = await fetch(`${base}/api/projects/fixture-book/release-reviews/migration-visual-review`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: afterRollover.releaseReviews["fixture-book"].intent, decision: "approved", candidateHash: "f".repeat(64) }) });
    assert.equal(forgedReview.status, 400); assert.match((await forgedReview.json()).message, /cannot author candidateHash/); headers = rotate(headers, forgedReview);
    for (const [kind, decision, qualifiedRole] of [["migration-visual-review", "rejected"], ["pdf-screen-reader-visual-review", "approved"], ["rights-and-brand-review", "approved", "publishing rights owner"]]) {
      const current = await workspace(base, headers);
      const response = await fetch(`${base}/api/projects/fixture-book/release-reviews/${kind}`, { method: "POST", headers, body: JSON.stringify({ confirm: true, intent: current.releaseReviews["fixture-book"].intent, decision, ...(qualifiedRole ? { qualifiedRole } : {}) }) });
      assert.equal(response.status, 201); headers = rotate(headers, response);
    }
    const finalWorkspace = await workspace(base, headers);
    assert.equal(finalWorkspace.releaseReviews["fixture-book"].reviews["migration-visual-review"].decision, "rejected");
    assert.equal(finalWorkspace.releaseReviews["fixture-book"].reviews["rights-and-brand-review"].reviewer.qualifiedRole, "publishing rights owner");
  } finally { await new Promise((done) => platform.server.close(done)); rmSync(root, { recursive: true, force: true }); }
});

test("Creator Studio exposes guided controls without manual hashes or reviewer identity fields", async () => {
  const platform = createPlatformServer({ lifecycleServices: new Map(), releaseReviewServices: new Map(), betaPreparationServices: new Map() });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${platform.server.address().port}`;
  try {
    const app = await (await fetch(`${base}/app.js`)).text(), html = await (await fetch(`${base}/`)).text();
    assert.match(html, /Confirm human review session/); assert.match(app, /Candidate-bound release reviews/); assert.match(app, /Displayed candidate/); assert.match(app, /Declaration: my qualified rights-review role/); assert.match(app, /Prepare Beta/); assert.match(app, /\["blueprint", "beta", "publish"\]/); assert.match(app, /`Approve \$\{label\}`/); assert.match(app, /intent/);
    assert.doesNotMatch(app, /window\.prompt|candidateHash|betaSnapshotHash|policyResultsHash|operatorId|beta-evidence/);
  } finally { await new Promise((done) => platform.server.close(done)); }
});
