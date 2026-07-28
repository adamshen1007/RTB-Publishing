import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { promoteRelease } from "../scripts/publishing/project-build.mjs";

test("release promotion preserves the prior release until a verified staging directory is ready", () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), "rtb-promotion-")), release = resolve(outputRoot, "book"), staging = resolve(outputRoot, ".staging", "book-new");
  try {
    mkdirSync(release); mkdirSync(staging, { recursive: true }); writeFileSync(resolve(release, "manifest.json"), "legacy"); writeFileSync(resolve(staging, "manifest.json"), "new");
    assert.equal(readFileSync(resolve(release, "manifest.json"), "utf8"), "legacy");
    promoteRelease(staging, release, outputRoot);
    assert.equal(readFileSync(resolve(release, "manifest.json"), "utf8"), "new"); assert.equal(existsSync(staging), false);
  } finally { rmSync(outputRoot, { recursive: true, force: true }); }
});

test("release promotion recovers an interrupted prior-directory rename before retrying", () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), "rtb-promotion-retry-")), release = resolve(outputRoot, "book"), backup = resolve(outputRoot, ".staging", "book.previous"), staging = resolve(outputRoot, ".staging", "book-new");
  try {
    mkdirSync(backup, { recursive: true }); mkdirSync(staging); writeFileSync(resolve(backup, "manifest.json"), "legacy"); writeFileSync(resolve(staging, "manifest.json"), "new");
    promoteRelease(staging, release, outputRoot);
    assert.equal(readFileSync(resolve(release, "manifest.json"), "utf8"), "new"); assert.equal(existsSync(backup), false);
  } finally { rmSync(outputRoot, { recursive: true, force: true }); }
});
