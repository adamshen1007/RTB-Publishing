import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { ROOT, markdownFiles, readJson, relativeToRoot } from "./lib.mjs";

const config = readJson(resolve(ROOT, "linkcheck.config.json"));
const ignoredExternal = new Set(config.ignoreExternal ?? []);
const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];
const warnings = [];
const externalUrls = new Set();

function withoutCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function splitTarget(rawTarget) {
  const trimmed = rawTarget.trim().replace(/^<|>$/g, "");
  const titleIndex = trimmed.search(/\s+["']/);
  const target = titleIndex === -1 ? trimmed : trimmed.slice(0, titleIndex);
  const hashIndex = target.indexOf("#");
  return {
    path: hashIndex === -1 ? target : target.slice(0, hashIndex),
    anchor: hashIndex === -1 ? "" : decodeURIComponent(target.slice(hashIndex + 1)),
  };
}

function slugifyHeading(value) {
  return value.trim().toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function anchorsFor(file) {
  if (extname(file).toLowerCase() !== ".md") return new Set();
  const anchors = new Set();
  const duplicateCounts = new Map();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const base = slugifyHeading(heading[1]);
    const count = duplicateCounts.get(base) ?? 0;
    duplicateCounts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const files = markdownFiles();
for (const file of files) {
  const content = withoutCodeFences(readFileSync(file, "utf8"));
  for (const match of content.matchAll(markdownLink)) {
    const rawTarget = match[1];
    if (/^(mailto:|tel:)/i.test(rawTarget)) continue;
    if (/^https?:\/\//i.test(rawTarget)) {
      if (!ignoredExternal.has(rawTarget)) externalUrls.add(rawTarget);
      continue;
    }

    const target = splitTarget(rawTarget);
    let targetFile = target.path ? resolve(dirname(file), decodeURIComponent(target.path)) : file;
    if (existsSync(targetFile) && statSync(targetFile).isDirectory()) {
      if (!target.anchor) continue;
      targetFile = resolve(targetFile, "README.md");
    }
    if (!existsSync(targetFile)) {
      failures.push(`${relativeToRoot(file)} -> missing ${rawTarget}`);
    } else if (target.anchor && !anchorsFor(targetFile).has(slugifyHeading(target.anchor))) {
      failures.push(`${relativeToRoot(file)} -> missing anchor ${rawTarget}`);
    }
  }
}

async function inspectExternal(url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "RTB-Publishing-Link-Checker/0.3", range: "bytes=0-1024" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      await response.body?.cancel();
      if (response.status === 404 || response.status === 410) failures.push(`${url} -> HTTP ${response.status}`);
      else if (response.status >= 400) warnings.push(`${url} -> HTTP ${response.status}; reachability was inconclusive`);
      return;
    } catch (error) {
      if (attempt === 2) warnings.push(`${url} -> transient network failure: ${error.message}`);
    }
  }
}

const urls = [...externalUrls];
for (let index = 0; index < urls.length; index += 5) {
  await Promise.all(urls.slice(index, index + 5).map(inspectExternal));
}
for (const warning of warnings) console.warn(`! ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
console.log(`✓ Checked ${files.length} Markdown files and ${urls.length} external link${urls.length === 1 ? "" : "s"}.`);
