import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_DIR, DIST_DIR, ROOT } from "../lib.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { createCandidate } from "./candidate.mjs";
import { renderEpub } from "./epub.mjs";
import { renderHtml } from "./html.mjs";
import { pdfTools, renderPdf } from "./pdf.mjs";
import { prepareSnapshot, verifySnapshot } from "./snapshot.mjs";
import { verifyFormats } from "./verify.mjs";
import { verifyReleaseDirectory } from "./verify-release.mjs";
import { registerReleaseCandidate } from "./release-registry.mjs";
import { finalizeRelease } from "./finalize-release.mjs";
import { evaluateReleasePolicies, pendingReleasePolicies } from "./policies.mjs";
import { writeJson, writeJsonAtomic } from "./common.mjs";
import { fileHashChunked } from "./common.mjs";
import { streamResourceFixture } from "./resource-proof.mjs";
import { acquireProjectLock, acquireWorkspaceOutputLock } from "../state/project-lock.mjs";

function argumentsOf(values) { const result = { project: null, lifecycleVersion: 0, approvalId: null, resourceFixture: null, resourceReport: null }; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value === "--lifecycle-version") result.lifecycleVersion = Number(values[++index]); else if (value === "--approval-id") result.approvalId = values[++index]; else if (value === "--resource-fixture") result.resourceFixture = resolve(values[++index]); else if (value === "--resource-report") result.resourceReport = resolve(values[++index]); else if (!result.project) result.project = value; else throw new Error(`Unknown publishing argument: ${value}`); } if (!Number.isInteger(result.lifecycleVersion) || result.lifecycleVersion < 0) throw new Error("--lifecycle-version must be a non-negative integer."); if (Boolean(result.resourceFixture) !== Boolean(result.resourceReport)) throw new Error("--resource-fixture and --resource-report must be provided together."); return result; }
const filenameFor = (project, format) => basename(project.outputProfiles.find((profile) => profile.format === format)?.path ?? `${project.id}.${format}`);
function retainSnapshot(snapshot, release) { const target = resolve(release, "source-snapshot"), files = [...snapshot.record.files, { path: "snapshot.json" }]; for (const record of files) { const source = resolve(snapshot.root, record.path), destination = resolve(target, record.path); mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination); } return { path: "source-snapshot", files: files.map(({ path }) => ({ path, sha256: fileHashChunked(resolve(target, path)), bytes: statSync(resolve(target, path)).size })) }; }
const promotionPaths = (release, outputRoot) => ({ backup: resolve(outputRoot, ".staging", `${basename(release)}.previous`), marker: resolve(outputRoot, ".staging", `${basename(release)}.promotion.json`) });
function recordPromotion(transaction, phase) { transaction.phase = phase; writeJsonAtomic(transaction.marker, { schemaVersion: 1, token: transaction.token, phase, staging: transaction.staging, release: transaction.release, backup: transaction.backup }); }
export function recoverPromotion(release, outputRoot) {
  const { backup, marker } = promotionPaths(release, outputRoot);
  if (!existsSync(marker)) { if (existsSync(backup) && !existsSync(release)) renameSync(backup, release); return; }
  const state = JSON.parse(readFileSync(marker, "utf8"));
  const stagingRoot = `${resolve(outputRoot, ".staging")}${sep}`;
  if (state.release !== release || state.backup !== backup || typeof state.staging !== "string" || !resolve(state.staging).startsWith(stagingRoot)) throw new Error("Release promotion recovery marker does not match the exact safe output paths.");
  if (state.phase === "verified") { rmSync(backup, { recursive: true, force: true }); rmSync(marker, { force: true }); return; }
  if (state.phase === "new-moved" && existsSync(release)) rmSync(release, { recursive: true, force: true });
  if (existsSync(backup) && !existsSync(release)) renameSync(backup, release);
  if (state.staging !== release) rmSync(state.staging, { recursive: true, force: true });
  rmSync(marker, { force: true });
}
export function beginPromotion(staging, release, outputRoot, token = randomUUID()) {
  recoverPromotion(release, outputRoot);
  const transaction = { token, staging, release, ...promotionPaths(release, outputRoot) };
  recordPromotion(transaction, "prepared");
  if (existsSync(release)) renameSync(release, transaction.backup);
  recordPromotion(transaction, "prior-moved");
  try { renameSync(staging, release); recordPromotion(transaction, "new-moved"); return transaction; }
  catch (error) { if (!existsSync(release) && existsSync(transaction.backup)) renameSync(transaction.backup, release); rmSync(transaction.marker, { force: true }); throw error; }
}
export function completePromotion(transaction) { recordPromotion(transaction, "verified"); rmSync(transaction.backup, { recursive: true, force: true }); rmSync(transaction.marker, { force: true }); }
export function rollbackPromotion(transaction) { if (existsSync(transaction.release)) rmSync(transaction.release, { recursive: true, force: true }); if (existsSync(transaction.backup)) renameSync(transaction.backup, transaction.release); rmSync(transaction.staging, { recursive: true, force: true }); rmSync(transaction.marker, { force: true }); }

const defaultOrchestration = { pdfTools, prepareSnapshot, renderHtml, renderEpub, renderPdf, verifySnapshot, verifyFormats };
export async function buildRelease(project, { lifecycleVersion = 0, approvalId = null, resourceFixture = null, resourceReport = null, buildRoot = resolve(BUILD_DIR, "releases"), outputRoot = resolve(DIST_DIR, "releases"), workspaceRoot = project.workspaceRoot ?? ROOT, env = process.env, orchestration = {}, hooks = {} } = {}) {
  const pipeline = { ...defaultOrchestration, ...orchestration };
  for (const name of Object.keys(defaultOrchestration)) if (typeof pipeline[name] !== "function") throw new Error(`Publishing orchestration requires ${name}.`);
  for (const format of ["html", "pdf", "epub"]) if (!project.outputProfiles.some((profile) => profile.format === format)) throw new Error(`Book Project ${project.id} must declare ${format.toUpperCase()} output for a release candidate.`);
  const workspaceLock = await acquireWorkspaceOutputLock(workspaceRoot, { ownerId: `release-build-output-${process.pid}` });
  let publicationLock;
  const token = randomUUID(), work = resolve(buildRoot, ".staging", `${project.id}-${token}`), release = resolve(outputRoot, project.id), staging = resolve(outputRoot, ".staging", `${project.id}-${token}`);
  let promotion = null;
  try {
    publicationLock = await acquireProjectLock(project.legacyRoot, { ownerId: `release-build-${process.pid}` });
    recoverPromotion(release, outputRoot);
    mkdirSync(work, { recursive: true }); mkdirSync(staging, { recursive: true });
    const tools = pipeline.pdfTools(env), snapshot = pipeline.prepareSnapshot(project, resolve(work, "snapshot"), { tools }), resourceProof = resourceFixture ? await streamResourceFixture(resourceFixture) : null;
    const stagedOutputs = { html: resolve(staging, filenameFor(project, "html")), pdf: resolve(staging, filenameFor(project, "pdf")), epub: resolve(staging, filenameFor(project, "epub")) };
    pipeline.renderHtml(snapshot, stagedOutputs.html); pipeline.renderEpub(snapshot, stagedOutputs.epub); const pdf = pipeline.renderPdf(snapshot, stagedOutputs.pdf, { env, tools }); pipeline.verifySnapshot(project, snapshot, tools);
    const verification = await pipeline.verifyFormats({ project, snapshotMarkdown: snapshot.markdown, outputs: stagedOutputs, pdfTools: pdf.tools, pdfDerived: pdf.derived, sourceFingerprint: snapshot.record.sourceFingerprint, env }); writeJson(resolve(staging, "verification.json"), verification);
    const policies = pendingReleasePolicies(), bundle = retainSnapshot(snapshot, staging);
    const candidate = createCandidate({ projectId: project.id, lifecycleVersion, sourceFingerprint: snapshot.record.sourceFingerprint, snapshot: { authority: snapshot.record.authority, canonicalSnapshotHash: snapshot.record.canonicalSnapshotHash, repository: snapshot.record.materials.repository, files: snapshot.record.files, materials: snapshot.record.materials, bundle, ...(resourceProof ? { resourceProof } : {}) }, verification, policies }); writeJson(resolve(staging, "candidate.json"), candidate); registerReleaseCandidate(project.legacyRoot, candidate);
    let releasePolicies = evaluateReleasePolicies(project, candidate);
    let manifest = null;
    if (approvalId) { const finalized = await finalizeRelease({ root: project.legacyRoot, workspaceRoot, project, candidateHash: candidate.candidateHash, approvalId, releaseDirectory: staging, legacyReleaseDirectory: release, heldWorkspaceLock: workspaceLock, heldLock: publicationLock }); manifest = finalized.manifest; releasePolicies = evaluateReleasePolicies(project, candidate); }
    verifyReleaseDirectory(staging, candidate, { manifest, root: project.legacyRoot, heldLock: publicationLock });
    promotion = beginPromotion(staging, release, outputRoot, token);
    await hooks.afterPromotionRename?.({ release, staging, promotion });
    const outputs = Object.fromEntries(Object.entries(stagedOutputs).map(([format, file]) => [format, resolve(release, basename(file))]));
    verifyReleaseDirectory(release, candidate, { manifest, root: project.legacyRoot, heldLock: publicationLock });
    completePromotion(promotion); promotion = null;
    if (resourceReport) writeJson(resourceReport, resourceProof); return { project, snapshot, outputs, verification, candidate, releasePolicies, manifest, release };
  } catch (error) { if (promotion) { rollbackPromotion(promotion); await hooks.afterPromotionRollback?.({ release, promotion }); } rmSync(staging, { recursive: true, force: true }); throw error; }
  finally { publicationLock?.release(); workspaceLock.release(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const options = argumentsOf(process.argv.slice(2)), result = await buildRelease(resolveBookProject(options.project), { lifecycleVersion: options.lifecycleVersion, approvalId: options.approvalId, resourceFixture: options.resourceFixture, resourceReport: options.resourceReport, env: process.env }); console.log(`✓ Verified HTML, PDF, and EPUB candidate ${result.candidate.candidateHash}`); console.log(`✓ ${result.release}`); if (!result.manifest) console.log("! Final manifest not created: exact human Publish approval and named manual reviews remain required."); }
