import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "yaml";

export const REQUIRED_SECTIONS = [
  "Learning Objectives",
  "Deep Dive",
  "AI Founder Interpretation",
  "Callouts",
  "Checklist",
  "Worksheet",
  "Key Takeaways",
  "Sources"
];

export const COMPLETE_MANUSCRIPT_STATUSES = [
  "Internal Review",
  "Publication Candidate",
  "Public Preview",
  "Published"
];

const placeholderPattern = /\b(TODO|TBD|FIXME|citation needed|add (public )?sources?)\b/i;

export function canonicalChapterFiles(contents) {
  return canonicalChapterEntries(contents).map((entry) => entry.file);
}

export function canonicalChapterEntries(contents) {
  return [...contents.matchAll(/^\|\s*(\d{2})\s*\|\s*([^|]+?)\s*\|\s*`(\d{2}-[a-z0-9-]+\.md)`\s*\|/gm)]
    .map((match) => ({ number: match[1], title: match[2].trim(), file: match[3] }));
}

export function bookMetadata(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error("book.md must begin with YAML front matter.");
  return parse(frontmatter[1]);
}

export function namespaceFootnotes(markdown, namespace) {
  return markdown.replace(/\[\^([a-zA-Z0-9_-]+)\]/g, `[^${namespace}-$1]`);
}

export function validateChapter(filename, content, expectedTitle) {
  const failures = [];
  const number = basename(filename).match(/^(\d{2})-/)?.[1];
  if (!number) failures.push("filename must begin with a two-digit chapter number");
  if (number && !new RegExp(`^# Chapter ${Number(number)} — .+`, "m").test(content)) {
    failures.push(`heading must begin with # Chapter ${Number(number)} —`);
  }
  if (number && expectedTitle) {
    const expectedHeading = `# Chapter ${Number(number)} — ${expectedTitle}`;
    const actualHeading = content.match(/^# .+$/m)?.[0];
    if (actualHeading !== expectedHeading) failures.push(`heading must match: ${expectedHeading}`);
  }
  if (!/^>\s*\*\*Core Principle:/m.test(content)) failures.push("missing Core Principle callout");
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`^## ${section}$`, "m").test(content)) failures.push(`missing section: ${section}`);
  }
  if (placeholderPattern.test(content)) failures.push("contains a content placeholder");
  const objectives = content.match(/^## Learning Objectives$([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  if ([...objectives.matchAll(/^- /gm)].length < 3) failures.push("needs at least three learning objectives");
  const callouts = content.match(/^## Callouts$([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  if ([...callouts.matchAll(/^>\s*\*\*/gm)].length < 2) failures.push("needs at least two callout boxes");
  const checklist = content.match(/^## Checklist$([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  if ([...checklist.matchAll(/^- \[ \] /gm)].length < 3) failures.push("needs at least three checklist actions");
  const worksheet = content.match(/^## Worksheet$([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  if (!/^\|.+\|$/m.test(worksheet)) failures.push("needs a Markdown worksheet table");
  const takeaways = content.match(/^## Key Takeaways$([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  if ([...takeaways.matchAll(/^- /gm)].length < 3) failures.push("needs at least three key takeaways");
  const sources = content.match(/^## Sources$([\s\S]*)/m)?.[1] ?? "";
  if (![...sources.matchAll(/^- \[[^\]]+\]\(https?:\/\/[^)]+\)/gm)].length) {
    failures.push("Sources needs at least one public Markdown link");
  }
  return failures;
}

export function validateBook({ bookDirectory, chapterFiles }) {
  const failures = [];
  const contents = readFileSync(resolve(bookDirectory, "table-of-contents.md"), "utf8");
  const entries = canonicalChapterEntries(contents);
  const planned = entries.map((entry) => entry.file);
  if (planned.length !== 23 || new Set(planned).size !== planned.length) {
    failures.push("canonical table of contents must declare 23 unique chapter files");
  }
  const actual = [...chapterFiles].sort();
  for (const file of actual) {
    if (!planned.includes(file)) failures.push(`${file}: not declared in the canonical table of contents`);
    const content = readFileSync(resolve(bookDirectory, "chapters", file), "utf8");
    const expectedTitle = entries.find((entry) => entry.file === file)?.title;
    for (const failure of validateChapter(file, content, expectedTitle)) failures.push(`${file}: ${failure}`);
  }
  const metadata = bookMetadata(readFileSync(resolve(bookDirectory, "book.md"), "utf8"));
  if (COMPLETE_MANUSCRIPT_STATUSES.includes(metadata.status)) {
    for (const file of planned) if (!actual.includes(file)) failures.push(`${file}: missing from review manuscript`);
  }
  return { actual, planned, failures, status: metadata.status };
}
