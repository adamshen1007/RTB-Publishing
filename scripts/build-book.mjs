import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, resolve } from "node:path";
import { parse } from "yaml";
import { BOOK_DIR, BOOK_DIST_DIR, BOOK_OUTPUT_NAME, BUILD_DIR, ROOT, run } from "./lib.mjs";
import { renderMermaidBlocks } from "./mermaid.mjs";
import { verifyOutputs } from "./verify-outputs.mjs";
import { namespaceFootnotes } from "./book-contract.mjs";
import { assertLegacyBookBuildCompatibility } from "./books/compat.mjs";

const metadataFile = resolve(BOOK_DIR, "book.md");
assertLegacyBookBuildCompatibility(BOOK_DIR);
const chaptersDirectory = resolve(BOOK_DIR, "chapters");
const buildDirectory = resolve(BUILD_DIR, "books", "volume-01-yc-playbook");
const diagramsDirectory = resolve(buildDirectory, "diagrams");
const combinedFile = resolve(buildDirectory, "combined.md");
const parts = new Map([
  ["01", "Part I — Choose the Right Problem"],
  ["05", "Part II — Find Evidence Before Scale"],
  ["09", "Part III — Build the Smallest Useful Product"],
  ["13", "Part IV — Earn Early Traction"],
  ["17", "Part V — Operate the Company"],
  ["21", "Part VI — Put the System into Practice"]
]);

function parseMetadata(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error("book.md must begin with YAML front matter.");
  const metadata = parse(frontmatter[1]);
  for (const field of ["title", "subtitle", "version", "status", "lang"]) {
    if (!metadata[field]) throw new Error(`book.md is missing required metadata: ${field}`);
  }
  return metadata;
}

const bookMarkdown = readFileSync(metadataFile, "utf8");
const metadata = parseMetadata(bookMarkdown);
const chapters = readdirSync(chaptersDirectory).filter((file) => file.endsWith(".md")).sort();
if (chapters.length === 0) throw new Error("No Markdown chapters found.");

rmSync(buildDirectory, { recursive: true, force: true });
rmSync(BOOK_DIST_DIR, { recursive: true, force: true });
mkdirSync(diagramsDirectory, { recursive: true });
mkdirSync(BOOK_DIST_DIR, { recursive: true });

const sections = [bookMarkdown.trim()];
let diagramCount = 0;
for (const chapter of chapters) {
  const part = parts.get(chapter.slice(0, 2));
  if (part) sections.push(`# ${part}`);
  const chapterMarkdown = namespaceFootnotes(readFileSync(resolve(chaptersDirectory, chapter), "utf8"), chapter.slice(0, 2));
  const rendered = renderMermaidBlocks(chapterMarkdown, chapter, diagramsDirectory, {
    replace: true,
    linkPrefix: "diagrams",
    format: "png",
  });
  sections.push(rendered.markdown.trim());
  diagramCount += rendered.count;
}
writeFileSync(combinedFile, `${sections.join("\n\n\\newpage\n\n")}\n`);

const resourcePath = [buildDirectory, BOOK_DIR, ROOT].join(delimiter);
const shared = [combinedFile, "--from=markdown+yaml_metadata_block", "--standalone", "--toc", `--resource-path=${resourcePath}`];

console.log("RTB Publishing Build\n");
console.log(`Input:  ${BOOK_DIR}`);
console.log(`Output: ${BOOK_DIST_DIR}\n`);
console.log(`✓ Metadata loaded for ${metadata.title}`);
console.log(`✓ ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} discovered`);
console.log(`✓ ${diagramCount} diagram${diagramCount === 1 ? "" : "s"} rendered`);

run("pandoc", [...shared, "--to=html5", "--embed-resources", `--css=${resolve(ROOT, "publishing", "styles.css")}`, "--output", resolve(BOOK_DIST_DIR, "index.html")]);
console.log("✓ HTML generated");
run("pandoc", [...shared, "--to=epub3", `--css=${resolve(ROOT, "publishing", "epub.css")}`, "--output", resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.epub`)]);
console.log("✓ EPUB generated");
run("pandoc", [...shared, "--to=docx", "--output", resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.docx`)]);
console.log("✓ DOCX generated");

for (const output of verifyOutputs()) console.log(`✓ ${basename(output.file)} verified (${output.size} bytes)`);
