import { lstatSync } from "node:fs";
import { relative, resolve } from "node:path";

export const assertSafeCompatibilityOutput = ({ output, safeRoots }) => {
  if (!output || !output.startsWith("/")) throw new Error("--out must be an absolute path");
  const resolved = resolve(output);
  const safe = safeRoots.map((root) => resolve(root)).find((root) => relative(root, resolved) && !relative(root, resolved).startsWith(".."));
  if (!safe) throw new Error(`--out must be a strict child of a compatibility root: ${resolved}`);
  let current = resolved;
  while (current !== safe) {
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`--out may not traverse a symbolic link: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    current = resolve(current, "..");
  }
  return resolved;
};
