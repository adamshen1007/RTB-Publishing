import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, resolve } from "node:path";
import { BUILD_DIR, DEFAULT_BOOK_PROJECT, DIST_DIR, ROOT, run } from "./lib.mjs";
import { assembleBook, projectOutputPath } from "./books/assemble.mjs";
import { discoverBookProject } from "./books/discovery.mjs";
import { verifyOutputs } from "./verify-outputs.mjs";

const project = discoverBookProject(process.argv[2] ?? DEFAULT_BOOK_PROJECT);
const buildDirectory = resolve(BUILD_DIR, "books", project.id);
const diagramsDirectory = resolve(buildDirectory, "diagrams");
const outputDirectory = resolve(DIST_DIR, "books", project.id);
const combinedFile = resolve(buildDirectory, "combined.md");

rmSync(buildDirectory, { recursive: true, force: true });
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(diagramsDirectory, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });
const assembled = assembleBook(project, { diagramsDirectory });
writeFileSync(combinedFile, assembled.markdown);

const html = projectOutputPath(project, resolve(DIST_DIR, "books"), "html");
const epub = projectOutputPath(project, resolve(DIST_DIR, "books"), "epub");
const resourcePath = [buildDirectory, project.root, ROOT].join(delimiter);
const shared = [combinedFile, "--from=markdown+yaml_metadata_block", "--standalone", "--toc", `--resource-path=${resourcePath}`];
console.log("RTB Publishing Build\n");
console.log(`Input:  ${project.root} (${project.authority})`);
console.log(`Output: ${outputDirectory}\n`);
console.log(`✓ Metadata loaded for ${project.manifest.id}`);
console.log(`✓ ${project.chapters.length} chapters and ${project.parts.length} parts discovered`);
console.log(`✓ ${assembled.diagramCount} diagrams rendered`);
run("pandoc", [...shared, "--to=html5", "--embed-resources", `--css=${resolve(ROOT, "publishing", "styles.css")}`, "--output", html]);
console.log("✓ HTML generated");
run("pandoc", [...shared, "--to=epub3", `--css=${resolve(ROOT, "publishing", "epub.css")}`, "--output", epub]);
console.log("✓ EPUB generated");
for (const output of verifyOutputs(project, { outputRoot: resolve(DIST_DIR, "books") })) console.log(`✓ ${basename(output.file)} verified (${output.size} bytes)`);
