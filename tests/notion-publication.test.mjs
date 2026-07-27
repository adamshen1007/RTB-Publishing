import assert from "node:assert/strict";
import test from "node:test";
import { publicationExport, sha256, validatePublicationExport, validateSyncState } from "../scripts/notion-publication.mjs";

test("Notion export covers every canonical chapter and worksheet", () => {
  const payload = publicationExport();
  assert.deepEqual(validatePublicationExport(payload), []);
  assert.equal(payload.chapters.length, 23);
  assert.equal(payload.chapters.filter((chapter) => chapter.worksheet.content.includes("|")).length, 23);
});

test("Notion pages retain traceable paths and hashes", () => {
  const payload = publicationExport();
  for (const chapter of payload.chapters) {
    assert.match(chapter.sourcePath, new RegExp(`/chapters/${chapter.number}-`));
    assert.equal(chapter.sourceHash.length, 64);
    assert.match(chapter.content, /Derived editorial copy/);
  }
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sync-state validation detects a stale or absent Notion copy", () => {
  const payload = publicationExport();
  const state = { chapters: Object.fromEntries(payload.chapters.map((chapter) => [chapter.number, { sourceHash: chapter.sourceHash }])) };
  assert.deepEqual(validateSyncState(payload, state), []);
  state.chapters["05"].sourceHash = "stale";
  delete state.chapters["23"];
  assert.deepEqual(validateSyncState(payload, state), ["05: Notion copy is stale", "23: no Notion sync record"]);
});
