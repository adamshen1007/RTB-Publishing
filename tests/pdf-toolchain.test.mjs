import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { assertSafeCompatibilityOutput, assertTrustedCompatibilityRoot } from "../scripts/pdf-output-path.mjs";
import Ajv from "ajv/dist/2020.js";

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
const visual = json("tests/fixtures/publishing/pdf/evidence/artifacts/visual-regression.json");
const visualNegative = json("tests/fixtures/publishing/pdf/evidence/artifacts/visual-negative.json");
const visualMeasurements = json("tests/fixtures/publishing/pdf/evidence/artifacts/visual-negative-measurements.json");
const validate = (schema, value, label) => {
  const check = new Ajv({ strict: false }).compile(json(`tests/fixtures/publishing/pdf/schemas/${schema}.schema.json`));
  assert.ok(check(value), `${label} schema invalid: ${JSON.stringify(check.errors)}`);
};

const requireObject = (value, label) => assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
const requireValidationReport = (value, label) => {
  requireObject(value, label);
  assert.ok(Array.isArray(value.report?.jobs), `${label}.report.jobs must be an array`);
  assert.ok(Array.isArray(value.report.jobs[0]?.validationResult), `${label}.report.jobs[0].validationResult must be an array`);
};

test("lock, manifest, qpdf, and veraPDF evidence have actionable required shapes", () => {
  requireObject(lock, "toolchain lock");
  assert.equal(lock.schemaVersion, 2, "toolchain lock schemaVersion must be 2");
  requireObject(manifest.sourceSnapshot, "manifest.sourceSnapshot");
  requireObject(manifest.tools, "manifest.tools");
  requireObject(manifest.files, "manifest.files");
  assert.ok(Array.isArray(outlines.outlines), "qpdf outlines must be an array");
  assert.ok(Array.isArray(pages.pages), "qpdf pages must be an array");
  requireValidationReport(json("tests/fixtures/publishing/pdf/evidence/artifacts/verapdf-2a.json"), "veraPDF 2a");
  requireValidationReport(json("tests/fixtures/publishing/pdf/evidence/artifacts/verapdf-ua1.json"), "veraPDF ua1");
  validate("manifest", manifest, "manifest");
  validate("visual", visual, "visual report");
  validate("qpdf-outlines", outlines, "qpdf outlines");
  validate("qpdf-pages", pages, "qpdf pages");
  validate("verapdf", json("tests/fixtures/publishing/pdf/evidence/artifacts/verapdf-2a.json"), "veraPDF 2a");
  validate("verapdf", json("tests/fixtures/publishing/pdf/evidence/artifacts/verapdf-ua1.json"), "veraPDF ua1");
  validate("visual-negative", visualNegative, "negative visual report");
  validate("visual-negative-measurements", visualMeasurements, "negative visual measurements");
  assert.throws(() => validate("visual", { schemaVersion: 1, equal: false }, "malformed visual"), /schema invalid/);
  assert.throws(() => validate("manifest", { schemaVersion: 1 }, "malformed manifest"), /schema invalid/);
  assert.throws(() => validate("qpdf-outlines", { version: 2 }, "malformed outlines"), /schema invalid/);
  assert.throws(() => validate("qpdf-pages", { version: 2 }, "malformed pages"), /schema invalid/);
  assert.throws(() => validate("verapdf", { report: { jobs: [{ validationResult: [{ compliant: false, jobEndStatus: "normal", details: { failedRules: 1, failedChecks: 0 } }] }] } }, "failed verifier"), /schema invalid/);
  assert.throws(() => validate("visual-negative", { schemaVersion: 1 }, "malformed negative visual"), /schema invalid/);
  assert.throws(() => validate("visual-negative-measurements", { schemaVersion: 1, clipping: { raster: "visual-clipping-1.png", clippingDetected: true }, imageResolution: {} }, "missing derived measurements"), /schema invalid/);
});

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
  assert.equal(manifest.sourceSnapshot.figureSha256, sha256("tests/fixtures/publishing/pdf/semantic-figure.svg"));
  assert.equal(manifest.sourceSnapshot.transformerSha256, sha256("scripts/pdf-compatibility.mjs"));
  assert.equal(manifest.sourceSnapshot.toolchainLockSha256, sha256("publishing/pdf/toolchain.lock.json"));
  assert.equal(manifest.sourceSnapshot.visualBaseline.path, "tests/fixtures/publishing/pdf/visual-baseline/semantic-book-1.png");
  assert.equal(manifest.sourceSnapshot.visualBaseline.sha256, sha256(manifest.sourceSnapshot.visualBaseline.path));
  assert.equal(visual.baselineSha256, manifest.sourceSnapshot.visualBaseline.sha256);
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
  for (const token of ["/Lang (en-US)", "/Title (PDF Toolchain Compatibility Fixture)", "/StructTreeRoot", "/Marked true", "/S /Table", "/S /THead", "/S /TH", "/S /TR", "/S /TD", "/S /Figure", "/Alt (A navy rectangle used by the compatibility fixture.)", "https://example.com/", "/Dest (chapter-one)", "/BaseFont /", "NotoSerif-Regular"]) assert.ok(qdf.includes(token), token);
  assert.match(read("tests/fixtures/publishing/pdf/evidence/artifacts/semantic-book.pdf").toString("latin1"), /^%PDF-1\.7/);
  assert.equal(matrix.fixture, "semantic-book.md");
  assert.equal(matrix.platforms[0].command[0], "node");
  assert.equal(matrix.platforms[0].command.at(-1), "scripts/pdf-compatibility.mjs");
  assert.equal(visual.equal, true);
  assert.deepEqual([visual.width, visual.height], [1191, 1684]);
  assert.equal(visual.imageResolution, "semantic-figure.svg 40x20");
  assert.match(visual.overflowOrClipping, /no raster dimension or baseline difference/);
  assert.equal(visualNegative.geometryRegressionDetected, true);
  assert.notDeepEqual([visualNegative.width, visualNegative.height], [1191, 1684]);
  assert.equal(visualNegative.imageResolutionRegressionDetected, true);
  assert.equal(visualMeasurements.clipping.clippingDetected, true);
  assert.equal(visualMeasurements.clipping.renderedBounds.maxX, 199);
  assert.equal(visualMeasurements.imageResolution.alteredDimensionsDetected, true);
  assert.ok(visualMeasurements.imageResolution.renderedBounds.width < 20);
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

test("compatibility output deletion rejects roots, parents, traversal, and symlinks", () => {
  const safe = mkdtempSync("/private/tmp/rtb-pdf-safe-");
  const child = resolve(safe, "evidence");
  mkdirSync(child);
  assert.equal(assertSafeCompatibilityOutput({ output: child, safeRoots: [safe] }), child);
  for (const output of ["/", root, safe, resolve(safe, ".."), resolve(safe, "../escape")]) assert.throws(() => assertSafeCompatibilityOutput({ output, safeRoots: [safe] }), /strict child/);
  const linked = resolve(safe, "linked");
  symlinkSync(tmpdir(), linked);
  assert.throws(() => assertSafeCompatibilityOutput({ output: resolve(linked, "evidence"), safeRoots: [safe] }), /symbolic link/);
  const linkedRoot = resolve("/private/tmp", `rtb-pdf-linked-root-${Date.now()}`);
  symlinkSync(safe, linkedRoot);
  assert.throws(() => assertSafeCompatibilityOutput({ output: resolve(linkedRoot, "evidence"), safeRoots: [linkedRoot] }), /symbolic link/);
  mkdirSync(resolve(safe, "root"));
  const trusted = resolve("/private/tmp", `rtb-pdf-trusted-${Date.now()}`);
  symlinkSync(safe, trusted);
  assert.throws(() => assertTrustedCompatibilityRoot({ root: resolve(trusted, "root"), trustedParent: trusted }), /symbolic link/);
});
