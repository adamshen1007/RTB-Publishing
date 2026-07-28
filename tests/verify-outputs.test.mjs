import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { verifyHtmlChapterAnchors } from "../scripts/verify-outputs.mjs";

test("output verification accepts Pandoc-generated anchors from authored headings, not Blueprint shorthand", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-html-anchors-"));
  try {
    const source = resolve(root, "chapter.md"); writeFileSync(source, "# Chapter 4 — Define Your Riskiest Assumptions\n");
    const html = '<nav><a href="#chapter-4-define-your-riskiest-assumptions">Chapter</a></nav><h1 id="chapter-4-define-your-riskiest-assumptions">Chapter 4 — Define\n Your Riskiest Assumptions</h1>';
    assert.deepEqual(verifyHtmlChapterAnchors(html, [{ id: "short-blueprint-title", sourcePath: source }]), []);
    assert.match(verifyHtmlChapterAnchors("<h1>Chapter 4 — Define Your Riskiest Assumptions</h1>", [{ id: "short-blueprint-title", sourcePath: source }]).join("\n"), /missing an anchor/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
