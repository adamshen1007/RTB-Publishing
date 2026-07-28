import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const lock = readJson("publishing/pdf/toolchain.lock.json");
const fixture = readJson("tests/fixtures/publishing/pdf/compatibility-matrix.json");
const waiver = readJson("tests/fixtures/publishing/pdf/waiver.example.json");
const macosEvidence = readJson("tests/fixtures/publishing/pdf/evidence/macos-x86_64-2026-07-28.json");

const sha256 = /^[a-f0-9]{64}$/;

test("RFC-008 locks the open-source combined profile and every required executable", () => {
  assert.equal(lock.schemaVersion, 2);
  assert.equal(lock.acceptedRfc, "RFC-008");
  assert.equal(lock.profile.renderer, "PDF/A-2a+PDF/UA-1");
  assert.equal(lock.profile.rendererArgument, "--pdf-standard=a-2a,ua-1");
  assert.deepEqual(lock.profile.validatorFlavours, ["2a", "ua1"]);
  assert.deepEqual(lock.requiredRendererArguments, [
    "compile",
    "--root=<disk-backed-staging-root>",
    "--font-path=<lock-owned-font-directory>",
    "--ignore-system-fonts",
    "--ignore-embedded-fonts",
    "--creation-timestamp=1785196800",
    "--pdf-standard=a-2a,ua-1",
    "--diagnostic-format=short"
  ]);
  assert.equal(lock.tools.renderer.name, "Typst");
  assert.equal(lock.tools.renderer.version, "0.15.0");
  assert.equal(lock.tools.renderer.license, "Apache-2.0");
  assert.equal(lock.tools.structuralValidator.version, "1.28.2");
  assert.equal(lock.tools.profileValidator.flavour, "2a");
  assert.equal(lock.tools.javaRuntime.version, "21.0.11+10");
  assert.equal(lock.tools.pdfParser.version, "12.3.2");
  assert.equal(lock.tools.visualRasterizer.version, "10.07.1");
  assert.equal(lock.tools.visualComparator.version, "7.1.2-24");
});

test("PDF tool, runtime, renderer, and font locks contain verifiable pins", () => {
  for (const artifact of lock.tools.renderer.artifacts) assert.match(artifact.sha256, sha256);
  assert.match(lock.tools.structuralValidator.sha256, sha256);
  for (const artifact of lock.tools.javaRuntime.artifacts) assert.match(artifact.sha256, sha256);
  assert.match(lock.tools.pdfParser.sha256, sha256);
  assert.match(lock.tools.visualRasterizer.sha256, sha256);
  assert.match(lock.fonts[0].sha256, sha256);
  assert.match(lock.tools.visualComparator.repositoryLock, /^https:\/\//);
  assert.match(lock.tools.renderer.repositoryLock, /^https:\/\//);
  assert.equal(lock.fonts[0].fallback.includes("forbidden"), true);
  assert.deepEqual(
    lock.tools.renderer.artifacts.map(({ platform, architecture }) => `${platform}:${architecture}`).sort(),
    ["macos-14-arm64:arm64", "macos-x86_64:x86_64"]
  );
});

test("semantic fixture covers the accepted platform without treating the unrun CI boundary as accepted", () => {
  assert.deepEqual(lock.supportedPlatforms.map(({ id }) => id), ["macos-x86_64"]);
  assert.deepEqual(fixture.platforms.map(({ id }) => id), ["macos-x86_64"]);
  assert.equal(fixture.platforms[0].status, "passed-2026-07-28");
  assert.equal(fixture.platforms[0].command.includes("--pdf-standard"), true);
  assert.equal(fixture.platforms[0].command.includes("a-2a,ua-1"), true);
  assert.equal(fixture.platforms[0].command.includes("--ignore-system-fonts"), true);
  assert.equal(fixture.platforms[0].command.includes("--ignore-embedded-fonts"), true);
  assert.equal(fixture.ciBoundary.workflowLabel, "macos-14");
  assert.equal(fixture.ciBoundary.status, "locked-but-not-yet-a-release-platform");

  const typst = readFileSync(resolve(root, "tests/fixtures/publishing/pdf/semantic-book.typ"), "utf8");
  assert.match(typst, /title: "PDF Toolchain Compatibility Fixture"/);
  assert.match(typst, /author: "Fixture Author"/);
  assert.match(typst, /#set text\(font: "Noto Serif", lang: "en"/);
  assert.match(typst, /= Chapter one <chapter-one>/);
  assert.match(typst, /#link\(<table-one>\)\[internal link\]/);
  assert.match(typst, /#link\("https:\/\/example\.com\/"\)\[external link\]/);
  assert.match(typst, /alt: "A navy rectangle used by the compatibility fixture\."/);
  assert.match(typst, /table\.header\(\[Name\], \[Value\]\)/);
  assert.equal(existsSync(resolve(root, "tests/fixtures/publishing/pdf/semantic-book.html")), false);
});

test("the waiver example cannot be mistaken for an approval and has bounded fields", () => {
  assert.equal(waiver.exampleOnly, true);
  for (const field of ["candidateHash", "scope", "risk", "mitigation", "approvedBy", "expiresAt", "remediation"]) {
    assert.ok(waiver[field], `waiver example must contain ${field}`);
  }
  assert.match(waiver.expiresAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("compatibility evidence records both validated standards and no untested platform claim", () => {
  assert.equal(macosEvidence.platform.id, "macos-x86_64");
  assert.equal(macosEvidence.overallResult, "passed-for-macos-x86_64-compatibility-fixture");
  assert.equal(macosEvidence.outputs.retainedPdf, false);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "render").exitCode, 0);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "parse").exitCode, 0);
  for (const name of ["validate-pdfa-2a", "validate-pdfua-1"]) {
    const validation = macosEvidence.commands.find((command) => command.name === name);
    assert.equal(validation.compliant, true);
    assert.equal(validation.failedRules, 0);
    assert.equal(validation.failedChecks, 0);
    assert.match(validation.reportSha256, sha256);
  }
  assert.match(macosEvidence.outputs.pdfSha256, sha256);
});
