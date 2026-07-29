import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { CanonicalLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { createCandidate } from "../scripts/publishing/candidate.mjs";
import { fileHash, sha256 } from "../scripts/publishing/common.mjs";
import { finalizeRelease } from "../scripts/publishing/finalize-release.mjs";
import { evaluateReleasePolicies } from "../scripts/publishing/policies.mjs";
import { registerReleaseCandidate } from "../scripts/publishing/release-registry.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";
import { verifyReleaseDirectory } from "../scripts/publishing/verify-release.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";

const HUMAN = Object.freeze({ type: "human", id: "acceptance-reviewer" });
const REVIEW_KINDS = Object.freeze([
  "migration-visual-review",
  "pdf-screen-reader-visual-review",
  "rights-and-brand-review",
]);

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-acceptance-workflow-"));
  const chaptersDirectory = resolve(root, "chapters");
  mkdirSync(chaptersDirectory, { recursive: true });
  const chapters = [
    {
      id: "chapter-one",
      order: 1,
      part_id: "part-one",
      reader_decision: "Choose the first action",
      required_output: "First action",
      sourcePath: resolve(chaptersDirectory, "chapter-one.md"),
    },
    {
      id: "chapter-two",
      order: 2,
      part_id: "part-one",
      reader_decision: "Choose the second action",
      required_output: "Second action",
      sourcePath: resolve(chaptersDirectory, "chapter-two.md"),
    },
  ];
  for (const chapter of chapters) {
    writeFileSync(
      chapter.sourcePath,
      `# ${chapter.id}\n\nCanonical acceptance text.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Decision | |\n`,
    );
  }
  const metadataPath = resolve(root, "book.md");
  const blueprintPath = resolve(root, "blueprint.yaml");
  writeFileSync(metadataPath, "# Acceptance Fixture\n");
  writeFileSync(blueprintPath, "fixture: true\n");
  const book = {
    id: "acceptance-fixture-book",
    root,
    legacyRoot: root,
    metadataPath,
    metadata: "---\ntitle: Acceptance Fixture\nversion: 1.0.0\nstatus: beta\n---\n",
    manifest: { locale: "en", paths: {}, blueprint: { path: "blueprint.yaml" } },
    blueprint: { source_policy: {}, budgets: {}, provider_egress_policy: {} },
    chapters,
    parts: [{ id: "part-one", order: 1, title: "Start" }],
  };
  const provider = new CanonicalLifecycleBindingProvider({ book });
  const lifecycle = new LifecycleService({ root, projectId: book.id, bindingProvider: provider });
  const stateFile = resolve(root, ".rtb-publishing", "notion", "sync-state.json");
  mkdirSync(resolve(stateFile, ".."), { recursive: true });
  const beta = new BetaPreparationService({
    book,
    bindingProvider: provider,
    actorResolver: () => HUMAN,
    stateFile,
  });
  const reviews = new ReleaseReviewService({
    root,
    projectId: book.id,
    actorResolver: () => HUMAN,
  });
  return {
    root,
    book,
    lifecycle,
    beta,
    reviews,
    stateFile,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function notionReceipt(book, overrides = {}) {
  const payload = publicationExport(book);
  return {
    chapters: Object.fromEntries(
      payload.chapters.map((chapter) => [
        chapter.id,
        {
          sourceHash: overrides[chapter.id] ?? chapter.sourceHash,
          privatePageId: `private-${chapter.id}`,
        },
      ]),
    ),
  };
}

function candidate(root, projectId, lifecycleVersion, edition) {
  const artifacts = {};
  for (const [format, name] of [
    ["html", "book.html"],
    ["pdf", "book.pdf"],
    ["epub", "book.epub"],
  ]) {
    const path = resolve(root, `${edition}-${name}`);
    const content = `${edition}-${format}-artifact`;
    writeFileSync(path, content);
    artifacts[format] = {
      path: `${edition}-${name}`,
      mediaType: "test/fixture",
      bytes: Buffer.byteLength(content),
      sha256: fileHash(path),
    };
  }
  const bundleDirectory = resolve(root, `${edition}-source-snapshot`);
  mkdirSync(bundleDirectory);
  const sourceFile = resolve(bundleDirectory, "book.md");
  writeFileSync(sourceFile, `# ${edition} source\n`);
  const verification = {
    sourceFingerprint: sha256(`${edition}-source`),
    status: "passed",
    semanticParity: { status: "passed" },
    html: { status: "passed" },
    epub: { status: "passed" },
    pdf: { status: "passed", vera: { "2a": { compliant: true }, ua1: { compliant: true } } },
    artifacts,
  };
  return createCandidate({
    projectId,
    lifecycleVersion,
    sourceFingerprint: verification.sourceFingerprint,
    snapshot: {
      repository: { revision: "c".repeat(40), tree: "d".repeat(40) },
      bundle: {
        path: "source-snapshot",
        files: [{ path: "book.md", sha256: fileHash(sourceFile), bytes: Buffer.byteLength(`# ${edition} source\n`) }],
      },
    },
    verification,
    policies: {},
  });
}

function approveReviews(service, expectedCandidateHash) {
  for (const kind of REVIEW_KINDS) {
    service.record(
      {
        kind,
        decision: "approved",
        ...(kind === "rights-and-brand-review"
          ? { qualifiedRole: "Publishing rights owner" }
          : {}),
      },
      { expectedCandidateHash },
    );
  }
}

function materializeRelease(root, candidate) {
  const directory = resolve(root, "final-release"); mkdirSync(directory);
  for (const artifact of Object.values(candidate.artifacts)) copyFileSync(resolve(root, artifact.path), resolve(directory, artifact.path));
  const edition = candidate.artifacts.html.path.replace(/-book\.html$/, "");
  mkdirSync(resolve(directory, "source-snapshot"));
  copyFileSync(resolve(root, `${edition}-source-snapshot`, "book.md"), resolve(directory, "source-snapshot", "book.md"));
  writeFileSync(resolve(directory, "candidate.json"), `${JSON.stringify(candidate, null, 2)}\n`);
  writeFileSync(resolve(directory, "verification.json"), `${JSON.stringify({ sourceFingerprint: candidate.sourceFingerprint, ...candidate.validators, artifacts: candidate.artifacts }, null, 2)}\n`);
  return directory;
}

test("acceptance workflow reaches one immutable manifest through real durable boundaries", async () => {
  const item = fixture();
  try {
    const blueprintView = item.lifecycle.status();
    const blueprint = await item.lifecycle.approve({
      gate: "blueprint",
      expectedVersion: 0,
      expectedMaterialRevision: blueprintView.gates.blueprint.materialRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    });
    assert.equal(blueprint.state, "succeeded");
    assert.equal(blueprint.lifecycle.version, 1);

    const preBetaCandidate = candidate(item.root, item.book.id, 1, "pre-beta");
    registerReleaseCandidate(item.root, preBetaCandidate);
    approveReviews(item.reviews, preBetaCandidate.candidateHash);
    assert.equal(evaluateReleasePolicies(item.book, preBetaCandidate).releaseEligible, true);

    assert.equal(item.beta.inspect().code, "notion_receipt_missing");
    writeFileSync(
      item.stateFile,
      JSON.stringify(notionReceipt(item.book, { "chapter-two": "stale" })),
    );
    assert.equal(item.beta.inspect().code, "notion_receipt_stale");
    await assert.rejects(() => item.beta.prepare(), /matches every canonical chapter/);

    writeFileSync(item.stateFile, JSON.stringify(notionReceipt(item.book)));
    const prepared = await item.beta.prepare();
    assert.equal(prepared.state, "prepared");
    const betaView = item.lifecycle.status();
    const beta = await item.lifecycle.approve({
      gate: "beta",
      expectedVersion: 1,
      expectedMaterialRevision: betaView.gates.beta.materialRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    });
    assert.equal(beta.state, "succeeded");
    assert.equal(beta.lifecycle.version, 2);

    const postBetaCandidate = candidate(item.root, item.book.id, 2, "post-beta-a");
    registerReleaseCandidate(item.root, postBetaCandidate);
    assert.equal(
      evaluateReleasePolicies(item.book, postBetaCandidate).releaseEligible,
      false,
      "pre-Beta reviews must not transfer to the post-Beta candidate",
    );
    approveReviews(item.reviews, postBetaCandidate.candidateHash);
    assert.equal(evaluateReleasePolicies(item.book, postBetaCandidate).releaseEligible, true);

    const stalePublishRevision = item.lifecycle.status().gates.publish.materialRevision;
    const finalCandidate = candidate(item.root, item.book.id, 2, "post-beta-final");
    registerReleaseCandidate(item.root, finalCandidate);
    assert.throws(
      () => item.reviews.record(
        { kind: "migration-visual-review", decision: "approved" },
        { expectedCandidateHash: postBetaCandidate.candidateHash },
      ),
      /candidate changed after it was displayed/,
    );
    assert.equal(evaluateReleasePolicies(item.book, finalCandidate).releaseEligible, false);
    const stalePublish = await item.lifecycle.approve({
      gate: "publish",
      expectedVersion: 2,
      expectedMaterialRevision: stalePublishRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    });
    assert.equal(stalePublish.state, "stale");
    assert.equal(item.lifecycle.status().lifecycle.version, 2);

    approveReviews(item.reviews, finalCandidate.candidateHash);
    const policies = evaluateReleasePolicies(item.book, finalCandidate);
    assert.equal(policies.releaseEligible, true);
    const publishView = item.lifecycle.status();
    const publish = await item.lifecycle.approve({
      gate: "publish",
      expectedVersion: 2,
      expectedMaterialRevision: publishView.gates.publish.materialRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    });
    assert.equal(publish.state, "succeeded");
    assert.equal(publish.lifecycle.version, 3);

    const releaseDirectory = materializeRelease(item.root, finalCandidate);
    const finalized = await finalizeRelease({ root: item.root, project: item.book, candidateHash: finalCandidate.candidateHash, approvalId: publish.approval.id, releaseDirectory });
    const completion = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite")); try { const record = completion.prepare("SELECT * FROM release_finalizations").get(), approval = completion.prepare("SELECT * FROM lifecycle_approvals WHERE id = ?").get(record.approval_id), at = new Date().toISOString(); completion.prepare("UPDATE release_finalizations SET status = 'completed', completed_at = ?, approval_actor_type = ?, approval_actor_id = ?, approval_created_at = ?, approval_lifecycle_version = ?, approval_bindings_json = ?, completed_while_current = 1").run(at, approval.actor_type, approval.actor_id, approval.created_at, approval.lifecycle_version, approval.bindings_json); completion.prepare("UPDATE release_identities SET status = 'completed'").run(); } finally { completion.close(); }
    assert.equal(verifyReleaseDirectory(releaseDirectory, finalCandidate, { manifest: finalized.manifest, root: item.root }), true);
    assert.deepEqual((await finalizeRelease({ root: item.root, project: item.book, candidateHash: finalCandidate.candidateHash, approvalId: publish.approval.id, releaseDirectory })).manifest, finalized.manifest, "an identical completed retry preserves the exact manifest identity");
  } finally {
    item.dispose();
  }
});

test("Beta registration and approval revalidate current canonical and Notion material", async () => {
  const item = fixture();
  try {
    const blueprintView = item.lifecycle.status();
    assert.equal((await item.lifecycle.approve({
      gate: "blueprint",
      expectedVersion: 0,
      expectedMaterialRevision: blueprintView.gates.blueprint.materialRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    })).state, "succeeded");
    writeFileSync(item.stateFile, JSON.stringify(notionReceipt(item.book)));
    const inspected = item.beta.inspect();

    await assert.rejects(
      () => item.lifecycle.bindingProvider.registerBeta({
        betaSnapshotHash: inspected.betaSnapshotHash,
        policyResultsHash: inspected.policyResultsHash,
        reviewerId: HUMAN.id,
        beforeCommit: () => writeFileSync(
          item.book.chapters[0].sourcePath,
          "# chapter-one\n\nAccepted editorial correction.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Decision | |\n",
        ),
      }),
      /changed before Beta registration commit/,
      "registration re-confirms material after a controlled interleaving",
    );

    writeFileSync(item.stateFile, JSON.stringify(notionReceipt(item.book)));
    await item.beta.prepare();
    const staleRevision = item.lifecycle.status().gates.beta.materialRevision;
    const stale = await item.lifecycle.approve({
      gate: "beta",
      expectedVersion: 1,
      expectedMaterialRevision: staleRevision,
      actor: HUMAN,
      explicitConfirmation: true,
      beforeCommit: () => writeFileSync(
        item.book.chapters[0].sourcePath,
        "# chapter-one\n\nA later unsynced correction.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Decision | |\n",
      ),
    });
    assert.equal(stale.state, "stale");
    assert.match(stale.message, /changed before approval commit/);
    assert.equal(item.lifecycle.status().lifecycle.version, 1);
  } finally {
    item.dispose();
  }
});
