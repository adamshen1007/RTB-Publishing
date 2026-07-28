import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, delimiter, dirname, relative, resolve, sep } from "node:path";
import { BUILD_DIR, DIST_DIR, ROOT, run } from "./lib.mjs";
import { assembleBook, projectOutputPath } from "./books/assemble.mjs";
import { assertCurrentProjectIdentity, projectCanonicalIdentity, resolveBookProject } from "./books/discovery.mjs";
import { verifyOutputs } from "./verify-outputs.mjs";
import { buildRelease } from "./publishing/project-build.mjs";
import { acquireProjectLockImmediate, acquireWorkspaceOutputLockImmediate, assertNoSymlinkPath, ensurePhysicalDirectory, pinPhysicalDirectory } from "./state/project-lock.mjs";
export { buildRelease };

export function outputDispatch(project) {
  return project.outputProfiles.map((profile) => {
    if (!["html", "epub", "pdf"].includes(profile.format)) throw new Error(`Unsupported declared output format: ${profile.format}.`);
    return profile;
  });
}
export function buildProject(project, { buildRoot = BUILD_DIR, outputRoot = resolve(DIST_DIR, "books"), workspaceRoot = project.workspaceRoot ?? ROOT, hooks = {} } = {}) {
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
  const physicalBuildRoot = physicalize(buildRoot), physicalOutputRoot = physicalize(outputRoot), workspaceLock = acquireWorkspaceOutputLockImmediate(workspace, { ownerId: `book-build-output-${process.pid}` });
  let lock;
  const token = randomUUID(); let buildDirectory, outputDirectory, stagingBuild, stagingOutput;
  try {
    assertNoSymlinkPath(workspace, requested.legacyRoot, { allowMissing: false }); lock = acquireProjectLockImmediate(requested.legacyRoot ?? ROOT, { ownerId: `book-build-${process.pid}` });
    project = resolveBookProject(requested.legacyRoot, { workspaceRoot: workspace }); if (projectCanonicalIdentity(project).materialHash !== projectCanonicalIdentity(requested).materialHash) throw new Error("Caller Book Project snapshot is stale; rediscover it and start a fresh build."); hooks.afterRediscovery?.({ project }); assertCurrentProjectIdentity(project);
    for (const root of [physicalBuildRoot, physicalOutputRoot]) { let ancestor = root; while (!existsSync(ancestor)) ancestor = dirname(ancestor); ensurePhysicalDirectory(pinPhysicalDirectory(ancestor).path, root); }
    buildDirectory = resolve(physicalBuildRoot, project.id); outputDirectory = resolve(physicalOutputRoot, project.id); stagingBuild = resolve(physicalBuildRoot, ".staging", `${project.id}-${token}`); const stagingRoot = resolve(physicalOutputRoot, ".staging", token); stagingOutput = resolve(stagingRoot, project.id); ensurePhysicalDirectory(physicalBuildRoot, resolve(stagingBuild, "diagrams")); ensurePhysicalDirectory(physicalOutputRoot, stagingOutput);
    const combinedFile = resolve(stagingBuild, "combined.md"), assembled = assembleBook(project, { diagramsDirectory: resolve(stagingBuild, "diagrams") }); writeFileSync(combinedFile, assembled.markdown);
    const shared = [combinedFile, "--from=markdown+yaml_metadata_block", "--standalone", "--toc", `--resource-path=${[stagingBuild, project.root, ROOT].join(delimiter)}`];
    for (const profile of outputDispatch(project)) {
      const output = projectOutputPath(project, stagingRoot, profile.format);
      if (profile.format === "html") run("pandoc", [...shared, "--to=html5", "--embed-resources", `--css=${resolve(ROOT, "publishing", "styles.css")}`, "--output", output]);
      else if (profile.format === "epub") run("pandoc", [...shared, "--to=epub3", `--css=${resolve(ROOT, "publishing", "epub.css")}`, "--output", output]);
      else throw new Error(`Book Project ${project.id} declares PDF output ${profile.path}, but no generic PDF renderer capability is configured.`);
    }
    hooks.afterRender?.({ project, buildDirectory: stagingBuild, outputDirectory: stagingOutput }); assertCurrentProjectIdentity(project); const outputs = verifyOutputs(project, { outputRoot: stagingRoot });
    for (const [root, target] of [[physicalBuildRoot, buildDirectory], [physicalOutputRoot, outputDirectory]]) { assertNoSymlinkPath(root, target); if (existsSync(target)) rmSync(target, { recursive: true, force: true }); }
    ensurePhysicalDirectory(physicalBuildRoot, resolve(buildDirectory, "..")); ensurePhysicalDirectory(physicalOutputRoot, resolve(outputDirectory, "..")); renameSync(stagingBuild, buildDirectory); renameSync(stagingOutput, outputDirectory); rmSync(stagingRoot, { recursive: true, force: true });
    return { project, buildDirectory, outputDirectory, combinedFile: resolve(buildDirectory, "combined.md"), diagramCount: assembled.diagramCount, outputs: outputs.map((item) => ({ ...item, file: resolve(outputDirectory, basename(item.file)) })) };
  } catch (error) {
    if (stagingBuild) rmSync(stagingBuild, { recursive: true, force: true }); if (stagingOutput) rmSync(resolve(stagingOutput, ".."), { recursive: true, force: true });
    throw error;
  } finally { lock?.release(); workspaceLock.release(); }
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const project = resolveBookProject(process.argv[2]);
  if (project.outputProfiles.some((profile) => profile.format === "pdf")) { const result = await buildRelease(project); console.log(`✓ HTML, PDF, and EPUB candidate ${result.candidate.candidateHash}`); }
  else { const result = buildProject(project); console.log(`✓ ${result.project.chapters.length} chapters and ${result.project.parts.length} parts discovered for ${result.project.id}.`); for (const output of result.outputs) console.log(`✓ ${basename(output.file)} verified (${output.size} bytes)`); }
}
