import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { namespaceFootnotes } from "../book-contract.mjs";
import { renderMermaidBlocks } from "../mermaid.mjs";

/** Assemble any discovered Book Project in its declared chapter and part order. */
export function assembleBook(project, { diagramsDirectory, renderDiagrams = true, preRenderedDirectory = null } = {}) {
  const sections = [project.metadata.trim()];
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  let lastPart = null;
  let diagramCount = 0;
  for (const chapter of project.chapters) {
    if (chapter.part_id && chapter.part_id !== lastPart) {
      const part = parts.get(chapter.part_id);
      sections.push(`# Part ${part.order} — ${part.title}`);
      lastPart = chapter.part_id;
    }
    const source = readFileSync(chapter.sourcePath, "utf8");
    const namespaced = namespaceFootnotes(source, chapter.id);
    if (renderDiagrams) {
      const rendered = renderMermaidBlocks(namespaced, chapter.id, diagramsDirectory, { replace: true, linkPrefix: "diagrams", format: "png", preRenderedDirectory });
      sections.push(rendered.markdown.trim());
      diagramCount += rendered.count;
    } else sections.push(namespaced.trim());
  }
  return { markdown: `${sections.join("\n\n\\newpage\n\n")}\n`, diagramCount };
}

export function projectOutputPath(project, outputRoot, format) {
  const profile = project.outputProfiles.find((item) => item.format === format);
  if (!profile) throw new Error(`Book Project ${project.id} does not declare a ${format} output profile.`);
  return resolve(outputRoot, project.id, profile.filename);
}
