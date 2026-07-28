import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { materialHash } from "../scripts/publishing/common.mjs";

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-beta-preparation-"));
  mkdirSync(resolve(root, "chapters"), { recursive: true });
  const chapters = [
    { id: "chapter-one", order: 1, part_id: "part-one", reader_decision: "Decide one", required_output: "Output one", sourcePath: resolve(root, "chapters", "one.md") },
    { id: "chapter-two", order: 2, part_id: "part-one", reader_decision: "Decide two", required_output: "Output two", sourcePath: resolve(root, "chapters", "two.md") },
  ];
  for (const chapter of chapters) writeFileSync(chapter.sourcePath, `# ${chapter.id}\n\nCanonical text.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Test | |\n`);
  const book = { id: "fixture-book", root, legacyRoot: root, metadata: "---\ntitle: Fixture Book\nversion: 1.0.0\nstatus: draft\n---\n", manifest: { locale: "en", paths: {} }, chapters, parts: [{ id: "part-one", order: 1, title: "Start" }] };
  const stateFile = resolve(root, ".rtb-publishing", "notion", "sync-state.json"); mkdirSync(resolve(stateFile, ".."), { recursive: true });
  let registration;
  const service = new BetaPreparationService({ book, stateFile, actorResolver: () => ({ type: "human", id: "server-human-session" }), bindingProvider: { registerBeta: (input) => { registration = input; return { id: "BETA-fixture", bindings: input }; } } });
  return { root, book, stateFile, service, registration: () => registration, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("Beta preparation blocks clearly for missing and stale Notion receipts", () => {
  const item = fixture();
  try {
    assert.equal(item.service.inspect().code, "notion_receipt_missing");
    assert.throws(() => item.service.prepare(), /sync-state\.json is missing/);
    const payload = publicationExport(item.book);
    writeFileSync(item.stateFile, JSON.stringify({ chapters: { [payload.chapters[0].id]: { sourceHash: payload.chapters[0].sourceHash }, [payload.chapters[1].id]: { sourceHash: "stale" } } }));
    const stale = item.service.inspect();
    assert.equal(stale.code, "notion_receipt_stale");
    assert.deepEqual(stale.failures, ["02: Notion copy is stale"]);
    assert.throws(() => item.service.prepare(), /matches every canonical chapter/);
  } finally { item.dispose(); }
});

test("Beta preparation deterministically creates exact hashes and server-resolved reviewer identity", () => {
  const item = fixture();
  try {
    const payload = publicationExport(item.book);
    const chapters = Object.fromEntries(payload.chapters.map((chapter) => [chapter.id, { sourceHash: chapter.sourceHash, privatePageId: `private-${chapter.id}` }]));
    writeFileSync(item.stateFile, JSON.stringify({ chapters, privateWorkspaceId: "never-enters-beta-material" }));
    const first = item.service.inspect(), second = item.service.inspect();
    assert.equal(first.state, "ready"); assert.equal(first.chapterCount, 2);
    assert.equal(first.betaSnapshotHash, second.betaSnapshotHash); assert.equal(first.policyResultsHash, second.policyResultsHash);
    assert.equal(first.betaSnapshotHash, materialHash(first.snapshot)); assert.equal(first.policyResultsHash, materialHash(first.policies));
    assert.doesNotMatch(JSON.stringify(first.snapshot), /private-/);
    const result = item.service.prepare();
    assert.equal(result.state, "prepared");
    assert.deepEqual(item.registration(), { betaSnapshotHash: first.betaSnapshotHash, policyResultsHash: first.policyResultsHash, reviewerId: "server-human-session" });
  } finally { item.dispose(); }
});
