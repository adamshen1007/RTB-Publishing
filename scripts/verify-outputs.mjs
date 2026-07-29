import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bookMetadata } from "./book-contract.mjs";
import { projectOutputPath } from "./books/assemble.mjs";
import { resolveBookProject } from "./books/discovery.mjs";
import { DIST_DIR } from "./lib.mjs";

function escaped(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const normalizeText = (value) => value.replace(/<[^>]+>/g, " ").replace(/&(?:mdash|#8212);/g, "—").replace(/\s+/g, " ").trim();

/** Verify rendered chapter headings and their generated anchors without assuming Blueprint display titles. */
export function verifyHtmlChapterAnchors(html, chapters) {
  const headings = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)].map((match) => ({ id: match[1].match(/\bid="([^"]+)"/i)?.[1], title: normalizeText(match[2]) }));
  const expectedTitles = new Map(chapters.map((chapter) => [chapter.id, readFileSync(chapter.sourcePath, "utf8").match(/^#\s+(.+)$/m)?.[1]?.trim()]));
  const chapterHeadings = headings.filter((heading) => [...expectedTitles.values()].includes(heading.title));
  const ids = new Set(); const failures = [];
  for (const heading of chapterHeadings) {
    if (!heading.id) failures.push(`HTML H1 is missing an anchor: ${heading.title}`);
    else if (ids.has(heading.id)) failures.push(`HTML chapter anchor is duplicated: ${heading.id}`);
    else ids.add(heading.id);
  }
  for (const chapter of chapters) {
    const title = expectedTitles.get(chapter.id);
    if (!title) { failures.push(`${chapter.id}: canonical source has no H1 chapter heading`); continue; }
    const heading = headings.find((item) => item.title === title);
    if (!heading?.id) failures.push(`${chapter.id}: rendered HTML lacks anchored canonical heading: ${title}`);
    else if (!new RegExp(`href="#${escaped(heading.id)}"`, "i").test(html)) failures.push(`${chapter.id}: chapter anchor is not navigable from HTML navigation`);
  }
  return failures;
}

export function verifyOutputs(project, { outputRoot = resolve(DIST_DIR, "books") } = {}) {
  const metadata = bookMetadata(project.metadata);
  const expected = project.outputProfiles.filter((profile) => ["html", "epub", "pdf"].includes(profile.format)).map((profile) => ({ file: projectOutputPath(project, outputRoot, profile.format), kind: profile.format === "html" ? "html" : profile.format === "epub" ? "zip" : "pdf", minimum: profile.format === "html" ? 1_000 : 2_000 }));
  const failures = [];
  for (const output of expected) {
    if (!existsSync(output.file)) { failures.push(`Missing output: ${output.file}`); continue; }
    const size = statSync(output.file).size;
    if (size < output.minimum) { failures.push(`${output.file} is unexpectedly small (${size} bytes).`); continue; }
    const content = readFileSync(output.file);
    if (output.kind === "zip" && content.subarray(0, 2).toString("ascii") !== "PK") failures.push(`${output.file} does not have a ZIP-compatible signature.`);
    if (output.kind === "pdf" && content.subarray(0, 5).toString("ascii") !== "%PDF-") failures.push(`${output.file} does not have a PDF signature.`);
    if (output.kind === "html") {
      const html = content.toString("utf8");
      if (!new RegExp(`<title>[^<]*${escaped(metadata.title)}[^<]*<\\/title>`, "i").test(html)) failures.push(`${output.file} does not contain the canonical document title.`);
      if (!new RegExp(escaped(metadata.version), "i").test(html) || !new RegExp(escaped(metadata.status), "i").test(html)) failures.push(`${output.file} does not display canonical metadata.`);
      failures.push(...verifyHtmlChapterAnchors(html, project.chapters).map((failure) => `${output.file}: ${failure}`));
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return expected.map((output) => ({ file: output.file, size: statSync(output.file).size }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { for (const output of verifyOutputs(resolveBookProject(process.argv[2]))) console.log(`✓ ${output.file} (${output.size} bytes)`); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
