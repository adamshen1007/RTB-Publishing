import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { discoverBookProject } from "./discovery.mjs";
import { migrationReport } from "./migrate-yc.mjs";

const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Produce deterministic evidence for, but never approval of, a human visual
 * migration review. The reviewer must record findings and the final decision.
 */
export function generateMigrationReviewEvidence(projectOrRoot, outputDirectory, { beforeProject } = {}) {
  const project = typeof projectOrRoot === "object" ? projectOrRoot : discoverBookProject(projectOrRoot);
  const chapterRisk = project.chapters.map((chapter) => {
    const markdown = readFileSync(chapter.sourcePath, "utf8");
    const risk = ["table", "diagram", "asset", "link", "footnote", "callout"].filter((kind) => ({ table: /\|.*\|/, diagram: /```mermaid/, asset: /!\[/, link: /\]\(https?:/, footnote: /\[\^/, callout: /^>\s*\*\*/m })[kind].test(markdown));
    return { chapter, markdown, risk };
  });
  const selected = new Map();
  for (const item of [chapterRisk[0], chapterRisk.at(-1), ...chapterRisk.filter((item) => item.risk.length)]) if (item) selected.set(item.chapter.id, item);
  const pages = [...selected.values()].map((item) => ({ id: item.chapter.id, order: item.chapter.order, source_path: item.chapter.source_path, source_hash: hash(item.markdown), risks: item.risk, preview: `${item.chapter.id}.html` }));
  mkdirSync(outputDirectory, { recursive: true });
  for (const page of pages) {
    const item = selected.get(page.id);
    writeFileSync(resolve(outputDirectory, page.preview), `<!doctype html><html lang="${project.manifest.locale}"><meta charset="utf-8"><title>${page.id} migration preview</title><body><main><p>Machine-prepared migration evidence. Human review is required.</p><pre>${escapeHtml(item.markdown)}</pre></main></body></html>\n`);
  }
  if (!beforeProject) throw new Error("Visual-review evidence requires the independently discovered pre-migration authority.");
  const report = migrationReport(beforeProject, project);
  const evidence = { schema_version: "1", kind: "migration-visual-review-evidence", project_id: project.id, status: "awaiting-human-review", machine_oracle_status: report.status, pages, review_checklist: ["Compare source and HTML preview reading order, headings, callouts, links, tables, worksheets, diagrams and assets.", "Compare the same representative and risky pages in HTML, PDF, and EPUB when renderer artifacts are available.", "Record every finding, its classification, resolution, reviewer identity, review date, and final decision.", "Do not treat this review as accessibility conformance or legal/rights approval."], report_hash: hash(JSON.stringify(report)) };
  writeFileSync(resolve(outputDirectory, "review-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const project = process.argv[2]; const output = process.argv[3];
  if (!project || !output) throw new Error("Usage: node scripts/books/migration-review.mjs <book-project> <output-directory>");
  process.stdout.write(`${JSON.stringify(generateMigrationReviewEvidence(project, resolve(output)), null, 2)}\n`);
}
