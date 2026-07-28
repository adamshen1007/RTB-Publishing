import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parse } from "yaml";
import { discoverBookProject } from "./discovery.mjs";

export const MIGRATION_DIMENSIONS = ["title-and-metadata", "part-and-chapter-order", "headings", "paragraphs", "lists", "tables", "links", "footnotes", "callouts", "worksheets", "source-references", "diagrams", "assets", "language", "normalized-text-content"];
const classifications = new Set(["equal", "normalized-equivalent", "approved-change", "blocking-difference"]);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const normalized = (value) => value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const lines = (value, pattern) => value.match(pattern) ?? [];
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
const canonical = (value) => JSON.stringify(canonicalize(value));

function contentShape(project) {
  const chapters = project.chapters.map((chapter) => {
    const content = readFileSync(chapter.sourcePath, "utf8");
    return {
      id: chapter.id, order: chapter.order, part_id: chapter.part_id ?? null, source_path: chapter.source_path,
      headings: lines(content, /^#{1,6} .+$/gm), paragraphs: content.split(/\n\s*\n/).filter((item) => !/^(#|>|\||[-*+] |\d+\. )/.test(item.trim())),
      lists: lines(content, /^(?:[-*+] |\d+\. ).+$/gm), tables: lines(content, /^\|.*\|$/gm), links: lines(content, /!?\[[^\]]*\]\([^)]*\)/g),
      footnotes: lines(content, /\[\^[^\]]+\]/g), callouts: lines(content, /^>\s*\*\*.+$/gm), worksheets: lines(content, /^## Worksheet$/gm),
      diagrams: lines(content, /```mermaid[\s\S]*?```/g), assets: lines(content, /!\[[^\]]*\]\([^)]*\)/g), normalized_text: normalized(content)
    };
  });
  const metadata = parse(project.metadata.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "");
  return { metadata, locale: project.manifest.locale, parts: project.parts.map(({ id, order, title }) => ({ id, order, title })), chapters };
}

function dimensionValues(shape) {
  const metadata = { ...shape.metadata, locale: shape.locale };
  return {
    "title-and-metadata": metadata,
    "part-and-chapter-order": { parts: shape.parts, chapters: shape.chapters.map(({ id, order, part_id, source_path }) => ({ id, order, part_id, source_path })) },
    headings: shape.chapters.map(({ id, headings }) => ({ id, headings })), paragraphs: shape.chapters.map(({ id, paragraphs }) => ({ id, paragraphs })), lists: shape.chapters.map(({ id, lists }) => ({ id, lists })), tables: shape.chapters.map(({ id, tables }) => ({ id, tables })), links: shape.chapters.map(({ id, links }) => ({ id, links })), footnotes: shape.chapters.map(({ id, footnotes }) => ({ id, footnotes })), callouts: shape.chapters.map(({ id, callouts }) => ({ id, callouts })), worksheets: shape.chapters.map(({ id, worksheets }) => ({ id, worksheets })), "source-references": shape.chapters.map(({ id, links }) => ({ id, links: links.filter((link) => /https?:/.test(link)) })), diagrams: shape.chapters.map(({ id, diagrams }) => ({ id, diagrams })), assets: shape.chapters.map(({ id, assets }) => ({ id, assets })), language: shape.locale, "normalized-text-content": shape.chapters.map(({ id, normalized_text }) => ({ id, normalized_text }))
  };
}

/** Deterministic semantic comparison. Missing/unclassified dimensions fail closed. */
export function migrationReport(beforeProject, afterProject, { approvedChanges = {} } = {}) {
  const before = dimensionValues(contentShape(beforeProject));
  const after = dimensionValues(contentShape(afterProject));
  const differences = MIGRATION_DIMENSIONS.map((dimension) => {
    const base = canonical(before[dimension]); const migrated = canonical(after[dimension]);
    const equal = base === migrated;
    const normalizedEqual = normalized(base) === normalized(migrated);
    const classification = equal ? "equal" : normalizedEqual ? "normalized-equivalent" : approvedChanges[dimension] ? "approved-change" : "blocking-difference";
    return { dimension, semantic_id: dimension, base_hash: digest(base), migrated_hash: digest(migrated), classification, base_value: before[dimension], migrated_value: after[dimension], approved_change: approvedChanges[dimension] ?? null };
  });
  const invalid = differences.filter((item) => !classifications.has(item.classification) || item.classification === "blocking-difference");
  return { schema_version: "1", report_type: "book-semantic-migration", project_id: afterProject.id, base_snapshot: { authority: beforeProject.authority, hash: beforeProject.snapshotHash ?? digest(beforeProject.root) }, migrated_snapshot: { authority: afterProject.authority, hash: afterProject.snapshotHash ?? digest(afterProject.root) }, dimensions: differences, source_hash: digest(canonical(before)), migrated_hash: digest(canonical(after)), status: invalid.length ? "blocked" : "passed", validators: [{ id: "semantic-oracle-v1", result: invalid.length ? "failed" : "passed" }], blocking_differences: invalid.map((item) => item.dimension) };
}

export function assertMigrationPasses(report) {
  if (report.status !== "passed" || report.dimensions.length !== MIGRATION_DIMENSIONS.length || report.dimensions.some((item) => !classifications.has(item.classification) || item.classification === "blocking-difference")) throw new Error(`Semantic migration is blocked: ${report.blocking_differences.join(", ") || "missing or unclassified dimension"}`);
  return report;
}

export function migrateYc({ before, after = before } = {}) {
  const beforeProject = discoverBookProject(before);
  const afterProject = discoverBookProject(after);
  return assertMigrationPasses(migrationReport(beforeProject, afterProject));
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const project = process.argv[2];
  if (!project || !existsSync(project)) throw new Error("Usage: node scripts/books/migrate-yc.mjs <book-project-directory>");
  process.stdout.write(`${JSON.stringify(migrateYc({ before: project }), null, 2)}\n`);
}
