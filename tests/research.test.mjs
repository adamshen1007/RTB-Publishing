import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";
import { ROOT } from "../scripts/lib.mjs";
import { buildResearch, researchHash } from "../scripts/research/generator.mjs";
import { createTopic, loadResearch, serializeResearch } from "../scripts/research/model.mjs";
import { renderResearchBrief } from "../scripts/research/brief.mjs";

const temporaryRoot = resolve(ROOT, ".tmp");
const exampleManifest = resolve(ROOT, "research", "topics", "customer-validation-before-mvp", "research.yaml");
const snapshot = JSON.parse(readFileSync(resolve(ROOT, "tests", "snapshots", "research-brief.json"), "utf8"));
mkdirSync(temporaryRoot, { recursive: true });

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "SRC-001",
    type: "official-guidance",
    sourceClass: "primary",
    title: "Fixture Source",
    author: "Fixture Author",
    publisher: "Fixture Publisher",
    url: "https://example.com/source",
    published: "2025-01-01",
    accessed: "2026-01-01",
    summary: "A source used to validate the research workflow.",
    licenseNote: "Metadata and paraphrased notes only.",
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "EVD-001",
    source: "SRC-001",
    kind: "paraphrase",
    locator: "Main section",
    note: "The fixture source supports a narrow practitioner recommendation.",
    capturedBy: "Test Owner",
    capturedAt: "2026-01-01",
    ...overrides
  };
}

function claim(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "CLM-001",
    statement: "A narrow fixture claim is supported by the source.",
    classification: "source-opinion",
    confidence: "medium",
    status: "accepted",
    evidence: ["EVD-001"],
    limitations: ["The fixture is not real research."],
    contradicts: [],
    ...overrides
  };
}

function fixture(options = {}) {
  const directory = mkdtempSync(resolve(temporaryRoot, "research-"));
  for (const name of ["sources", "evidence", "claims", "outputs"]) mkdirSync(resolve(directory, name), { recursive: true });
  const topic = createTopic({
    id: "fixture-topic",
    title: "Fixture Topic",
    question: "Does the fixture research graph validate?",
    owner: "Test Owner",
    minimumSources: 1,
    freshnessDays: options.freshnessDays ?? 365,
    asOf: options.asOf ?? "2026-01-01"
  });
  const manifestFile = resolve(directory, "research.yaml");
  writeFileSync(manifestFile, serializeResearch(topic));
  writeFileSync(resolve(directory, "sources", "SRC-001.yaml"), serializeResearch(options.source ?? source()));
  writeFileSync(resolve(directory, "evidence", "EVD-001.yaml"), serializeResearch(options.evidence ?? evidence()));
  writeFileSync(resolve(directory, "claims", "CLM-001.yaml"), serializeResearch(options.claim ?? claim()));
  return { directory, manifestFile };
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
}

test("example research brief matches the committed snapshot", () => {
  const content = renderResearchBrief(loadResearch(exampleManifest));
  assert.equal(researchHash(content), snapshot.sha256);
});

test("valid research builds once and regenerates idempotently", () => {
  const { directory, manifestFile } = fixture();
  try {
    const first = buildResearch(manifestFile);
    assert.equal(first.action, "create");
    const stateBefore = readFileSync(resolve(directory, ".rtb-publishing", "research-state.json"), "utf8");
    const second = buildResearch(manifestFile);
    assert.equal(second.action, "unchanged");
    assert.equal(readFileSync(resolve(directory, ".rtb-publishing", "research-state.json"), "utf8"), stateBefore);
  } finally {
    cleanup(directory);
  }
});

test("missing evidence-to-source relationships fail", () => {
  const { directory, manifestFile } = fixture({ evidence: evidence({ source: "SRC-999" }) });
  try {
    assert.throws(() => loadResearch(manifestFile), /references missing source SRC-999/);
  } finally {
    cleanup(directory);
  }
});

test("sourced claims require evidence", () => {
  const { directory, manifestFile } = fixture({ claim: claim({ evidence: [] }) });
  try {
    assert.throws(() => loadResearch(manifestFile), /requires evidence/);
  } finally {
    cleanup(directory);
  }
});

test("synthesis requires at least two distinct sources", () => {
  const { directory, manifestFile } = fixture({ claim: claim({ classification: "synthesis" }) });
  try {
    assert.throws(() => loadResearch(manifestFile), /at least two sources/);
  } finally {
    cleanup(directory);
  }
});

test("long quotations fail the copyright-safe storage limit", () => {
  const excerpt = Array.from({ length: 26 }, (_, index) => `word${index + 1}`).join(" ");
  const { directory, manifestFile } = fixture({ evidence: evidence({ kind: "quote", excerpt }) });
  try {
    assert.throws(() => loadResearch(manifestFile), /25-word storage limit/);
  } finally {
    cleanup(directory);
  }
});

test("freshness is calculated from committed dates", () => {
  const { directory, manifestFile } = fixture({ asOf: "2026-03-15", freshnessDays: 30 });
  try {
    const data = loadResearch(manifestFile);
    assert.equal(data.staleSources.length, 1);
    assert.equal(data.staleSources[0].ageDays, 73);
  } finally {
    cleanup(directory);
  }
});

test("impossible source and evidence dates fail integrity checks", () => {
  const futureSource = fixture({ source: source({ published: "2026-02-01", accessed: "2026-01-01" }) });
  try {
    assert.throws(() => loadResearch(futureSource.manifestFile), /earlier than its publication date/);
  } finally {
    cleanup(futureSource.directory);
  }
  const futureEvidence = fixture({ evidence: evidence({ capturedAt: "2026-02-01" }) });
  try {
    assert.throws(() => loadResearch(futureEvidence.manifestFile), /capture date is later/);
  } finally {
    cleanup(futureEvidence.directory);
  }
});

test("unknown contradiction relationships fail", () => {
  const { directory, manifestFile } = fixture({ claim: claim({ contradicts: ["CLM-999"] }) });
  try {
    assert.throws(() => loadResearch(manifestFile), /contradicts missing claim/);
  } finally {
    cleanup(directory);
  }
});

test("symbolic-link research output is rejected", () => {
  const { directory, manifestFile } = fixture();
  const target = mkdtempSync(resolve(temporaryRoot, "research-target-"));
  try {
    rmSync(resolve(directory, "outputs"), { recursive: true });
    symlinkSync(target, resolve(directory, "outputs"));
    assert.throws(() => buildResearch(manifestFile), /cannot traverse symbolic link/);
  } finally {
    cleanup(directory, target);
  }
});

test("human changes are protected and force restores generated output", () => {
  const { directory, manifestFile } = fixture();
  try {
    buildResearch(manifestFile);
    const output = resolve(directory, "outputs", "research-brief.md");
    appendFileSync(output, "\nHuman research note\n");
    assert.throws(() => buildResearch(manifestFile), /protect human changes/);
    assert.match(readFileSync(output, "utf8"), /Human research note/);
    assert.equal(buildResearch(manifestFile, { force: true }).action, "replace");
    assert.doesNotMatch(readFileSync(output, "utf8"), /Human research note/);
  } finally {
    cleanup(directory);
  }
});

test("check mode detects drift without writing", () => {
  const { directory, manifestFile } = fixture();
  try {
    buildResearch(manifestFile);
    const topic = parse(readFileSync(manifestFile, "utf8"));
    topic.topic.title = "Updated Fixture Topic";
    writeFileSync(manifestFile, serializeResearch(topic));
    assert.throws(() => buildResearch(manifestFile, { check: true }), /out of date/);
    assert.doesNotMatch(readFileSync(resolve(directory, "outputs", "research-brief.md"), "utf8"), /Updated Fixture Topic/);
  } finally {
    cleanup(directory);
  }
});

test("refresh dry-run preserves files and refresh updates review dates", () => {
  const { directory, manifestFile } = fixture();
  try {
    const args = [resolve(ROOT, "bin", "rtb-publishing.mjs"), "research", "refresh", manifestFile, "--as-of", "2026-02-01"];
    const before = readFileSync(manifestFile, "utf8");
    const dryRun = spawnSync(process.execPath, [...args, "--dry-run"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(readFileSync(manifestFile, "utf8"), before);
    const refreshed = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.equal(loadResearch(manifestFile).topic.research.asOf, "2026-02-01");
    assert.equal(loadResearch(manifestFile).sources[0].accessed, "2026-02-01");
  } finally {
    cleanup(directory);
  }
});

test("research create and add-source support a complete CLI first run", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "research-cli-"));
  cleanup(directory);
  try {
    const createResult = spawnSync(process.execPath, [resolve(ROOT, "bin", "rtb-publishing.mjs"), "research", "create", "cli-topic",
      "--title", "CLI Topic", "--question", "Can the CLI create a research topic?", "--owner", "Test Owner",
      "--as-of", "2026-01-01", "--minimum-sources", "1", "--output", directory], { cwd: ROOT, encoding: "utf8" });
    assert.equal(createResult.status, 0, createResult.stderr);
    const manifestFile = resolve(directory, "research.yaml");
    const addResult = spawnSync(process.execPath, [resolve(ROOT, "bin", "rtb-publishing.mjs"), "research", "add-source", manifestFile,
      "--id", "SRC-001", "--type", "official-guidance", "--source-class", "primary", "--title", "CLI Source",
      "--author", "Test Author", "--publisher", "Test Publisher", "--url", "https://example.com/cli",
      "--published", "2025-01-01", "--accessed", "2026-01-01", "--summary", "A CLI source fixture.",
      "--license-note", "Metadata only."], { cwd: ROOT, encoding: "utf8" });
    assert.equal(addResult.status, 0, addResult.stderr);
    assert.ok(existsSync(resolve(directory, "sources", "SRC-001.yaml")));
  } finally {
    cleanup(directory);
  }
});
