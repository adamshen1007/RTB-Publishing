import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { CanonicalLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { loadPublishApproval } from "../scripts/publishing/approval-store.mjs";
import { createCandidate } from "../scripts/publishing/candidate.mjs";
import { fileHash, sha256 } from "../scripts/publishing/common.mjs";
import { createManifest, verifyManifest } from "../scripts/publishing/manifest.mjs";
import { evaluateReleasePolicies } from "../scripts/publishing/policies.mjs";
import { registerReleaseCandidate, reserveReleaseIdentity } from "../scripts/publishing/release-registry.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";

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
    assert.throws(() => item.beta.prepare(), /matches every canonical chapter/);

    writeFileSync(item.stateFile, JSON.stringify(notionReceipt(item.book)));
    const prepared = item.beta.prepare();
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

    const approval = loadPublishApproval(item.root, publish.approval.id, finalCandidate);
    const manifest = createManifest(finalCandidate, approval, { releasePolicies: policies });
    assert.equal(verifyManifest(manifest, finalCandidate, approval, { releasePolicies: policies }), true);
    assert.equal(reserveReleaseIdentity(item.root, manifest), manifest.releaseId);
    assert.throws(
      () => reserveReleaseIdentity(item.root, manifest),
      /already consumed/,
      "the exact Publish approval and release identity are single-use",
    );
  } finally {
    item.dispose();
  }
});

test("a changed Beta snapshot rejects a stale human approval intent", async () => {
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
    item.beta.prepare();
    const staleRevision = item.lifecycle.status().gates.beta.materialRevision;

    writeFileSync(
      item.book.chapters[0].sourcePath,
      "# chapter-one\n\nAccepted editorial correction.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Decision | |\n",
    );
    writeFileSync(item.stateFile, JSON.stringify(notionReceipt(item.book)));
    item.beta.prepare();
    const stale = await item.lifecycle.approve({
      gate: "beta",
      expectedVersion: 1,
      expectedMaterialRevision: staleRevision,
      actor: HUMAN,
      explicitConfirmation: true,
    });
    assert.equal(stale.state, "stale");
    assert.equal(item.lifecycle.status().lifecycle.version, 1);
  } finally {
    item.dispose();
  }
});
