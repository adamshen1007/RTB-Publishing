import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { localBinary, ROOT, run } from "./lib.mjs";

const MERMAID_BLOCK = /```mermaid\s*\n([\s\S]*?)```/g;

function safeStem(value) {
  return value.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function countMermaidBlocks(markdown) {
  return [...markdown.matchAll(MERMAID_BLOCK)].length;
}

export function renderMermaidBlocks(markdown, sourceName, outputDirectory, options = {}) {
  mkdirSync(outputDirectory, { recursive: true });
  const matches = [...markdown.matchAll(MERMAID_BLOCK)];
  let rendered = markdown;
  let offset = 0;

  matches.forEach((match, matchIndex) => {
    const index = matchIndex + 1;
    const stem = `${safeStem(basename(sourceName))}-diagram-${index}`;
    const sourceFile = resolve(outputDirectory, `${stem}.mmd`);
    const outputFile = resolve(outputDirectory, `${stem}.${options.format ?? "png"}`);
    // mmdc is launched synchronously but Chromium starts a child process. Close
    // and fsync the exact absolute input before it observes the path.
    writeFileSync(sourceFile, `${match[1].trim()}\n`, { encoding: "utf8", mode: 0o600 });
    const descriptor = openSync(sourceFile, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    if (!existsSync(sourceFile)) throw new Error(`Mermaid input disappeared before rendering: ${sourceFile}`);
    if (options.preRenderedDirectory) {
      const accepted = resolve(options.preRenderedDirectory, `${stem}.${options.format ?? "png"}`);
      if (!existsSync(accepted)) throw new Error(`Accepted Mermaid rendering is missing: ${accepted}`);
      copyFileSync(accepted, outputFile);
    } else run(localBinary("mmdc"), [
        "-i", sourceFile, "-o", outputFile,
        "-p", resolve(ROOT, "publishing", "puppeteer-config.json"),
        "-b", "transparent",
      ]);

    if (options.replace) {
      const alt = `Diagram ${index} from ${basename(sourceName, ".md")}`;
      const replacement = `![${alt}](${options.linkPrefix}/${stem}.${options.format ?? "png"})`;
      const start = match.index + offset;
      rendered = `${rendered.slice(0, start)}${replacement}${rendered.slice(start + match[0].length)}`;
      offset += replacement.length - match[0].length;
    }
  });
  return { markdown: rendered, count: matches.length };
}
