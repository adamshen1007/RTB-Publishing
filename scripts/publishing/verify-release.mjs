import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, stable } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { verifyManifest } from "./manifest.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { evaluateReleasePolicies } from "./policies.mjs";
export function verifyReleaseDirectory(directory, candidate, { manifest, approval, releasePolicies } = {}) {
  verifyCandidate(candidate); const expected = new Set(Object.values(candidate.artifacts).map((item) => item.path).concat(["candidate.json", "verification.json", candidate.snapshot.bundle.path])); if (manifest) expected.add("manifest.json");
  const actual = new Set(readdirSync(directory).filter((name) => !name.startsWith("."))); const extras = [...actual].filter((name) => !expected.has(name)), missing = [...expected].filter((name) => !actual.has(name)); if (extras.length || missing.length) throw new Error(`Release directory drift: extra=${extras.join(",")} missing=${missing.join(",")}`);
  for (const artifact of Object.values(candidate.artifacts)) { const file = resolve(directory, artifact.path); if (!existsSync(file) || fileHash(file) !== artifact.sha256) throw new Error(`Release artifact drift: ${basename(file)}`); }
  for (const record of candidate.snapshot.bundle.files) { const file = resolve(directory, candidate.snapshot.bundle.path, record.path); if (!existsSync(file) || fileHash(file) !== record.sha256) throw new Error(`Retained source snapshot drift: ${record.path}`); }
  const storedCandidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")); if (stable(storedCandidate) !== stable(candidate)) throw new Error("Stored candidate.json does not match the verified candidate.");
  const verification = JSON.parse(readFileSync(resolve(directory, "verification.json"), "utf8")); if (verification.sourceFingerprint !== candidate.sourceFingerprint || verification.status !== candidate.validators.status || stable(verification.artifacts) !== stable(candidate.artifacts) || stable(verification.semanticParity) !== stable(candidate.validators.semanticParity) || stable(verification.html) !== stable(candidate.validators.html) || stable(verification.epub) !== stable(candidate.validators.epub) || stable(verification.pdf) !== stable(candidate.validators.pdf)) throw new Error("Stored verification.json does not reproduce the candidate validator material.");
  if (manifest) verifyManifest(manifest, candidate, approval, { releasePolicies }); return true;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const directory = resolve(process.argv[2] ?? "dist/releases/rtb-yc-playbook"), candidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")), manifestFile = resolve(directory, "manifest.json"), manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null, approval = manifest?.approval, project = manifest ? resolveBookProject(process.argv[3]) : null, releasePolicies = project ? evaluateReleasePolicies(project, candidate) : null; if (project && project.id !== candidate.projectId) throw new Error("Release policy project does not match the stored candidate."); verifyReleaseDirectory(directory, candidate, { manifest, approval, releasePolicies }); console.log(`✓ Verified release directory ${directory}`); }
