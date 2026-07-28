import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_DIR, DIST_DIR } from "../lib.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { createCandidate } from "./candidate.mjs";
import { renderEpub } from "./epub.mjs";
import { renderHtml } from "./html.mjs";
import { createManifest } from "./manifest.mjs";
import { pdfTools, renderPdf } from "./pdf.mjs";
import { prepareSnapshot, verifySnapshot } from "./snapshot.mjs";
import { verifyFormats } from "./verify.mjs";
import { verifyReleaseDirectory } from "./verify-release.mjs";
import { registerReleaseCandidate, reserveReleaseIdentity } from "./release-registry.mjs";
import { loadPublishApproval } from "./approval-store.mjs";
import { evaluateReleasePolicies } from "./policies.mjs";
import { writeJson } from "./common.mjs";
import { fileHashChunked } from "./common.mjs";
import { streamResourceFixture } from "./resource-proof.mjs";

function argumentsOf(values) { const result = { project: null, lifecycleVersion: 0, approvalId: null, resourceFixture: null, resourceReport: null }; for (let index = 0; index < values.length; index += 1) { const value = values[index]; if (value === "--lifecycle-version") result.lifecycleVersion = Number(values[++index]); else if (value === "--approval-id") result.approvalId = values[++index]; else if (value === "--resource-fixture") result.resourceFixture = resolve(values[++index]); else if (value === "--resource-report") result.resourceReport = resolve(values[++index]); else if (!result.project) result.project = value; else throw new Error(`Unknown publishing argument: ${value}`); } if (!Number.isInteger(result.lifecycleVersion) || result.lifecycleVersion < 0) throw new Error("--lifecycle-version must be a non-negative integer."); if (Boolean(result.resourceFixture) !== Boolean(result.resourceReport)) throw new Error("--resource-fixture and --resource-report must be provided together."); return result; }
const filenameFor = (project, format) => basename(project.outputProfiles.find((profile) => profile.format === format)?.path ?? `${project.id}.${format}`);
function retainSnapshot(snapshot, release) { const target = resolve(release, "source-snapshot"), files = [...snapshot.record.files, { path: "snapshot.json" }]; for (const record of files) { const source = resolve(snapshot.root, record.path), destination = resolve(target, record.path); mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination); } return { path: "source-snapshot", files: files.map(({ path }) => ({ path, sha256: fileHashChunked(resolve(target, path)), bytes: statSync(resolve(target, path)).size })) }; }
export async function buildRelease(project, { lifecycleVersion = 0, approvalId = null, resourceFixture = null, resourceReport = null, buildRoot = resolve(BUILD_DIR, "releases"), outputRoot = resolve(DIST_DIR, "releases"), env = process.env } = {}) {
  for (const format of ["html", "pdf", "epub"]) if (!project.outputProfiles.some((profile) => profile.format === format)) throw new Error(`Book Project ${project.id} must declare ${format.toUpperCase()} output for a release candidate.`);
  const work = resolve(buildRoot, project.id), release = resolve(outputRoot, project.id); rmSync(work, { recursive: true, force: true }); rmSync(release, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); mkdirSync(release, { recursive: true });
  try {
    const tools = pdfTools(env), snapshot = prepareSnapshot(project, resolve(work, "snapshot"), { tools }), resourceProof = resourceFixture ? await streamResourceFixture(resourceFixture) : null;
    const outputs = { html: resolve(release, filenameFor(project, "html")), pdf: resolve(release, filenameFor(project, "pdf")), epub: resolve(release, filenameFor(project, "epub")) };
    renderHtml(snapshot, outputs.html); renderEpub(snapshot, outputs.epub); const pdf = renderPdf(snapshot, outputs.pdf, { env, tools }); verifySnapshot(project, snapshot, tools);
    const verification = await verifyFormats({ project, snapshotMarkdown: snapshot.markdown, outputs, pdfTools: pdf.tools, pdfDerived: pdf.derived, sourceFingerprint: snapshot.record.sourceFingerprint, env }); writeJson(resolve(release, "verification.json"), verification);
    const policies = evaluateReleasePolicies(project, { sourceFingerprint: snapshot.record.sourceFingerprint, artifacts: verification.artifacts }), bundle = retainSnapshot(snapshot, release);
    const candidate = createCandidate({ projectId: project.id, lifecycleVersion, sourceFingerprint: snapshot.record.sourceFingerprint, snapshot: { authority: snapshot.record.authority, canonicalSnapshotHash: snapshot.record.canonicalSnapshotHash, repository: snapshot.record.materials.repository, files: snapshot.record.files, materials: snapshot.record.materials, bundle, ...(resourceProof ? { resourceProof } : {}) }, verification, policies }); writeJson(resolve(release, "candidate.json"), candidate); registerReleaseCandidate(project.legacyRoot, candidate);
    let manifest = null, approval = null;
    if (approvalId) { approval = loadPublishApproval(project.legacyRoot, approvalId, candidate); manifest = createManifest(candidate, approval); reserveReleaseIdentity(project.legacyRoot, manifest); writeJson(resolve(release, "manifest.json"), manifest); }
    verifyReleaseDirectory(release, candidate, { manifest, approval }); if (resourceReport) writeJson(resourceReport, resourceProof); return { project, snapshot, outputs, verification, candidate, manifest, release };
  } catch (error) { rmSync(release, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const options = argumentsOf(process.argv.slice(2)), result = await buildRelease(resolveBookProject(options.project), { lifecycleVersion: options.lifecycleVersion, approvalId: options.approvalId, resourceFixture: options.resourceFixture, resourceReport: options.resourceReport, env: process.env }); console.log(`✓ Verified HTML, PDF, and EPUB candidate ${result.candidate.candidateHash}`); console.log(`✓ ${result.release}`); if (!result.manifest) console.log("! Final manifest not created: exact human Publish approval and named manual reviews remain required."); }
