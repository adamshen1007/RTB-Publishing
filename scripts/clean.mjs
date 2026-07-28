import { rmSync } from "node:fs";
import { BUILD_DIR, DIST_DIR, ROOT } from "./lib.mjs";
import { acquireWorkspaceOutputLock } from "./state/project-lock.mjs";

export async function cleanOutputs({ root = ROOT, buildDirectory = BUILD_DIR, distributionDirectory = DIST_DIR } = {}) {
  const lock = await acquireWorkspaceOutputLock(root, { ownerId: `clean-${process.pid}` });
  try { rmSync(buildDirectory, { recursive: true, force: true }); rmSync(distributionDirectory, { recursive: true, force: true }); }
  finally { lock.release(); }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await cleanOutputs();
  console.log("✓ Removed build/ and dist/.");
}
