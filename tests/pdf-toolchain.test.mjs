import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file));
const json = (file) => JSON.parse(read(file));
const sha256 = (file) => createHash("sha256").update(read(file)).digest("hex");
const lock = json("publishing/pdf/toolchain.lock.json");
const matrix = json("tests/fixtures/publishing/pdf/compatibility-matrix.json");
const manifest = json("tests/fixtures/publishing/pdf/evidence/artifacts/manifest.json");
const qdf = read("tests/fixtures/publishing/pdf/evidence/artifacts/semantic-book.qdf.pdf").toString("latin1");
const outlines = json("tests/fixtures/publishing/pdf/evidence/artifacts/qpdf-outlines.json");
const pages = json("tests/fixtures/publishing/pdf/evidence/artifacts/qpdf-pages.json");

test("locks actual executable, runtime, and font bytes", () => {
  const hex = /^[a-f0-9]{64}$/;
  assert.equal(lock.tools.renderer.artifacts[0].executableSha256, manifest.tools.typst);
  assert.equal(lock.tools.javaRuntime.artifacts[0].executableSha256, manifest.tools.java);
  assert.equal(lock.tools.structuralValidator.executableSha256, manifest.tools.verapdf);
  assert.equal(lock.tools.structuralValidator.mainJarSha256, manifest.tools.verapdfJar);
  assert.equal(lock.tools.pdfParser.executableSha256, manifest.tools.qpdf);
  assert.equal(lock.fonts[0].sha256, manifest.tools.font);
  for (const value of Object.values(manifest.tools)) assert.match(value, hex);
  assert.match(lock.tools.pdfParser.bottle.sha256, hex);
  assert.equal("visualRasterizer" in lock.tools, false);
  assert.equal("visualComparator" in lock.tools, false);
});

test("retained evidence is fresh, inspectable, and passes both veraPDF profiles", () => {
  for (const [file, expected] of Object.entries(manifest.files)) assert.equal(sha256(`tests/fixtures/publishing/pdf/evidence/artifacts/${file}`), expected, file);
  assert.equal(manifest.sourceSnapshot.markdownSha256, sha256("tests/fixtures/publishing/pdf/semantic-book.md"));
  assert.match(read("tests/fixtures/publishing/pdf/evidence/artifacts/qpdf-check.txt").toString(), /No syntax or stream encoding errors found/);
  assert.equal(outlines.outlines[0].title, "Chapter one");
  assert.equal(outlines.outlines[0].kids[0].title, "Fixture values");
  assert.equal(pages.pages.length, 1);
  for (const flavour of ["2a", "ua1"]) {
    const result = json(`tests/fixtures/publishing/pdf/evidence/artifacts/verapdf-${flavour}.json`).report.jobs[0].validationResult[0];
    assert.equal(result.compliant, true, flavour);
    assert.equal(result.details.failedRules, 0, flavour);
    assert.equal(result.details.failedChecks, 0, flavour);
  }
});

test("retained parsed PDF proves metadata, language, tagged semantics, navigation, font, and alternative text", () => {
  for (const token of ["/Lang (en-US)", "/Title (PDF Toolchain Compatibility Fixture)", "/StructTreeRoot", "/Marked true", "/S /Table", "/S /Figure", "/Alt (A navy rectangle used by the compatibility fixture.)", "https://example.com/", "/BaseFont /", "NotoSerif-Regular"]) assert.ok(qdf.includes(token), token);
  assert.match(read("tests/fixtures/publishing/pdf/evidence/artifacts/semantic-book.pdf").toString("latin1"), /^%PDF-1\.7/);
  assert.equal(matrix.fixture, "semantic-book.md");
  assert.equal(matrix.platforms[0].command[0], "node");
  assert.equal(matrix.platforms[0].command.at(-1), "scripts/pdf-compatibility.mjs");
});

test("canonical Markdown is transformed only into the derived Typst snapshot", () => {
  const markdown = read("tests/fixtures/publishing/pdf/semantic-book.md").toString();
  const derived = read("tests/fixtures/publishing/pdf/evidence/artifacts/staging/snapshot/semantic-book.typ").toString();
  assert.match(markdown, /lang: en-US/);
  assert.match(markdown, /# Chapter one/);
  assert.match(markdown, /\| Name \| Value \|/);
  assert.match(derived, /#set text\(font: "Noto Serif", lang: "en", region: "US"/);
  assert.match(derived, /image\("semantic-figure\.svg", alt:/);
});
