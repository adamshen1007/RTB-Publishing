import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const lock = readJson("publishing/pdf/toolchain.lock.json");
const fixture = readJson("tests/fixtures/publishing/pdf/compatibility-matrix.json");
const waiver = readJson("tests/fixtures/publishing/pdf/waiver.example.json");
const macosEvidence = readJson("tests/fixtures/publishing/pdf/evidence/macos-universal-2026-07-27.json");
const ubuntuEvidence = readJson("tests/fixtures/publishing/pdf/evidence/ubuntu-24.04-x86_64-2026-07-27.json");

const sha256 = /^[a-f0-9]{64}$/;

test("RFC-008 locks the combined profile and every required executable", () => {
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.acceptedRfc, "RFC-008");
  assert.equal(lock.profile.renderer, "PDF/A-2a+PDF/UA-1");
  assert.deepEqual(lock.profile.validatorFlavours, ["2a", "ua1"]);
  assert.deepEqual(lock.requiredRendererArguments, [
    "--pdf-profile=PDF/A-2a+PDF/UA-1",
    "--pdf-lang=en-US",
    "--no-system-fonts",
    "--no-artificial-fonts",
    "--fail-safe",
    "--structured-log=buffered"
  ]);
  assert.equal(lock.tools.renderer.version, "16.2");
  assert.equal(lock.tools.structuralValidator.version, "1.28.2");
  assert.equal(lock.tools.profileValidator.flavour, "2a");
  assert.equal(lock.tools.javaRuntime.version, "21.0.11+10");
  assert.equal(lock.tools.pdfParser.version, "12.3.2");
  assert.equal(lock.tools.visualRasterizer.version, "10.07.1");
  assert.equal(lock.tools.visualComparator.version, "7.1.2-24");
});

test("PDF tool and font artifact locks contain verifiable pins", () => {
  for (const artifact of lock.tools.renderer.artifacts) assert.match(artifact.sha256, sha256);
  assert.match(lock.tools.structuralValidator.sha256, sha256);
  for (const artifact of lock.tools.javaRuntime.artifacts) assert.match(artifact.sha256, sha256);
  assert.match(lock.tools.pdfParser.sha256, sha256);
  assert.match(lock.tools.visualRasterizer.sha256, sha256);
  assert.match(lock.fonts[0].sha256, sha256);
  assert.match(lock.tools.visualComparator.repositoryLock, /^https:\/\//);
  assert.equal(lock.fonts[0].fallback.includes("forbidden"), true);
  assert.deepEqual(
    lock.tools.javaRuntime.artifacts.map(({ platform, architecture }) => `${platform}:${architecture}`).sort(),
    ["macos-universal:arm64", "macos-universal:x86_64", "ubuntu-24.04-x86_64:x86_64"]
  );
});

test("compatibility fixture covers each and only each supported platform", () => {
  const lockedPlatforms = lock.supportedPlatforms.map(({ id }) => id).sort();
  const fixturePlatforms = fixture.platforms.map(({ id }) => id).sort();
  assert.deepEqual(fixturePlatforms, lockedPlatforms);
  for (const platform of fixture.platforms) {
    assert.equal(platform.status, "must-run-before-release-use");
    assert.equal(platform.command.includes("--pdf-profile=PDF/A-2a+PDF/UA-1"), true);
    assert.equal(platform.command.includes("--fail-safe"), true);
  }
  const html = readFileSync(resolve(root, "tests/fixtures/publishing/pdf/semantic-book.html"), "utf8");
  assert.match(html, /<html lang="en-US">/);
  assert.match(html, /<title>PDF Toolchain Compatibility Fixture<\/title>/);
  assert.match(html, /<meta name="author"/);
  assert.match(html, /<h1 id="chapter-one">/);
  assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(html, /<img [^>]*alt="A navy rectangle used by the compatibility fixture\."/);
  assert.match(html, /<caption>Fixture values<\/caption>/);
  assert.match(html, /<th scope="col">Name<\/th>/);
  assert.match(html, /href="#table-one"/);
  assert.match(html, /href="https:\/\/example\.com\//);
});

test("the waiver example cannot be mistaken for an approval and has bounded fields", () => {
  assert.equal(waiver.exampleOnly, true);
  for (const field of ["candidateHash", "scope", "risk", "mitigation", "approvedBy", "expiresAt", "remediation"]) {
    assert.ok(waiver[field], `waiver example must contain ${field}`);
  }
  assert.match(waiver.expiresAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("compatibility evidence preserves the actual platform blockers without claiming release eligibility", () => {
  assert.equal(macosEvidence.platform.id, "macos-universal");
  assert.equal(macosEvidence.demoAndLicenceStatus.releaseEligible, false);
  assert.equal(macosEvidence.outputs.retainedPdf, false);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "render").exitCode, 0);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "parse").exitCode, 0);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "validate-pdfa-2a").compliant, true);
  assert.equal(macosEvidence.commands.find(({ name }) => name === "validate-pdfua-1").compliant, false);
  assert.match(macosEvidence.commands.find(({ name }) => name === "validate-pdfua-1").finding, /Popup annotation/);
  assert.equal(ubuntuEvidence.platform.id, "ubuntu-24.04-x86_64");
  assert.equal(ubuntuEvidence.overallResult, "blocked-no-ubuntu-24.04-runtime");
});
