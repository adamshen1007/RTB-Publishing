import { rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { BUILD_DIR, DIST_DIR, ROOT } from "./lib.mjs";
import { acquireWorkspaceOutputLock, assertNoSymlinkPath, pinPhysicalDirectory } from "./state/project-lock.mjs";

export async function cleanOutputs({ root = ROOT, buildDirectory = BUILD_DIR, distributionDirectory = DIST_DIR } = {}) {
  const logical = resolve(root), workspace = pinPhysicalDirectory(root).path, physicalize = (path) => { const value = relative(logical, resolve(path)); if (value === ".." || value.startsWith(`..${sep}`)) throw new Error("Clean output path escapes the workspace."); return resolve(workspace, value); }, build = physicalize(buildDirectory), distribution = physicalize(distributionDirectory), lock = await acquireWorkspaceOutputLock(workspace, { ownerId: `clean-${process.pid}` });
  try { assertNoSymlinkPath(workspace, build); assertNoSymlinkPath(workspace, distribution); rmSync(build, { recursive: true, force: true }); rmSync(distribution, { recursive: true, force: true }); }
  finally { lock.release(); }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await cleanOutputs();
  console.log("✓ Removed build/ and dist/.");
}
