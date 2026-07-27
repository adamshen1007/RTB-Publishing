import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_DIR, BOOK_DIST_DIR, BUILD_DIR, ROOT, localBinary, run } from "./lib.mjs";

const DEFAULT_OUTPUT = resolve(BUILD_DIR, "acceptance", "increment-1", "baseline", "baseline.json");
const SOURCE_REGISTRY = resolve(BOOK_DIR, "references", "source-registry.md");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandOutput(command, args) {
  const result = run(command, args, { allowFailure: true, capture: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${output}`);
  return output;
}

function version(command, args = ["--version"]) {
  const output = commandOutput(command, args);
  return output.match(/\d+(?:\.\d+)+(?:-[\w.-]+)?/)?.[0] ?? output.split(/\r?\n/)[0];
}

function filesBelow(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(file));
    else if (entry.isFile() && !lstatSync(file).isSymbolicLink()) files.push(file);
  }
  return files.sort();
}

function relativePath(file) {
  return relative(ROOT, file).split(sep).join("/");
}

export function normalizeHtml(markup) {
  return markup
    .replace(/\r\n/g, "\n")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/[\t ]{2,}/g, " ")
    .trim();
}

export function normalizeEpubDocument(markup) {
  return normalizeHtml(markup)
    .replace(/<\?xml[^]*?\?>/g, "")
    .replace(/\s+xmlns(?::\w+)?="[^"]+"/g, "")
    .trim();
}

function epubEntries(epubFile) {
  return commandOutput("unzip", ["-Z1", epubFile])
    .split(/\r?\n/)
    .filter((entry) => /\.(?:xhtml|html|ncx|opf)$/i.test(entry))
    .sort();
}

function epubSemantics(epubFile) {
  const entries = epubEntries(epubFile).map((entry) => {
    const content = commandOutput("unzip", ["-p", epubFile, entry]);
    return { entry, sha256: sha256(normalizeEpubDocument(content)) };
  });
  return { entries, sha256: sha256(JSON.stringify(entries)) };
}

function canonicalInputs() {
  return filesBelow(BOOK_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({ path: relativePath(file), sha256: sha256(readFileSync(file)) }));
}

function outputRecord(file) {
  if (!existsSync(file)) throw new Error(`Baseline output is missing: ${relativePath(file)}`);
  const content = readFileSync(file);
  return { filename: basename(file), bytes: content.length, sha256: sha256(content) };
}

function assertSanitized(record) {
  const serialized = JSON.stringify(record);
  if (serialized.includes(ROOT) || /(?:api[_-]?key|authorization|password|token)\s*[=:]/i.test(serialized)) {
    throw new Error("Baseline report contains an unsafe local path or credential-like value.");
  }
}

export function createBaselineRecord({ startedAt = new Date().toISOString() } = {}) {
  const htmlFile = resolve(BOOK_DIST_DIR, "index.html");
  const epubFile = resolve(BOOK_DIST_DIR, "rtb-publishing-playbook.epub");
  const docxFile = resolve(BOOK_DIST_DIR, "rtb-publishing-playbook.docx");
  const inputs = canonicalInputs();
  const html = readFileSync(htmlFile, "utf8");
  const record = {
    schemaVersion: 1,
    command: "pnpm baseline:increment-1",
    startedAt,
    repository: {
      commit: commandOutput("git", ["rev-parse", "HEAD"]),
      dirty: commandOutput("git", ["status", "--porcelain"]) !== ""
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.versions.node,
      pnpm: version("pnpm"),
      pandoc: version("pandoc"),
      vale: version("vale"),
      mermaid: version(localBinary("mmdc"))
    },
    ycPlaybook: {
      chapterCount: inputs.filter((input) => input.path.includes("/chapters/")).length,
      canonicalInputs: inputs,
      canonicalContentSha256: sha256(JSON.stringify(inputs)),
      sourceRegistrySha256: sha256(readFileSync(SOURCE_REGISTRY))
    },
    configuration: [{ path: "package.json", sha256: sha256(readFileSync(resolve(ROOT, "package.json"))) }],
    outputs: [outputRecord(htmlFile), outputRecord(epubFile), outputRecord(docxFile)],
    semantics: {
      html: { sha256: sha256(normalizeHtml(html)) },
      epub: epubSemantics(epubFile)
    },
    result: "passed"
  };
  record.finishedAt = new Date().toISOString();
  assertSanitized(record);
  return record;
}

export function writeBaselineRecord(output = DEFAULT_OUTPUT, options = {}) {
  const record = createBaselineRecord(options);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  return { output: relativePath(output), record };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const outputFlag = process.argv.indexOf("--output");
    const output = outputFlag === -1 ? DEFAULT_OUTPUT : resolve(process.argv[outputFlag + 1]);
    const result = writeBaselineRecord(output);
    console.log(`Increment 1 baseline written: ${result.output}`);
    console.log(`YC chapters: ${result.record.ycPlaybook.chapterCount}`);
    console.log(`HTML semantics: ${result.record.semantics.html.sha256}`);
    console.log(`EPUB semantics: ${result.record.semantics.epub.sha256}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
