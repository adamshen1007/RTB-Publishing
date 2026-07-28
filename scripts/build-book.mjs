import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, resolve } from "node:path";
import { BUILD_DIR, DIST_DIR, ROOT, run } from "./lib.mjs";
import { assembleBook, projectOutputPath } from "./books/assemble.mjs";
import { resolveBookProject } from "./books/discovery.mjs";
import { verifyOutputs } from "./verify-outputs.mjs";

export function outputDispatch(project) {
  return project.outputProfiles.map((profile) => {
    if (!["html", "epub", "pdf"].includes(profile.format)) throw new Error(`Unsupported declared output format: ${profile.format}.`);
    return profile;
  });
}
export function buildProject(project, { buildRoot = BUILD_DIR, outputRoot = resolve(DIST_DIR, "books") } = {}) {
  const buildDirectory = resolve(buildRoot, project.id); const diagramsDirectory = resolve(buildDirectory, "diagrams"); const outputDirectory = resolve(outputRoot, project.id); const combinedFile = resolve(buildDirectory, "combined.md");
  rmSync(buildDirectory, { recursive: true, force: true }); rmSync(outputDirectory, { recursive: true, force: true }); mkdirSync(diagramsDirectory, { recursive: true }); mkdirSync(outputDirectory, { recursive: true });
  const assembled = assembleBook(project, { diagramsDirectory }); writeFileSync(combinedFile, assembled.markdown);
  const shared = [combinedFile, "--from=markdown+yaml_metadata_block", "--standalone", "--toc", `--resource-path=${[buildDirectory, project.root, ROOT].join(delimiter)}`];
  for (const profile of outputDispatch(project)) {
    const output = projectOutputPath(project, outputRoot, profile.format);
    if (profile.format === "html") run("pandoc", [...shared, "--to=html5", "--embed-resources", `--css=${resolve(ROOT, "publishing", "styles.css")}`, "--output", output]);
    else if (profile.format === "epub") run("pandoc", [...shared, "--to=epub3", `--css=${resolve(ROOT, "publishing", "epub.css")}`, "--output", output]);
    else throw new Error(`Book Project ${project.id} declares PDF output ${profile.path}, but no generic PDF renderer capability is configured.`);
  }
  return { project, buildDirectory, outputDirectory, combinedFile, diagramCount: assembled.diagramCount, outputs: verifyOutputs(project, { outputRoot }) };
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const project = resolveBookProject(process.argv[2]); const result = buildProject(project);
  console.log(`✓ ${result.project.chapters.length} chapters and ${result.project.parts.length} parts discovered for ${result.project.id}.`);
  for (const output of result.outputs) console.log(`✓ ${basename(output.file)} verified (${output.size} bytes)`);
}
