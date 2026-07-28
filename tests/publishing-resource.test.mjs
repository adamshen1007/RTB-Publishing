import assert from "node:assert/strict";
import test from "node:test";
import { proveDiskBackedProcessing } from "../scripts/publishing/resource-proof.mjs";
test("PER-001 through PER-003 process a 512 MiB sparse fixture in bounded disk-backed chunks", { timeout: 30_000 }, async () => { const report = await proveDiskBackedProcessing(); assert.equal(report.fixtureBytes, 512 * 1024 * 1024); assert.equal(report.processedBytes, report.fixtureBytes); assert.ok(report.maximumChunkBytes <= 8 * 1024 * 1024); assert.ok(report.rssIncreaseBytes <= 128 * 1024 * 1024); });
