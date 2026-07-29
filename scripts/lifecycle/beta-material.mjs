import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicationExport, validatePublicationExport, validateSyncState } from "../notion-publication.mjs";
import { materialHash } from "../publishing/common.mjs";

function normalizedSnapshot(payload, state) {
  return {
    schemaVersion: 1,
    projectId: payload.projectId,
    bookVersion: payload.version,
    status: payload.status,
    locale: payload.locale,
    chapters: payload.chapters.map((chapter) => {
      const receipt = state.chapters[chapter.id] ?? state.chapters[chapter.number];
      return {
        id: chapter.id,
        number: chapter.number,
        sourcePath: chapter.sourcePath,
        sourceHash: chapter.sourceHash,
        receiptSourceHash: receipt.sourceHash,
      };
    }),
  };
}

function policyResult(snapshot, betaSnapshotHash) {
  return {
    schemaVersion: 1,
    projectId: snapshot.projectId,
    betaSnapshotHash,
    status: "passed",
    rules: {
      canonicalChaptersDiscovered: snapshot.chapters.length,
      canonicalChaptersCurrentInNotion: snapshot.chapters.length,
      missingNotionCopies: 0,
      staleNotionCopies: 0,
    },
  };
}

/** Derive current Beta material from canonical Markdown and its private sync receipt. */
export function inspectBetaMaterial(book, stateFile = resolve(book.legacyRoot, ".rtb-publishing", "notion", "sync-state.json")) {
  const payload = publicationExport(book);
  const exportFailures = validatePublicationExport(payload);
  if (exportFailures.length) return { state: "blocked", code: "canonical_export_invalid", message: `Beta preparation is blocked because the canonical publication export is invalid: ${exportFailures.join("; ")}` };
  if (!existsSync(stateFile)) return { state: "blocked", code: "notion_receipt_missing", message: "Beta preparation is blocked because .rtb-publishing/notion/sync-state.json is missing. Sync every canonical chapter to the private Notion workspace, then try again." };

  let state;
  try { state = JSON.parse(readFileSync(stateFile, "utf8")); }
  catch (error) { return { state: "blocked", code: "notion_receipt_invalid", message: `Beta preparation is blocked because the Notion sync receipt is not valid JSON: ${error.message}` }; }
  if (!state || typeof state !== "object" || Array.isArray(state) || !state.chapters || typeof state.chapters !== "object" || Array.isArray(state.chapters)) return { state: "blocked", code: "notion_receipt_invalid", message: "Beta preparation is blocked because the Notion sync receipt has no chapter map. Re-run the private Notion sync for every canonical chapter." };

  const failures = validateSyncState(payload, state);
  if (failures.length) return { state: "blocked", code: "notion_receipt_stale", message: `Beta preparation is blocked until the private Notion copy matches every canonical chapter: ${failures.join("; ")}`, failures };
  const snapshot = normalizedSnapshot(payload, state);
  const betaSnapshotHash = materialHash(snapshot);
  const policies = policyResult(snapshot, betaSnapshotHash);
  return { state: "ready", code: "ready", message: `${snapshot.chapters.length} canonical chapters have a complete, current private Notion sync receipt.`, chapterCount: snapshot.chapters.length, betaSnapshotHash, policyResultsHash: materialHash(policies), snapshot, policies };
}
