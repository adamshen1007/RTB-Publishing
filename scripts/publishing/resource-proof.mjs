import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, openSync, closeSync, ftruncateSync, readFileSync, rmSync, statSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJson } from "./common.mjs";

export async function streamResourceFixture(fixture, { chunkBytes = 8 * 1024 * 1024 } = {}) {
  if (chunkBytes > 8 * 1024 * 1024) throw new Error("Publishing resource proof chunks may not exceed 8 MiB.");
  const rss = () => typeof process.memoryUsage.rss === "function" ? process.memoryUsage.rss() : process.memoryUsage().rss;
  const baseline = rss(); let peak = baseline, maximumChunk = 0, processed = 0; const digest = createHash("sha256");
  for await (const chunk of createReadStream(fixture, { highWaterMark: chunkBytes })) { maximumChunk = Math.max(maximumChunk, chunk.length); processed += chunk.length; digest.update(chunk); peak = Math.max(peak, rss()); }
  const fixtureBytes = statSync(fixture).size, report = { schemaVersion: 1, fixtureBytes, processedBytes: processed, maximumChunkBytes: maximumChunk, baselineRssBytes: baseline, peakRssBytes: peak, rssIncreaseBytes: peak - baseline, rssLimitBytes: 128 * 1024 * 1024, sha256: digest.digest("hex"), diskBacked: true, releasePipelineConsumed: true, passed: processed === fixtureBytes && maximumChunk <= 8 * 1024 * 1024 && peak - baseline <= 128 * 1024 * 1024 };
  if (!report.passed) throw new Error(`Disk-backed resource proof failed: ${JSON.stringify(report)}`); return report;
}

export async function proveDiskBackedProcessing({ sizeBytes = 512 * 1024 * 1024, chunkBytes = 8 * 1024 * 1024, directory = resolve(tmpdir(), `rtb-resource-proof-${process.pid}`), keep = false } = {}) {
  mkdirSync(directory, { recursive: true }); const fixture = resolve(directory, "fixture.bin"), descriptor = openSync(fixture, "w"); ftruncateSync(descriptor, sizeBytes); closeSync(descriptor);
  try { return await streamResourceFixture(fixture, { chunkBytes }); } finally { if (!keep) rmSync(directory, { recursive: true, force: true }); }
}

function processTreeRss(rootPid) { const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).map(Number)), descendants = new Set([rootPid]); let changed = true; while (changed) { changed = false; for (const [pid, ppid] of rows) if (descendants.has(ppid) && !descendants.has(pid)) { descendants.add(pid); changed = true; } } return rows.filter(([pid]) => descendants.has(pid)).reduce((sum, row) => sum + row[2] * 1024, 0); }

export async function proveReleasePipelineResources({ output } = {}) {
  const directory = resolve(tmpdir(), `rtb-pipeline-proof-${process.pid}`), fixtureDirectory = resolve(directory, "fixture"), fixture = resolve(fixtureDirectory, "fixture.bin"), phaseFile = resolve(directory, "pipeline-streaming.json"); mkdirSync(fixtureDirectory, { recursive: true }); const descriptor = openSync(fixture, "w"); ftruncateSync(descriptor, 512 * 1024 * 1024); closeSync(descriptor);
  const child = spawn(process.execPath, [resolve("scripts/publishing/project-build.mjs"), "--resource-fixture", fixture, "--resource-report", phaseFile], { cwd: resolve("."), env: process.env, stdio: ["ignore", "ignore", "pipe"] }); let idle = 0, peak = 0, stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; }); try { idle = processTreeRss(child.pid); peak = idle; } catch { /* first sample follows */ } const sampler = setInterval(() => { try { peak = Math.max(peak, processTreeRss(child.pid)); } catch { /* process exited between samples */ } }, 50); const code = await new Promise((done) => child.on("close", done)); clearInterval(sampler);
  let streaming = null; try { streaming = JSON.parse(readFileSync(phaseFile, "utf8")); } catch { /* report remains absent on failed build */ }
  const increase = Math.max(0, peak - idle), limit = 384 * 1024 * 1024, report = { schemaVersion: 1, fixture: { composition: "512 MiB sparse disk-backed fixture consumed and hash-bound by the complete YC release pipeline", bytes: streaming?.fixtureBytes ?? 512 * 1024 * 1024, sha256: streaming?.sha256 ?? null }, maximumChunkBytes: streaming?.maximumChunkBytes ?? null, streamingRssIncreaseBytes: streaming?.rssIncreaseBytes ?? null, environment: { os: process.platform, architecture: process.arch, node: process.version }, measurement: { boundary: "orchestrator and all descendant processes", samplingIntervalMs: 50, idleBaselineRssBytes: idle, aggregatePeakRssBytes: peak, aggregateIncreaseRssBytes: increase, limitBytes: limit }, buildExitCode: code, passed: code === 0 && streaming?.passed === true && streaming.releasePipelineConsumed === true && increase <= limit };
  rmSync(directory, { recursive: true, force: true }); if (output) writeJson(output, report); if (!report.passed) throw new Error(`Aggregate release resource proof failed: ${JSON.stringify(report)}\n${stderr.slice(-2000)}`); return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const pipeline = process.argv[2] === "--pipeline", output = process.argv[pipeline ? 3 : 2]; const report = pipeline ? await proveReleasePipelineResources({ output }) : await proveDiskBackedProcessing(); if (output && !pipeline) writeJson(output, report); console.log(JSON.stringify(report)); }
