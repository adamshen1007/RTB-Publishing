import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const bookDirectory = resolve(repositoryRoot, "books/volume-01-yc-playbook");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function bookMetadata(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!frontmatter) throw new Error("book.md must begin with YAML front matter.");
  return Object.fromEntries(frontmatter.split(/\r?\n/).map((line) => {
    const separator = line.indexOf(":");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^([\"'])(.*)\1$/, "$2");
    return [key, value];
  }));
}

function section(markdown, heading) {
  return markdown.match(new RegExp(`^## ${heading}\\r?$([\\s\\S]*?)(?=^## |\\Z)`, "m"))?.[1]?.trim() ?? "";
}

function parseToc(markdown) {
  let part = "";
  const entries = [];
  for (const line of markdown.split(/\r?\n/)) {
    const partMatch = line.match(/^## (Part [IVX]+) — (.+)$/);
    if (partMatch) part = `${partMatch[1]} — ${partMatch[2]}`;
    const row = line.match(/^\|\s*(\d{2})\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (row) entries.push({ number: row[1], title: row[2].trim(), file: row[3], decision: row[4].trim(), output: row[5].trim(), part });
  }
  return entries;
}

function notionChapterContent(markdown, sourcePath, hash) {
  const body = markdown.replace(/^# Chapter .+\r?\n+/, "").trim();
  return `> **Derived editorial copy:** Canonical source: \`${sourcePath}\`. Source hash: \`${hash}\`. Record proposed changes in Review Findings; do not treat direct Notion edits as publication-ready.\n\n${body}`;
}

function parseSources(markdown) {
  const sources = [];
  for (const line of markdown.split(/\r?\n/)) {
    const row = line.match(/^\|\s*([A-Z]+-\d+)\s*\|\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (row) sources.push({ id: row[1], source: row[2], url: row[3], publisher: row[4].trim(), classification: row[5].trim(), mainUse: row[6].trim() });
  }
  return sources;
}

function parseReleaseItems(markdown) {
  let category = "";
  const items = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) category = heading[1];
    const item = line.match(/^- \[([ x])\] (.+)$/);
    if (item) items.push({ title: item[2], category, status: item[1] === "x" ? "Complete" : "Open", required: true });
  }
  return items;
}

export function publicationExport(root = bookDirectory) {
  const tocPath = resolve(root, "table-of-contents.md");
  const metadata = bookMetadata(readFileSync(resolve(root, "book.md"), "utf8"));
  const toc = readFileSync(tocPath, "utf8");
  const entries = parseToc(toc);
  const chapters = entries.map((entry) => {
    const sourcePath = `books/volume-01-yc-playbook/chapters/${entry.file}`;
    const markdown = readFileSync(resolve(root, "chapters", entry.file), "utf8");
    const hash = sha256(markdown);
    const worksheet = section(markdown, "Worksheet");
    return {
      ...entry,
      sourcePath,
      sourceHash: hash,
      version: String(metadata.version),
      status: String(metadata.status),
      content: notionChapterContent(markdown, sourcePath, hash),
      worksheet: {
        title: `${entry.number} — ${entry.output}`,
        sourcePath,
        sourceHash: hash,
        content: `> **Working copy:** Complete this in Notion, then preserve any release evidence in the canonical project records. The worksheet definition remains owned by \`${sourcePath}\`.\n\n${worksheet}`
      }
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    title: metadata.title,
    version: String(metadata.version),
    status: String(metadata.status),
    chapters,
    sources: parseSources(readFileSync(resolve(root, "references/source-registry.md"), "utf8")),
    releaseItems: parseReleaseItems(readFileSync(resolve(root, "release-readiness-checklist.md"), "utf8"))
  };
}

export function validatePublicationExport(payload) {
  const failures = [];
  if (payload.chapters.length !== 23) failures.push(`expected 23 chapters, found ${payload.chapters.length}`);
  if (new Set(payload.chapters.map((item) => item.number)).size !== 23) failures.push("chapter numbers must be unique");
  for (const chapter of payload.chapters) {
    if (!chapter.part) failures.push(`${chapter.number}: missing part`);
    if (!chapter.decision || !chapter.output) failures.push(`${chapter.number}: missing reader decision or output`);
    if (!chapter.worksheet.content.includes("|")) failures.push(`${chapter.number}: missing worksheet table`);
    if (!/^[a-f0-9]{64}$/.test(chapter.sourceHash)) failures.push(`${chapter.number}: invalid source hash`);
  }
  if (!payload.sources.length) failures.push("source registry produced no records");
  if (!payload.releaseItems.length) failures.push("release checklist produced no records");
  return failures;
}

export function validateSyncState(payload, state) {
  const failures = [];
  for (const chapter of payload.chapters) {
    const synced = state.chapters?.[chapter.number];
    if (!synced) failures.push(`${chapter.number}: no Notion sync record`);
    else if (synced.sourceHash !== chapter.sourceHash) failures.push(`${chapter.number}: Notion copy is stale`);
  }
  return failures;
}

function compact(payload) {
  return { ...payload, chapters: payload.chapters.map(({ content, worksheet, ...chapter }) => ({ ...chapter, worksheet: { ...worksheet, content: undefined } })) };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "check";
  const payload = publicationExport();
  const failures = validatePublicationExport(payload);
  const stateFlag = process.argv.indexOf("--state");
  if (stateFlag !== -1) {
    const path = resolve(repositoryRoot, process.argv[stateFlag + 1]);
    if (!existsSync(path)) failures.push(`sync state does not exist: ${path}`);
    else failures.push(...validateSyncState(payload, JSON.parse(readFileSync(path, "utf8"))));
  }
  if (command === "export") process.stdout.write(`${JSON.stringify(payload)}\n`);
  else if (command === "summary") process.stdout.write(`${JSON.stringify(compact(payload), null, 2)}\n`);
  else if (command !== "check") failures.push(`unknown command: ${command}`);
  if (failures.length) {
    for (const failure of failures) console.error(`notion: ${failure}`);
    process.exitCode = 1;
  } else if (command === "check") {
    console.log(`Notion export contract valid: ${payload.chapters.length} chapters, ${payload.chapters.length} worksheets, ${payload.sources.length} sources, ${payload.releaseItems.length} release items.`);
  }
}
