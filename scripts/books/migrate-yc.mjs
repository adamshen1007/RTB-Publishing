import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { ROOT } from "../lib.mjs";
import { discoverBookProject, resolveBookProject } from "./discovery.mjs";

export const MIGRATION_DIMENSIONS = Object.freeze(["title-and-metadata", "part-and-chapter-order", "headings", "paragraphs", "lists", "tables", "links", "footnotes", "callouts", "worksheets", "source-references", "diagrams", "assets", "language", "normalized-text-content"]);
const classificationSet = new Set(["equal", "normalized-equivalent", "approved-change", "blocking-difference"]);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const normalized = (value) => value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const lines = (value, pattern) => value.match(pattern) ?? [];
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const canonical = (value) => JSON.stringify(canonicalize(value));

function frontmatter(markdown) { return parse(markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""); }
function contentShape(project) {
  const chapters = project.chapters.map((chapter) => {
    const content = chapter.content ?? readFileSync(chapter.sourcePath, "utf8");
    return { id: chapter.id, order: chapter.order, part_id: chapter.part_id ?? null, source_path: chapter.source_path, headings: lines(content, /^#{1,6} .+$/gm), paragraphs: content.split(/\n\s*\n/).filter((item) => !/^(#|>|\||[-*+] |\d+\. )/.test(item.trim())), lists: lines(content, /^(?:[-*+] |\d+\. ).+$/gm), tables: lines(content, /^\|.*\|$/gm), links: lines(content, /!?\[[^\]]*\]\([^)]*\)/g), footnotes: lines(content, /\[\^[^\]]+\]/g), callouts: lines(content, /^>\s*\*\*.+$/gm), worksheets: lines(content, /^## Worksheet$/gm), diagrams: lines(content, /```mermaid[\s\S]*?```/g), assets: lines(content, /!\[[^\]]*\]\([^)]*\)/g), normalized_text: normalized(content) };
  });
  return { metadata: frontmatter(project.metadata), locale: project.manifest.locale, parts: project.parts.map(({ id, order, title }) => ({ id, order, title })), chapters };
}
function dimensionValues(shape) {
  const metadata = { ...shape.metadata, locale: shape.locale };
  const chapters = (field) => shape.chapters.map(({ id, [field]: value }) => ({ id, [field]: value }));
  return { "title-and-metadata": metadata, "part-and-chapter-order": { parts: shape.parts, chapters: shape.chapters.map(({ id, order, part_id, source_path }) => ({ id, order, part_id, source_path })) }, headings: chapters("headings"), paragraphs: chapters("paragraphs"), lists: chapters("lists"), tables: chapters("tables"), links: chapters("links"), footnotes: chapters("footnotes"), callouts: chapters("callouts"), worksheets: chapters("worksheets"), "source-references": shape.chapters.map(({ id, links }) => ({ id, links: links.filter((link) => /https?:/.test(link)) })), diagrams: chapters("diagrams"), assets: chapters("assets"), language: shape.locale, "normalized-text-content": chapters("normalized_text") };
}
function identity(project, shape) { return project.identity ?? { authority: project.authority, root_hash: project.snapshotHash ?? digest(project.root), semantic_hash: digest(canonical(shape)) }; }

/** Independently discover the historical manifest and source files from Git. */
export function discoverHistoricalBookProject({ commit, projectPath }) {
  if (!/^[a-f0-9]{7,64}$/i.test(commit) || !projectPath || projectPath.includes("..") || projectPath.startsWith("/")) throw new Error("Historical migration authority must declare a safe commit and repository-relative project path.");
  const git = (path) => execFileSync("git", ["show", `${commit}:${projectPath}/${path}`], { cwd: ROOT, encoding: "utf8" });
  const manifest = parse(git("book.project.yaml")); const blueprint = parse(git(manifest.blueprint.path));
  const resolvedCommit = execFileSync("git", ["rev-parse", `${commit}^{commit}`], { cwd: ROOT, encoding: "utf8" }).trim();
  return { id: manifest.id, manifest, blueprint, metadata: git(manifest.paths.metadata), parts: [...blueprint.parts].sort((a, b) => a.order - b.order), chapters: blueprint.chapter_contracts.map((chapter) => ({ ...chapter, content: git(chapter.source_path) })).sort((a, b) => a.order - b.order), identity: { authority: "git-commit", commit: resolvedCommit, project_path: projectPath, manifest_hash: digest(canonical(manifest)) } };
}

export function validateMigrationReport(report) {
  if (!report || report.schema_version !== "1" || report.report_type !== "book-semantic-migration" || !Array.isArray(report.dimensions)) throw new Error("Migration report has an invalid envelope.");
  const names = report.dimensions.map((item) => item.dimension);
  const exact = names.length === MIGRATION_DIMENSIONS.length && new Set(names).size === names.length && names.every((name) => MIGRATION_DIMENSIONS.includes(name));
  if (!exact) throw new Error("Migration report must contain each required semantic dimension exactly once.");
  for (const item of report.dimensions) if (!classificationSet.has(item.classification) || !item.base_hash || !item.migrated_hash || !item.semantic_id) throw new Error(`Migration report contains an unclassified or malformed dimension: ${item.dimension}.`);
  if (canonical(report.base_identity) === canonical(report.migrated_identity)) throw new Error("Migration report must bind distinct pre- and post-migration input identities.");
  return report;
}

/** Deterministic, closed-set semantic comparison. */
export function migrationReport(beforeProject, afterProject, { approvedChanges = {} } = {}) {
  const before = dimensionValues(contentShape(beforeProject)); const after = dimensionValues(contentShape(afterProject));
  const dimensions = MIGRATION_DIMENSIONS.map((dimension) => {
    const base = canonical(before[dimension]); const migrated = canonical(after[dimension]);
    const classification = base === migrated ? "equal" : normalized(base) === normalized(migrated) ? "normalized-equivalent" : approvedChanges[dimension] ? "approved-change" : "blocking-difference";
    return { dimension, semantic_id: dimension, base_hash: digest(base), migrated_hash: digest(migrated), classification, base_value: before[dimension], migrated_value: after[dimension], approved_change: approvedChanges[dimension] ?? null };
  });
  const blocking = dimensions.filter((item) => item.classification === "blocking-difference").map((item) => item.dimension);
  const report = { schema_version: "1", report_type: "book-semantic-migration", project_id: afterProject.id, base_identity: identity(beforeProject, before), migrated_identity: identity(afterProject, after), dimensions, source_hash: digest(canonical(before)), migrated_hash: digest(canonical(after)), status: blocking.length ? "blocked" : "passed", validators: [{ id: "semantic-oracle-v2", result: blocking.length ? "failed" : "passed" }], blocking_differences: blocking };
  validateMigrationReport(report); return report;
}
export function assertMigrationPasses(report) { validateMigrationReport(report); if (report.status !== "passed" || report.dimensions.some((item) => item.classification === "blocking-difference")) throw new Error(`Semantic migration is blocked: ${report.blocking_differences.join(", ") || "blocking difference"}`); return report; }

export function migrateYc({ before, after } = {}) {
  if (!before || !after) throw new Error("Migration requires independent --before and --after authorities.");
  const beforeProject = before.commit ? discoverHistoricalBookProject(before) : discoverBookProject(before);
  const afterProject = discoverBookProject(after);
  return assertMigrationPasses(migrationReport(beforeProject, afterProject));
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2); const value = (name) => args[args.indexOf(name) + 1];
  const beforeCommit = value("--before-commit"); const beforePath = value("--before-project"); const after = value("--after");
  if (!beforeCommit || !beforePath || !after || !existsSync(after)) throw new Error("Usage: node scripts/books/migrate-yc.mjs --before-commit <commit> --before-project <repository/project> --after <project-directory>");
  process.stdout.write(`${JSON.stringify(migrateYc({ before: { commit: beforeCommit, projectPath: beforePath }, after }), null, 2)}\n`);
}
