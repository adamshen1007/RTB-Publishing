import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bookMetadata } from "./book-contract.mjs";
import { projectOutputPath } from "./books/assemble.mjs";
import { discoverBookProject } from "./books/discovery.mjs";
import { DEFAULT_BOOK_PROJECT, DIST_DIR } from "./lib.mjs";

function escaped(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function verifyOutputs(project, { outputRoot = resolve(DIST_DIR, "books") } = {}) {
  const metadata = bookMetadata(project.metadata);
  const expected = project.outputProfiles.filter((profile) => ["html", "epub"].includes(profile.format)).map((profile) => ({ file: projectOutputPath(project, outputRoot, profile.format), kind: profile.format === "html" ? "html" : "zip", minimum: profile.format === "html" ? 1_000 : 2_000 }));
  const failures = [];
  for (const output of expected) {
    if (!existsSync(output.file)) { failures.push(`Missing output: ${output.file}`); continue; }
    const size = statSync(output.file).size;
    if (size < output.minimum) { failures.push(`${output.file} is unexpectedly small (${size} bytes).`); continue; }
    const content = readFileSync(output.file);
    if (output.kind === "zip" && content.subarray(0, 2).toString("ascii") !== "PK") failures.push(`${output.file} does not have a ZIP-compatible signature.`);
    if (output.kind === "html") {
      const html = content.toString("utf8");
      if (!new RegExp(`<title>[^<]*${escaped(metadata.title)}[^<]*<\\/title>`, "i").test(html)) failures.push(`${output.file} does not contain the canonical document title.`);
      if (!new RegExp(escaped(metadata.version), "i").test(html) || !new RegExp(escaped(metadata.status), "i").test(html)) failures.push(`${output.file} does not display canonical metadata.`);
      for (const chapter of project.chapters) if (!html.includes(chapter.title)) failures.push(`${output.file} does not contain declared chapter ${chapter.id}.`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return expected.map((output) => ({ file: output.file, size: statSync(output.file).size }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { for (const output of verifyOutputs(discoverBookProject(process.argv[2] ?? DEFAULT_BOOK_PROJECT))) console.log(`✓ ${output.file} (${output.size} bytes)`); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
