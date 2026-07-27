import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const lock = readJson("publishing/pdf/toolchain.lock.json");
const fixture = readJson("tests/fixtures/publishing/pdf/compatibility-matrix.json");
const waiver = readJson("tests/fixtures/publishing/pdf/waiver.example.json");

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
  assert.equal(lock.tools.pdfParser.version, "12.3.2");
  assert.equal(lock.tools.visualRasterizer.version, "10.07.1");
  assert.equal(lock.tools.visualComparator.version, "7.1.2-24");
});

test("PDF tool and font artifact locks contain verifiable pins", () => {
  for (const artifact of lock.tools.renderer.artifacts) assert.match(artifact.sha256, sha256);
  assert.match(lock.tools.structuralValidator.sha256, sha256);
  assert.match(lock.tools.pdfParser.sha256, sha256);
  assert.match(lock.tools.visualRasterizer.sha256, sha256);
  assert.match(lock.fonts[0].sha256, sha256);
  assert.match(lock.tools.visualComparator.repositoryLock, /^https:\/\//);
  assert.equal(lock.fonts[0].fallback.includes("forbidden"), true);
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
