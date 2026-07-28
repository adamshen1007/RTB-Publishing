import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverBookProject } from "./books/discovery.mjs";
import { DEFAULT_BOOK_PROJECT, ROOT } from "./lib.mjs";

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function section(markdown, heading) { return markdown.match(new RegExp(`^## ${heading}\\r?$([\\s\\S]*?)(?=^## |\\Z)`, "m"))?.[1]?.trim() ?? ""; }
function notionChapterContent(markdown, sourcePath, hash) { return `> **Derived editorial copy:** Canonical source: \`${sourcePath}\`. Source hash: \`${hash}\`. Record proposed changes in Review Findings; do not treat direct Notion edits as publication-ready.\n\n${markdown.replace(/^# .+\r?\n+/, "").trim()}`; }
function parseSources(project) {
  const source = resolve(project.root, project.manifest.paths.research, "source-registry.md");
  if (!existsSync(source)) return [];
  return [...readFileSync(source, "utf8").matchAll(/^\|\s*([A-Z]+-\d+)\s*\|\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)].map((row) => ({ id: row[1], source: row[2], url: row[3], publisher: row[4].trim(), classification: row[5].trim(), mainUse: row[6].trim() }));
}
function parseReleaseItems(project) {
  const file = resolve(project.root, "release-readiness-checklist.md");
  if (!existsSync(file)) return [];
  let category = "";
  return readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => { const heading = line.match(/^## (.+)$/); if (heading) { category = heading[1]; return []; } const item = line.match(/^- \[([ x])\] (.+)$/); return item ? [{ title: item[2], category, status: item[1] === "x" ? "Complete" : "Open", required: true }] : []; });
}

/** Derived Notion input for any discovered project; source paths and hashes stay traceable. */
export function publicationExport(projectOrRoot = DEFAULT_BOOK_PROJECT) {
  const project = typeof projectOrRoot === "object" && projectOrRoot.chapters ? projectOrRoot : discoverBookProject(projectOrRoot);
  const metadata = project.metadata.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const fields = Object.fromEntries(metadata.split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf(":"); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]; }));
  return {
    projectId: project.id, title: fields.title, version: String(fields.version), status: String(fields.status), locale: project.manifest.locale,
    chapters: project.chapters.map((chapter) => {
      const markdown = readFileSync(chapter.sourcePath, "utf8"); const sourceHash = sha256(markdown); const sourcePath = relative(ROOT, chapter.sourcePath).split("\\").join("/");
      const part = project.parts.find((item) => item.id === chapter.part_id);
      return { ...chapter, number: String(chapter.order).padStart(2, "0"), part: part ? `Part ${part.order} — ${part.title}` : null, sourcePath, sourceHash, version: String(fields.version), status: String(fields.status), content: notionChapterContent(markdown, sourcePath, sourceHash), worksheet: { title: `${String(chapter.order).padStart(2, "0")} — ${chapter.required_output}`, sourcePath, sourceHash, content: `> **Working copy:** Complete this in Notion, then preserve any release evidence in the canonical project records. The worksheet definition remains owned by \`${sourcePath}\`.\n\n${section(markdown, "Worksheet")}` } };
    }),
    sources: parseSources(project), releaseItems: parseReleaseItems(project)
  };
}

export function validatePublicationExport(payload) {
  const failures = [];
  if (!payload.chapters.length) failures.push("no chapters discovered");
  if (new Set(payload.chapters.map((item) => item.id)).size !== payload.chapters.length) failures.push("chapter IDs must be unique");
  for (const chapter of payload.chapters) { if (!chapter.part) failures.push(`${chapter.id}: missing part`); if (!chapter.reader_decision || !chapter.required_output) failures.push(`${chapter.id}: missing reader decision or output`); if (!chapter.worksheet.content.includes("|")) failures.push(`${chapter.id}: missing worksheet table`); if (!/^[a-f0-9]{64}$/.test(chapter.sourceHash)) failures.push(`${chapter.id}: invalid source hash`); }
  return failures;
}
export function validateSyncState(payload, state) { const failures = []; for (const chapter of payload.chapters) { const key = chapter.id in (state.chapters ?? {}) ? chapter.id : chapter.number; const synced = state.chapters?.[key]; if (!synced) failures.push(`${chapter.number}: no Notion sync record`); else if (synced.sourceHash !== chapter.sourceHash) failures.push(`${chapter.number}: Notion copy is stale`); } return failures; }
function compact(payload) { return { ...payload, chapters: payload.chapters.map(({ content, worksheet, ...chapter }) => ({ ...chapter, worksheet: { ...worksheet, content: undefined } })) }; }

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "check"; const project = process.argv[3] ?? DEFAULT_BOOK_PROJECT; const payload = publicationExport(project); const failures = validatePublicationExport(payload);
  const stateFlag = process.argv.indexOf("--state"); if (stateFlag !== -1) { const path = resolve(ROOT, process.argv[stateFlag + 1]); if (!existsSync(path)) failures.push(`sync state does not exist: ${path}`); else failures.push(...validateSyncState(payload, JSON.parse(readFileSync(path, "utf8")))); }
  if (command === "export") process.stdout.write(`${JSON.stringify(payload)}\n`); else if (command === "summary") process.stdout.write(`${JSON.stringify(compact(payload), null, 2)}\n`); else if (command !== "check") failures.push(`unknown command: ${command}`);
  if (failures.length) { for (const failure of failures) console.error(`notion: ${failure}`); process.exitCode = 1; } else if (command === "check") console.log(`Notion export contract valid: ${payload.chapters.length} chapters, ${payload.chapters.length} worksheets, ${payload.sources.length} sources, ${payload.releaseItems.length} release items.`);
}
