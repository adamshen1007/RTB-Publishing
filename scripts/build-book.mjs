import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, delimiter, dirname, relative, resolve, sep } from "node:path";
import { DIST_DIR, ROOT, run } from "./lib.mjs";
import { assembleBook, projectOutputPath } from "./books/assemble.mjs";
import { assertCurrentProjectIdentity, pinnedProjectCanonicalHash, resolveBookProject } from "./books/discovery.mjs";
import { verifyOutputs } from "./verify-outputs.mjs";
import { buildRelease } from "./publishing/project-build.mjs";
import { acquireProjectLockImmediate, acquireWorkspaceOutputLockImmediate, assertNoSymlinkPath, assertPinnedEntry, ensurePhysicalDirectory, pinPhysicalDirectory, pinPhysicalEntry } from "./state/project-lock.mjs";
export { buildRelease };
function syncPath(path, kind, hooks) { hooks.durability?.(`before-fsync-${kind}`, path); const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } hooks.durability?.(`after-fsync-${kind}`, path); }
function syncGenerationTree(root, hooks) { const directories = []; const walk = (directory) => { directories.push(directory); for (const name of readdirSync(directory).sort()) { const path = resolve(directory, name), entry = lstatSync(path); if (entry.isSymbolicLink()) throw new Error(`Generic build generation contains a symbolic link: ${path}`); if (entry.isDirectory()) walk(path); else if (entry.isFile() && entry.nlink === 1) syncPath(path, "file", hooks); else throw new Error(`Generic build generation contains a non-private file: ${path}`); } }; walk(root); for (const directory of directories.reverse()) syncPath(directory, "directory", hooks); }

export function outputDispatch(project) {
  return project.outputProfiles.map((profile) => {
    if (!["html", "epub", "pdf"].includes(profile.format)) throw new Error(`Unsupported declared output format: ${profile.format}.`);
    return profile;
  });
}
export function buildProject(project, { outputRoot = resolve(DIST_DIR, "books"), workspaceRoot = project.workspaceRoot ?? ROOT, hooks = {} } = {}) {
  const requested = project, logicalWorkspace = resolve(workspaceRoot), workspace = pinPhysicalDirectory(workspaceRoot).path;
  const physicalize = (path) => {
    const requestedPath = resolve(path), value = relative(logicalWorkspace, requestedPath);
    if (value !== ".." && !value.startsWith(`..${sep}`)) return resolve(workspace, value);
    let ancestor = requestedPath;
    while (!existsSync(ancestor)) { const parent = dirname(ancestor); if (parent === ancestor) throw new Error(`Cannot establish a physical output root for ${requestedPath}.`); ancestor = parent; }
    const authority = pinPhysicalDirectory(ancestor).path, physicalPath = resolve(authority, relative(ancestor, requestedPath));
    assertNoSymlinkPath(authority, physicalPath);
    return physicalPath;
  };
  const physicalOutputRoot = physicalize(outputRoot), workspaceLock = acquireWorkspaceOutputLockImmediate(workspace, { ownerId: `book-build-output-${process.pid}` });
  let lock;
  const token = randomUUID(); let buildDirectory, outputDirectory, stagingGeneration, stagingBuild, stagingOutputRoot, stagingOutput, readyGeneration, switched = false;
  try {
    assertNoSymlinkPath(workspace, requested.legacyRoot, { allowMissing: false }); lock = acquireProjectLockImmediate(requested.legacyRoot ?? ROOT, { ownerId: `book-build-${process.pid}` });
    project = resolveBookProject(requested.legacyRoot, { workspaceRoot: workspace }); if (pinnedProjectCanonicalHash(project) !== pinnedProjectCanonicalHash(requested)) throw new Error("Caller Book Project snapshot is stale; rediscover it and start a fresh build."); hooks.afterRediscovery?.({ project }); assertCurrentProjectIdentity(project);
    { let ancestor = physicalOutputRoot; while (!existsSync(ancestor)) ancestor = dirname(ancestor); ensurePhysicalDirectory(pinPhysicalDirectory(ancestor).path, physicalOutputRoot); }
    stagingGeneration = resolve(physicalOutputRoot, ".staging", `${project.id}-${token}`); stagingBuild = resolve(stagingGeneration, "build"); stagingOutputRoot = resolve(stagingGeneration, "output-root"); stagingOutput = resolve(stagingOutputRoot, project.id); ensurePhysicalDirectory(physicalOutputRoot, resolve(stagingBuild, "diagrams")); ensurePhysicalDirectory(physicalOutputRoot, stagingOutput);
    const combinedFile = resolve(stagingBuild, "combined.md"), assembled = assembleBook(project, { diagramsDirectory: resolve(stagingBuild, "diagrams") }); writeFileSync(combinedFile, assembled.markdown);
    const shared = [combinedFile, "--from=markdown+yaml_metadata_block", "--standalone", "--toc", `--resource-path=${[stagingBuild, project.root, ROOT].join(delimiter)}`];
    for (const profile of outputDispatch(project)) {
      const output = projectOutputPath(project, stagingOutputRoot, profile.format);
      if (profile.format === "html") run("pandoc", [...shared, "--to=html5", "--embed-resources", `--css=${resolve(ROOT, "publishing", "styles.css")}`, "--output", output]);
      else if (profile.format === "epub") run("pandoc", [...shared, "--to=epub3", `--css=${resolve(ROOT, "publishing", "epub.css")}`, "--output", output]);
      else throw new Error(`Book Project ${project.id} declares PDF output ${profile.path}, but no generic PDF renderer capability is configured.`);
    }
    hooks.afterRender?.({ project, buildDirectory: stagingBuild, outputDirectory: stagingOutput }); assertCurrentProjectIdentity(project); const outputs = verifyOutputs(project, { outputRoot: stagingOutputRoot });
    syncGenerationTree(stagingGeneration, hooks); readyGeneration = resolve(physicalOutputRoot, ".generations", project.id, token); ensurePhysicalDirectory(physicalOutputRoot, dirname(readyGeneration)); hooks.beforeGenerationReady?.({ project, generation: readyGeneration }); renameSync(stagingGeneration, readyGeneration); syncPath(dirname(readyGeneration), "generation-parent", hooks); hooks.afterGenerationReady?.({ project, generation: readyGeneration });
    buildDirectory = resolve(readyGeneration, "build"); outputDirectory = resolve(readyGeneration, "output-root", project.id); const currentDirectory = resolve(physicalOutputRoot, ".current"), current = resolve(currentDirectory, `${project.id}.json`); ensurePhysicalDirectory(physicalOutputRoot, currentDirectory); assertNoSymlinkPath(physicalOutputRoot, current); const pointerParent = pinPhysicalEntry(currentDirectory, "directory"), priorPointer = existsSync(current) ? pinPhysicalEntry(current, "file") : null;
    const temporary = `${current}.${token}.tmp`; writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, projectId: project.id, generation: token })}\n`, { mode: 0o600 }); syncPath(temporary, "pointer-file", hooks); const temporaryIdentity = pinPhysicalEntry(temporary, "file"); hooks.beforeGenerationSwitch?.({ project, generation: readyGeneration, pointer: current }); assertPinnedEntry(pointerParent, "directory"); assertPinnedEntry(temporaryIdentity, "file"); if (priorPointer) assertPinnedEntry(priorPointer, "file"); else if (existsSync(current)) throw new Error("Generic build generation pointer changed before atomic switch."); renameSync(temporary, current); switched = true; syncPath(current, "pointer-file", hooks); syncPath(currentDirectory, "pointer-parent", hooks); hooks.afterGenerationSwitch?.({ project, generation: readyGeneration, pointer: current });
    return { project, buildDirectory, outputDirectory, combinedFile: resolve(buildDirectory, "combined.md"), diagramCount: assembled.diagramCount, generation: token, generationPointer: current, outputs: outputs.map((item) => ({ ...item, file: resolve(outputDirectory, relative(stagingOutput, item.file)) })) };
  } catch (error) {
    if (stagingGeneration) rmSync(stagingGeneration, { recursive: true, force: true }); if (readyGeneration && !switched) rmSync(readyGeneration, { recursive: true, force: true });
    throw error;
  } finally { lock?.release(); workspaceLock.release(); }
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const project = resolveBookProject(process.argv[2]);
  if (project.outputProfiles.some((profile) => profile.format === "pdf")) { const result = await buildRelease(project); console.log(`✓ HTML, PDF, and EPUB candidate ${result.candidate.candidateHash}`); }
  else { const result = buildProject(project); console.log(`✓ ${result.project.chapters.length} chapters and ${result.project.parts.length} parts discovered for ${result.project.id}.`); for (const output of result.outputs) console.log(`✓ ${basename(output.file)} verified (${output.size} bytes)`); }
}
