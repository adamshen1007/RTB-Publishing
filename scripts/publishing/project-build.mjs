import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_DIR, DIST_DIR, ROOT } from "../lib.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { createCandidate } from "./candidate.mjs";
import { renderEpub } from "./epub.mjs";
import { renderHtml } from "./html.mjs";
import { pdfTools, renderPdf } from "./pdf.mjs";
import { prepareSnapshot, verifySnapshot } from "./snapshot.mjs";
import { verifyFormats } from "./verify.mjs";
import { verifyReleaseDirectory, verifyReleaseDirectoryMaterial } from "./verify-release.mjs";
import { registerReleaseCandidate } from "./release-registry.mjs";
import { finalizeRelease, promoteFinalizedRelease } from "./finalize-release.mjs";
import { evaluateReleasePolicies, pendingReleasePolicies } from "./policies.mjs";
import { writeJson } from "./common.mjs";
import { fileHashChunked } from "./common.mjs";
import { streamResourceFixture } from "./resource-proof.mjs";
import { acquireProjectLock, acquireWorkspaceOutputLock } from "../state/project-lock.mjs";
import { promotionMarkers, recoverPromotion } from "./promotion-state.mjs";
export { beginPromotion, commitPromotion, markPromotionLedgerCompleted, markPromotionMaterialVerified, promotionContext, promotionMarkers, recoverPromotion, rollbackPromotion } from "./promotion-state.mjs";

function argumentsOf(values) { const result = { project: null, lifecycleVersion: 0, approvalId: null, resourceFixture: null, resourceReport: null }; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value === "--lifecycle-version") result.lifecycleVersion = Number(values[++index]); else if (value === "--approval-id") result.approvalId = values[++index]; else if (value === "--resource-fixture") result.resourceFixture = resolve(values[++index]); else if (value === "--resource-report") result.resourceReport = resolve(values[++index]); else if (!result.project) result.project = value; else throw new Error(`Unknown publishing argument: ${value}`); } if (!Number.isInteger(result.lifecycleVersion) || result.lifecycleVersion < 0) throw new Error("--lifecycle-version must be a non-negative integer."); if (Boolean(result.resourceFixture) !== Boolean(result.resourceReport)) throw new Error("--resource-fixture and --resource-report must be provided together."); return result; }
const filenameFor = (project, format) => basename(project.outputProfiles.find((profile) => profile.format === format)?.path ?? `${project.id}.${format}`);
function retainSnapshot(snapshot, release) { const target = resolve(release, "source-snapshot"), files = [...snapshot.record.files, { path: "snapshot.json" }]; for (const record of files) { const source = resolve(snapshot.root, record.path), destination = resolve(target, record.path); mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination); } return { path: "source-snapshot", files: files.map(({ path }) => ({ path, sha256: fileHashChunked(resolve(target, path)), bytes: statSync(resolve(target, path)).size })) }; }
const defaultOrchestration = { pdfTools, prepareSnapshot, renderHtml, renderEpub, renderPdf, verifySnapshot, verifyFormats };
export async function buildRelease(project, { lifecycleVersion = 0, approvalId = null, resourceFixture = null, resourceReport = null, buildRoot = resolve(BUILD_DIR, "publishing"), candidateRoot = resolve(DIST_DIR, "candidates"), releaseRoot = resolve(DIST_DIR, "releases"), workspaceRoot = project.workspaceRoot ?? ROOT, env = process.env, orchestration = {}, hooks = {} } = {}) {
  const pipeline = { ...defaultOrchestration, ...orchestration };
  for (const name of Object.keys(defaultOrchestration)) if (typeof pipeline[name] !== "function") throw new Error(`Publishing orchestration requires ${name}.`);
  for (const format of ["html", "pdf", "epub"]) if (!project.outputProfiles.some((profile) => profile.format === format)) throw new Error(`Book Project ${project.id} must declare ${format.toUpperCase()} output for a release candidate.`);
  const workspaceLock = await acquireWorkspaceOutputLock(workspaceRoot, { ownerId: `release-build-output-${process.pid}` });
  let publicationLock;
  const token = randomUUID(), work = resolve(buildRoot, ".staging", `${project.id}-${token}`), namespaceRoot = approvalId ? resolve(releaseRoot, "immutable") : candidateRoot, staging = resolve(namespaceRoot, ".staging", `${project.id}-${token}`), legacyRelease = resolve(releaseRoot, project.id);
  let promotionInput = null;
  try {
    publicationLock = await acquireProjectLock(project.legacyRoot, { ownerId: `release-build-${process.pid}` });
    mkdirSync(work, { recursive: true }); mkdirSync(staging, { recursive: true });
    const tools = pipeline.pdfTools(env), snapshot = pipeline.prepareSnapshot(project, resolve(work, "snapshot"), { tools }), resourceProof = resourceFixture ? await streamResourceFixture(resourceFixture) : null;
    const stagedOutputs = { html: resolve(staging, filenameFor(project, "html")), pdf: resolve(staging, filenameFor(project, "pdf")), epub: resolve(staging, filenameFor(project, "epub")) };
    pipeline.renderHtml(snapshot, stagedOutputs.html); pipeline.renderEpub(snapshot, stagedOutputs.epub); const pdf = pipeline.renderPdf(snapshot, stagedOutputs.pdf, { env, tools }); pipeline.verifySnapshot(project, snapshot, tools);
    const verification = await pipeline.verifyFormats({ project, snapshotMarkdown: snapshot.markdown, outputs: stagedOutputs, pdfTools: pdf.tools, pdfDerived: pdf.derived, sourceFingerprint: snapshot.record.sourceFingerprint, env }); writeJson(resolve(staging, "verification.json"), verification);
    const policies = pendingReleasePolicies(), bundle = retainSnapshot(snapshot, staging);
    const candidate = createCandidate({ projectId: project.id, lifecycleVersion, sourceFingerprint: snapshot.record.sourceFingerprint, snapshot: { authority: snapshot.record.authority, canonicalSnapshotHash: snapshot.record.canonicalSnapshotHash, repository: snapshot.record.materials.repository, files: snapshot.record.files, materials: snapshot.record.materials, bundle, ...(resourceProof ? { resourceProof } : {}) }, verification, policies }); writeJson(resolve(staging, "candidate.json"), candidate); registerReleaseCandidate(project.legacyRoot, candidate);
    let releasePolicies = evaluateReleasePolicies(project, candidate);
    let manifest = null;
    if (approvalId) { const finalized = await finalizeRelease({ root: project.legacyRoot, workspaceRoot, project, candidateHash: candidate.candidateHash, approvalId, releaseDirectory: staging, legacyReleaseDirectory: legacyRelease, heldWorkspaceLock: workspaceLock, heldLock: publicationLock }); manifest = finalized.manifest; releasePolicies = evaluateReleasePolicies(project, candidate); }
    verifyReleaseDirectoryMaterial(staging, candidate, { manifest });
    let publishedDirectory = null, candidateDirectory = null;
    if (!manifest) {
      candidateDirectory = resolve(candidateRoot, project.id, candidate.candidateHash);
      if (existsSync(candidateDirectory)) { verifyReleaseDirectory(candidateDirectory, candidate); rmSync(staging, { recursive: true, force: true }); }
      else { mkdirSync(dirname(candidateDirectory), { recursive: true }); renameSync(staging, candidateDirectory); verifyReleaseDirectory(candidateDirectory, candidate); }
    } else {
      promotionInput = { outputRoot: resolve(releaseRoot, "immutable"), projectId: project.id, releaseId: manifest.releaseId, token };
      publishedDirectory = resolve(promotionInput.outputRoot, project.id, manifest.releaseId);
      publishedDirectory = await promoteFinalizedRelease({ root: project.legacyRoot, workspaceRoot, project, candidate, manifest, promotionInput, hooks, heldWorkspaceLock: workspaceLock, heldLock: publicationLock });
      rmSync(staging, { recursive: true, force: true });
    }
    const destination = publishedDirectory ?? candidateDirectory, outputs = Object.fromEntries(Object.entries(stagedOutputs).map(([format, file]) => [format, resolve(destination, basename(file))]));
    if (resourceReport) writeJson(resourceReport, resourceProof); return { project, snapshot, outputs, verification, candidate, releasePolicies, manifest, candidateDirectory, publishedDirectory, release: publishedDirectory };
  } catch (error) { if (promotionInput) for (const pending of promotionMarkers(promotionInput.outputRoot, project.id, promotionInput.releaseId)) { const recovered = recoverPromotion(pending); if (recovered.state === "rolled-back") await hooks.afterPromotionRollback?.({ release: pending.target, promotion: pending }); } rmSync(staging, { recursive: true, force: true }); throw error; }
  finally { publicationLock?.release(); workspaceLock.release(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const options = argumentsOf(process.argv.slice(2)), result = await buildRelease(resolveBookProject(options.project), { lifecycleVersion: options.lifecycleVersion, approvalId: options.approvalId, resourceFixture: options.resourceFixture, resourceReport: options.resourceReport, env: process.env }); console.log(`✓ Verified HTML, PDF, and EPUB candidate ${result.candidate.candidateHash}`); console.log(`✓ ${result.publishedDirectory ?? result.candidateDirectory}`); if (!result.manifest) console.log("! Candidate remains in dist/candidates: exact human Publish approval and named manual reviews are required before dist/releases can change."); }
