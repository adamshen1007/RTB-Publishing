import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { CAPABILITY_IDS, exerciseSyntheticFallback, validateResultRecord } from "../scripts/ghost-capability-spike.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("GHO-001 and GHO-008: result has every classified ADR-012 row and a truthful conditional decision", () => {
  const record = validateResultRecord();
  assert.equal(record.capabilities.length, 10);
  assert.deepEqual(record.capabilities.map(({ id }) => id).sort(), [...CAPABILITY_IDS].sort());
  assert.ok(record.capabilities.every(({ classification }) => classification === "fallback-required"));
  assert.equal(record.decision.status, "conditional-go");
  assert.equal(record.decision.productionGhostCompatibility, false);
});

test("GHO-002 through GHO-006: deterministic fallback exercise proves the selected local boundary", () => {
  assert.deepEqual(exerciseSyntheticFallback(), { capabilitiesExercised: CAPABILITY_IDS, result: "pass", providerCalls: "none" });
});

test("GHO-007: committed spike evidence contains no credentials, real subscribers, or production claims", () => {
  const evidence = read("spikes/ghost/results.sanitized.json") + read("spikes/ghost/fixtures/synthetic-ghost-state.json") + read("spikes/ghost/fixtures/provider-documentation.json");
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--", "spikes/ghost", "scripts/ghost-capability-spike.mjs", "tests/ghost-capability-spike.test.mjs"], { cwd: root, encoding: "utf8" });
  } catch (error) {
    diff = error.stdout ?? "";
  }
  assert.doesNotMatch(evidence, /(?:api[_-]?key|password|secret)\s*[:=]\s*["']?(?!none\b|not-)/i);
  assert.doesNotMatch(evidence, /@(?!example\.test\b)[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(`${evidence}\n${diff}`, /(?:ghp_|gho_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{8,}/);
  assert.match(evidence, /productionGhostCompatibility"\s*:\s*false/);
});

test("the public harness command is deterministic and makes no provider call", () => {
  const first = execFileSync(process.execPath, ["scripts/ghost-capability-spike.mjs"], { cwd: root, encoding: "utf8" });
  const second = execFileSync(process.execPath, ["scripts/ghost-capability-spike.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(first, second);
  const report = JSON.parse(first);
  assert.equal(report.exercise.providerCalls, "none");
});
