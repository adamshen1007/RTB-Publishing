import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { assertNoSymlinkPath, assertPinnedEntry, pinPhysicalEntry } from "../state/project-lock.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exactKeys(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function assertPrivateTree(directory) { for (const name of readdirSync(directory)) { const path = resolve(directory, name), entry = lstatSync(path); if (entry.isSymbolicLink()) throw new Error(`Current build generation contains a symbolic link: ${path}`); if (entry.isDirectory()) assertPrivateTree(path); else if (!entry.isFile() || entry.nlink !== 1) throw new Error(`Current build generation contains a non-private file: ${path}`); } }

export function resolveCurrentGeneration(project, { outputRoot }) {
  if (!existsSync(outputRoot)) throw new Error(`No current build generation exists for ${project.id}. Run pnpm build before previewing.`);
  const root = pinPhysicalEntry(outputRoot, "directory").path, pointer = resolve(root, ".current", `${project.id}.json`);
  if (!existsSync(pointer)) throw new Error(`No current build generation exists for ${project.id}. Run pnpm build before previewing.`);
  assertNoSymlinkPath(root, pointer, { allowMissing: false }); const pointerIdentity = pinPhysicalEntry(pointer, "file");
  let value;
  try { value = JSON.parse(readFileSync(pointer, "utf8")); } catch { throw new Error(`Current build generation pointer is invalid for ${project.id}. Run pnpm build again.`); }
  if (!exactKeys(value, ["schemaVersion", "projectId", "generation"]) || value.schemaVersion !== 1 || value.projectId !== project.id || !UUID.test(value.generation)) throw new Error(`Current build generation pointer is invalid for ${project.id}. Run pnpm build again.`);
  const generationRoot = resolve(root, ".generations", project.id, value.generation), expected = resolve(root, ".generations", project.id, value.generation);
  if (generationRoot !== expected || !existsSync(generationRoot)) throw new Error(`Current build generation is missing for ${project.id}. Run pnpm build again.`);
  assertNoSymlinkPath(root, generationRoot, { allowMissing: false }); const generationIdentity = pinPhysicalEntry(generationRoot, "directory"); assertPrivateTree(generationRoot); assertPinnedEntry(pointerIdentity, "file");
  const buildDirectory = resolve(generationRoot, "build"), outputDirectory = resolve(generationRoot, "output-root", project.id); pinPhysicalEntry(buildDirectory, "directory"); pinPhysicalEntry(outputDirectory, "directory");
  return { generation: value.generation, generationRoot, buildDirectory, outputDirectory, pointer, pointerIdentity, generationIdentity };
}
