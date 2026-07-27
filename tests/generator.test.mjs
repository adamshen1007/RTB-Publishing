import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { stringify } from "yaml";
import { ROOT } from "../scripts/lib.mjs";
import { GENERATED_MARKER } from "../scripts/generator/constants.mjs";
import { generateKit, hash } from "../scripts/generator/generator.mjs";
import { createManifest, loadManifest, resolveOutputDirectory } from "../scripts/generator/manifest.mjs";
import { renderKit } from "../scripts/generator/templates.mjs";

const snapshot = JSON.parse(readFileSync(resolve(ROOT, "tests", "snapshots", "basic-kit.json"), "utf8"));
const temporaryRoot = resolve(ROOT, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });

function values(overrides = {}) {
  return {
    name: "AI Launch Copilot",
    slug: "ai-launch-copilot",
    description: "A guided launch workspace for first-time AI product founders.",
    owner: "Example Founder",
    audience: "First-time founders preparing an AI product launch",
    problem: "Founders struggle to turn an early AI prototype into a focused, evidence-backed launch plan.",
    stage: "validation",
    output: ".",
    ...overrides
  };
}

function fixture(overrides = {}) {
  const directory = mkdtempSync(resolve(temporaryRoot, "generator-"));
  const manifestFile = resolve(directory, "rtb-publishing.project.yaml");
  writeFileSync(manifestFile, stringify(createManifest(values(overrides))));
  return { directory, manifestFile };
}

function cleanup(directory) {
  rmSync(directory, { recursive: true, force: true });
}

test("rendered kit matches the committed content snapshot", () => {
  const actual = Object.fromEntries(renderKit(createManifest(values())).map((file) => [file.path, hash(file.content)]));
  assert.deepEqual(actual, snapshot);
});

test("first generation creates the complete kit and deterministic state", () => {
  const { directory, manifestFile } = fixture();
  try {
    const first = generateKit(manifestFile);
    assert.equal(first.changes.length, 8);
    assert.ok(first.files.every((file) => file.content.startsWith(GENERATED_MARKER)));
    const stateFile = resolve(directory, ".rtb-publishing", "generation-state.json");
    assert.ok(existsSync(stateFile));
    const stateBefore = readFileSync(stateFile, "utf8");
    const second = generateKit(manifestFile);
    assert.equal(second.changes.length, 0);
    assert.equal(readFileSync(stateFile, "utf8"), stateBefore);
  } finally {
    cleanup(directory);
  }
});

test("invalid manifest values return actionable validation errors", () => {
  assert.throws(() => createManifest(values({ slug: "Unsafe Slug" })), /project\/slug.*pattern/);
  assert.throws(() => createManifest(values({ stage: "idea" })), /product\/stage.*allowed values/);
});

test("unsafe output paths are rejected", () => {
  const { directory, manifestFile } = fixture({ output: "../../../../outside" });
  try {
    const loaded = loadManifest(manifestFile);
    assert.throws(() => resolveOutputDirectory(loaded.manifest, manifestFile), /inside this repository/);
  } finally {
    cleanup(directory);
  }
});

test("symbolic-link output paths are rejected", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "generator-symlink-"));
  const target = mkdtempSync(resolve(temporaryRoot, "generator-target-"));
  const manifestFile = resolve(directory, "rtb-publishing.project.yaml");
  try {
    symlinkSync(target, resolve(directory, "redirect"));
    writeFileSync(manifestFile, stringify(createManifest(values({ output: "redirect" }))));
    assert.throws(() => generateKit(manifestFile), /cannot traverse symbolic link/);
  } finally {
    cleanup(directory);
    cleanup(target);
  }
});

test("an unowned existing file blocks first generation", () => {
  const { directory, manifestFile } = fixture();
  try {
    writeFileSync(resolve(directory, "README.md"), "# User-owned README\n");
    assert.throws(() => generateKit(manifestFile), /protect user-owned changes/);
    assert.equal(readFileSync(resolve(directory, "README.md"), "utf8"), "# User-owned README\n");
  } finally {
    cleanup(directory);
  }
});

test("modified generated files require force and force restores the template", () => {
  const { directory, manifestFile } = fixture();
  try {
    generateKit(manifestFile);
    const readme = resolve(directory, "README.md");
    appendFileSync(readme, "\nHuman change\n");
    assert.throws(() => generateKit(manifestFile), /Use --force/);
    assert.match(readFileSync(readme, "utf8"), /Human change/);
    const forced = generateKit(manifestFile, { force: true });
    assert.ok(forced.changes.some((file) => file.path === "README.md"));
    assert.doesNotMatch(readFileSync(readme, "utf8"), /Human change/);
  } finally {
    cleanup(directory);
  }
});

test("manifest changes update untouched generated files", () => {
  const { directory, manifestFile } = fixture();
  try {
    generateKit(manifestFile);
    const loaded = loadManifest(manifestFile).manifest;
    loaded.project.description = "An updated project description.";
    writeFileSync(manifestFile, stringify(loaded));
    const regenerated = generateKit(manifestFile);
    assert.ok(regenerated.changes.some((file) => file.action === "update"));
    assert.match(readFileSync(resolve(directory, "README.md"), "utf8"), /An updated project description/);
  } finally {
    cleanup(directory);
  }
});

test("check mode detects template drift without writing", () => {
  const { directory, manifestFile } = fixture();
  try {
    generateKit(manifestFile);
    const readme = resolve(directory, "README.md");
    writeFileSync(readme, readFileSync(readme, "utf8").replace("## Problem", "## User Problem"));
    assert.throws(() => generateKit(manifestFile, { check: true }), /protect user-owned changes/);
    assert.match(readFileSync(readme, "utf8"), /## User Problem/);
  } finally {
    cleanup(directory);
  }
});

test("non-interactive create builds a complete first project", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "cli-create-"));
  try {
    const result = spawnSync(process.execPath, [resolve(ROOT, "bin", "rtb-publishing.mjs"), "create", "cli-project",
      "--name", "CLI Project", "--description", "A project created by the command-line integration test.",
      "--owner", "Test Owner", "--audience", "Test users", "--problem", "Test users need a deterministic starter kit.",
      "--stage", "discovery", "--output", directory, "--non-interactive"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(resolve(directory, "rtb-publishing.project.yaml")));
    assert.ok(existsSync(resolve(directory, "planning", "verification-plan.md")));
    assert.match(result.stdout, /create\s+README\.md/);
  } finally {
    cleanup(directory);
  }
});

test("non-interactive create reports missing values without writing", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "cli-missing-"));
  cleanup(directory);
  const result = spawnSync(process.execPath, [resolve(ROOT, "bin", "rtb-publishing.mjs"), "create", "incomplete-project",
    "--output", directory, "--non-interactive"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required create options/);
  assert.equal(existsSync(directory), false);
});

test("create dry-run reports the complete kit without writing", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "cli-dry-run-"));
  cleanup(directory);
  const result = spawnSync(process.execPath, [resolve(ROOT, "bin", "rtb-publishing.mjs"), "create", "dry-run-project",
    "--name", "Dry Run Project", "--description", "A project that must not be written.",
    "--owner", "Test Owner", "--audience", "Test users", "--problem", "Test users need safe previews.",
    "--output", directory, "--non-interactive", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Would create manifest/);
  assert.match(result.stdout, /create\s+planning\/verification-plan\.md/);
  assert.equal(existsSync(directory), false);
});
