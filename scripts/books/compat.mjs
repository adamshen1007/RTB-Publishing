import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateFile } from "./model.mjs";

/** Transitional bridge: legacy YC commands retain their current discovery and build behavior. */
export function validateLegacyBookProject(bookDirectory) {
  const projectFile = resolve(bookDirectory, "book.project.yaml");
  if (!existsSync(projectFile)) return { valid: true, diagnostics: [] };
  return validateFile(projectFile, { root: bookDirectory, recordType: "book-project", checkPaths: true });
}

export function throwForInvalidLegacyBookProject(bookDirectory) {
  const result = validateLegacyBookProject(bookDirectory);
  if (!result.valid) {
    throw new Error(result.diagnostics.map((item) => `problem: ${item.problem}; cause: ${item.cause}; repair: ${item.repair}`).join("\n"));
  }
  return result;
}

/** Build entry-point preflight kept separate so callers can assert compatibility without rendering. */
export function assertLegacyBookBuildCompatibility(bookDirectory) {
  return throwForInvalidLegacyBookProject(bookDirectory);
}
