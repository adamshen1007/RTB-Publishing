import { lstatSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const contains = (parent, child) => {
  const path = relative(parent, child);
  return path && !path.startsWith("..") && !path.includes(`..${process.platform === "win32" ? "\\" : "/"}`);
};
const rejectSymlinkAncestors = (path) => {
  let current = resolve(path);
  while (current !== dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error(`compatibility path may not traverse a symbolic link: ${current}`);
    current = dirname(current);
  }
};

export const assertTrustedCompatibilityRoot = ({ root, trustedParent }) => {
  rejectSymlinkAncestors(trustedParent);
  rejectSymlinkAncestors(root);
  const canonicalParent = realpathSync(trustedParent);
  const canonicalRoot = realpathSync(root);
  if (!contains(canonicalParent, canonicalRoot)) throw new Error("PDF_COMPATIBILITY_ROOT must be a strict child of PDF_TRUSTED_COMPATIBILITY_PARENT");
  return canonicalRoot;
};

export const assertSafeCompatibilityOutput = ({ output, safeRoots }) => {
  if (!output || !output.startsWith("/")) throw new Error("--out must be an absolute path");
  const resolved = resolve(output);
  const canonicalRoots = safeRoots.map((root) => {
    rejectSymlinkAncestors(root);
    return realpathSync(root);
  });
  const safe = canonicalRoots.find((root) => contains(root, resolved));
  if (!safe) throw new Error(`--out must be a strict child of a compatibility root: ${resolved}`);
  let current = resolved;
  while (true) {
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`--out may not traverse a symbolic link: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current === safe) break;
    current = resolve(current, "..");
  }
  return resolved;
};
