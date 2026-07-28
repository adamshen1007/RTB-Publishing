import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import yauzl from "yauzl";
import { BUILD_DIR, DIST_DIR, ROOT, localBinary, run } from "./lib.mjs";
import { resolveBookProject } from "./books/discovery.mjs";
import { projectOutputPath } from "./books/assemble.mjs";

const DEFAULT_OUTPUT = resolve(BUILD_DIR, "acceptance", "increment-1", "baseline", "baseline.json");
const DEFAULT_PROJECT = resolveBookProject();
const SOURCE_REGISTRY = resolve(DEFAULT_PROJECT.root, DEFAULT_PROJECT.manifest.paths.research, "source-registry.md");
const REQUIRED_COMMANDS = Object.freeze([
  { id: "pnpm-check", command: "pnpm", args: ["check"] },
  { id: "pnpm-build", command: "pnpm", args: ["build"] },
  { id: "pnpm-verify-outputs", command: "pnpm", args: ["verify:outputs"] }
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function commandOutput(command, args) {
  const result = run(command, args, { allowFailure: true, capture: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${output}`);
  return output;
}

export function assertBaselinePreconditions({ dirty, commands }) {
  if (dirty) throw new Error("Increment 1 baseline requires a clean Git worktree.");
  const expected = new Set(REQUIRED_COMMANDS.map((command) => command.id));
  const observed = new Map((commands ?? []).map((command) => [command.id, command]));
  for (const id of expected) {
    const result = observed.get(id);
    if (!result || result.result !== "passed" || result.exitCode !== 0) {
      throw new Error(`Increment 1 baseline requires a successful ${id} command result.`);
    }
  }
}

export function readRepositorySnapshot(execute = commandOutput) {
  return {
    commit: execute("git", ["rev-parse", "HEAD"]),
    dirty: execute("git", ["status", "--porcelain"]) !== ""
  };
}

export function assertStableRepositorySnapshot(start, end) {
  if (start.dirty || end.dirty) throw new Error("Increment 1 baseline requires a clean Git worktree throughout capture.");
  if (start.commit !== end.commit) throw new Error(`Increment 1 baseline revision changed during capture: ${start.commit} -> ${end.commit}.`);
}

function runRequiredCommand(command) {
  const startedAt = new Date().toISOString();
  const result = run(command.command, command.args, { allowFailure: true, capture: true });
  const outcome = {
    id: command.id,
    command: [command.command, ...command.args].join(" "),
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status ?? 1,
    result: result.status === 0 ? "passed" : "failed"
  };
  if (outcome.result !== "passed") throw new Error(`${outcome.command} failed with exit code ${outcome.exitCode}.`);
  return outcome;
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
  const tokens = tokenizeXml(normalizeHtml(markup));
  const normalized = [];
  const metadataText = [];
  for (const token of tokens) {
    const tag = parseXmlTag(token);
    if (!tag) {
      const activeMetadata = metadataText.at(-1);
      normalized.push(activeMetadata?.kind === "replace" ? "[build-time]" : activeMetadata ? "" : token);
      continue;
    }
    if (tag.end) {
      const activeMetadata = metadataText.at(-1);
      if (activeMetadata?.name === tag.name) {
        metadataText.pop();
        if (activeMetadata.kind === "drop") continue;
      }
      normalized.push(`</${tag.name}>`);
      continue;
    }
    const attributes = tag.attributes.filter((attribute) => !attribute.name.startsWith("xmlns"));
    const property = attributes.find((attribute) => attribute.name === "property")?.value;
    const isBuildDate = tag.name === "dc:date";
    const isModified = tag.name === "meta" && property === "dcterms:modified";
    const canonicalAttributes = attributes
      .filter((attribute) => !(isBuildDate && attribute.name === "content"))
      .filter((attribute) => !(isModified && attribute.name === "content"))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (isBuildDate) {
      normalized.push(serializeXmlTag({ ...tag, attributes: canonicalAttributes, selfClosing: false }));
      normalized.push("[build-time]");
      normalized.push(`</${tag.name}>`);
      if (!tag.selfClosing) metadataText.push({ name: tag.name, kind: "drop" });
      continue;
    }
    if (isModified) {
      canonicalAttributes.push({ name: "content", value: "[build-time]" });
      canonicalAttributes.sort((left, right) => left.name.localeCompare(right.name));
      normalized.push(serializeXmlTag({ ...tag, attributes: canonicalAttributes, selfClosing: true }));
      if (!tag.selfClosing) metadataText.push({ name: tag.name, kind: "drop" });
      continue;
    }
    normalized.push(serializeXmlTag({ ...tag, attributes: canonicalAttributes }));
  }
  return normalized.join("").trim();
}

function tokenizeXml(markup) {
  const tokens = [];
  let textStart = 0;
  let index = 0;
  while (index < markup.length) {
    if (markup[index] !== "<") {
      index += 1;
      continue;
    }
    if (textStart < index) tokens.push(markup.slice(textStart, index));
    let quote = null;
    let end = index + 1;
    for (; end < markup.length; end += 1) {
      const character = markup[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        end += 1;
        break;
      }
    }
    if (quote || end > markup.length || markup[end - 1] !== ">") return [markup];
    tokens.push(markup.slice(index, end));
    index = end;
    textStart = index;
  }
  if (textStart < markup.length) tokens.push(markup.slice(textStart));
  return tokens;
}

function parseXmlTag(token) {
  if (!token.startsWith("<") || token.startsWith("<?") || token.startsWith("<!")) return null;
  const end = /^<\/([\w:.-]+)\s*>$/.exec(token);
  if (end) return { name: end[1], end: true, selfClosing: false, attributes: [] };
  const start = /^<([\w:.-]+)([\s\S]*?)(\/?)>$/.exec(token);
  if (!start) return null;
  const attributes = [];
  const source = start[2].trim();
  const attributePattern = /([\w:.-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = attributePattern.exec(source))) attributes.push({ name: match[1], value: match[3] });
  if (source.replace(attributePattern, "").trim()) return null;
  return { name: start[1], end: false, selfClosing: start[3] === "/", attributes };
}

function serializeXmlTag(tag) {
  const attributes = tag.attributes.map((attribute) => ` ${attribute.name}="${attribute.value}"`).join("");
  return `<${tag.name}${attributes}${tag.selfClosing ? " />" : ">"}`;
}

export function readEpubEntries(epubFile) {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(epubFile, { lazyEntries: true, validateEntrySizes: true }, (error, archive) => {
      if (error) return rejectPromise(error);
      const entries = [];
      let settled = false;
      const reject = (reason) => {
        if (settled) return;
        settled = true;
        archive.close();
        rejectPromise(reason);
      };
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName) || !/\.(?:xhtml|html|ncx|opf)$/i.test(entry.fileName)) return archive.readEntry();
        if (entry.uncompressedSize > 8 * 1024 * 1024) return reject(new Error(`EPUB entry exceeds 8 MiB: ${entry.fileName}`));
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.push({ entry: entry.fileName, content: Buffer.concat(chunks).toString("utf8") });
            archive.readEntry();
          });
        });
      });
      archive.on("end", () => {
        if (settled) return;
        settled = true;
        resolvePromise(entries.sort((left, right) => left.entry.localeCompare(right.entry)));
      });
      archive.readEntry();
    });
  });
}

async function epubSemantics(epubFile) {
  const entries = (await readEpubEntries(epubFile)).map(({ entry, content }) => {
    return { entry, sha256: sha256(normalizeEpubDocument(content)) };
  });
  return { entries, sha256: sha256(JSON.stringify(entries)) };
}

function canonicalInputs(project = DEFAULT_PROJECT) {
  return filesBelow(project.root)
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

export async function createBaselineRecord({ startedAt = new Date().toISOString(), commands, repositoryStart, readSnapshot = readRepositorySnapshot } = {}) {
  const project = DEFAULT_PROJECT;
  const htmlFile = projectOutputPath(project, resolve(DIST_DIR, "books"), "html");
  const epubFile = projectOutputPath(project, resolve(DIST_DIR, "books"), "epub");
  const start = repositoryStart ?? readSnapshot();
  assertBaselinePreconditions({ dirty: start.dirty, commands });
  const inputs = canonicalInputs();
  const html = readFileSync(htmlFile, "utf8");
  const record = {
    schemaVersion: 1,
    command: "pnpm baseline:increment-1",
    startedAt,
    repository: {
      commit: start.commit,
      dirty: false,
      start,
      end: null
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
    book: {
      projectId: project.id,
      chapterCount: project.chapters.length,
      canonicalInputs: inputs,
      canonicalContentSha256: sha256(JSON.stringify(inputs)),
      sourceRegistrySha256: sha256(readFileSync(SOURCE_REGISTRY))
    },
    configuration: [{ path: "package.json", sha256: sha256(readFileSync(resolve(ROOT, "package.json"))) }],
    commands,
    outputs: [outputRecord(htmlFile), outputRecord(epubFile)],
    semantics: {
      html: { sha256: sha256(normalizeHtml(html)) },
      epub: await epubSemantics(epubFile)
    },
    result: "passed"
  };
  const end = readSnapshot();
  assertStableRepositorySnapshot(start, end);
  record.repository.end = end;
  record.finishedAt = new Date().toISOString();
  assertSanitized(record);
  return record;
}

export async function writeBaselineRecord(output = DEFAULT_OUTPUT, options = {}) {
  const record = await createBaselineRecord(options);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  return { output: relativePath(output), record };
}

export async function runBaselineCapture(output = DEFAULT_OUTPUT, {
  readSnapshot = readRepositorySnapshot,
  runCommand = runRequiredCommand,
  writeRecord = writeBaselineRecord
} = {}) {
  const startedAt = new Date().toISOString();
  const repositoryStart = readSnapshot();
  if (repositoryStart.dirty) throw new Error("Increment 1 baseline requires a clean Git worktree before checks run.");
  const commands = REQUIRED_COMMANDS.map(runCommand);
  return writeRecord(output, { startedAt, commands, repositoryStart, readSnapshot });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const outputFlag = process.argv.indexOf("--output");
    const output = outputFlag === -1 ? DEFAULT_OUTPUT : resolve(process.argv[outputFlag + 1]);
    const result = await runBaselineCapture(output);
    console.log(`Increment 1 baseline written: ${result.output}`);
    console.log(`Chapters: ${result.record.book.chapterCount}`);
    console.log(`HTML semantics: ${result.record.semantics.html.sha256}`);
    console.log(`EPUB semantics: ${result.record.semantics.epub.sha256}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
