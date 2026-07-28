import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT } from "../lib.mjs";
import { PLATFORM_JOB_DIRECTORY } from "./constants.mjs";
import { validatePlatformRecord } from "./model.mjs";
import { redactLog, safePlatformPath } from "./security.mjs";
import { WorkflowLedger } from "../lifecycle/ledger.mjs";

const cli = resolve(ROOT, "bin", "rtb-publishing.mjs");
const research = resolve(ROOT, "research", "topics", "customer-validation-before-mvp", "research.yaml");
const kit = resolve(ROOT, "examples", "ai-launch-copilot", "rtb-publishing.project.yaml");
const jobId = () => `JOB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

export function workflowCommand(projectId, workflow, id) {
  const commands = {
    "rtb-publishing-core:quality-check": ["pnpm", "check"],
    "rtb-publishing-core:research-validate": [process.execPath, cli, "research", "validate", research],
    "rtb-publishing-core:agent-review-fake": [process.execPath, cli, "agent", "run", "research-reviewer", "--subject", research, "--provider", "fake", "--run-id", id.replace("JOB-", "RUN-"), "--output", resolve(ROOT, ".rtb-publishing", "agent-runs", id.replace("JOB-", "RUN-"))],
    "ai-launch-copilot:kit-check": [process.execPath, cli, "generate", kit, "--check"]
  };
  const command = commands[`${projectId}:${workflow}`];
  if (!command) throw new Error(`Workflow ${workflow} is not allowed for ${projectId}.`);
  return command;
}

export function normalizeJob(job) {
  job.startedAt ??= null;
  job.completedAt ??= ["passed", "failed", "cancelled"].includes(job.status) ? job.updatedAt : null;
  job.durationMs ??= job.startedAt && job.completedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : null;
  job.outputTruncated ??= false;
  job.terminationReason ??= ["passed", "failed"].includes(job.status) ? "legacy-terminal-state" : null;
  job.operationState ??= job.status === "passed" ? "succeeded" : job.status === "cancelled" ? "cancelled" : job.status === "failed" ? "failed-terminal" : job.status;
  return job;
}

function defaultExecutor(command, onOutput, registerCancel) {
  return new Promise((done) => {
    const child = spawn(command[0], command.slice(1), { cwd: ROOT, shell: false, env: { ...process.env, OPENAI_API_KEY: "" } });
    registerCancel(() => child.kill("SIGTERM"));
    child.stdout.on("data", onOutput); child.stderr.on("data", onOutput);
    child.on("error", (error) => done({ exitCode: 1, output: error.message }));
    child.on("close", (code) => done({ exitCode: code ?? 1, output: "" }));
  });
}

const displayStatus = (operationState) => ({ queued: "queued", running: "running", cancelled: "cancelled", succeeded: "passed", stale: "failed", "failed-retryable": "failed", "failed-terminal": "failed", blocked: "failed" }[operationState] ?? "failed");

/** The JSON files are an inspectable projection. SQLite is the job authority. */
export class JobManager {
  constructor({ directory = PLATFORM_JOB_DIRECTORY, executor = defaultExecutor, now = () => new Date().toISOString(), ledger } = {}) {
    this.directory = safePlatformPath(directory, { mustExist: false }).absolute;
    mkdirSync(this.directory, { recursive: true });
    this.executor = executor; this.now = now;
    this.ledger = ledger ?? new WorkflowLedger({ file: resolve(this.directory, "workflow-ledger.sqlite"), now: () => Date.parse(this.now()) });
    this.ledger.recoverStale({ olderThanMs: 0 });
    this.queue = []; this.active = false; this.cancelHandlers = new Map(); this.jobs = new Map();
    for (const file of readdirSync(this.directory).filter((name) => name.endsWith(".json")).sort()) {
      const job = normalizeJob(JSON.parse(readFileSync(resolve(this.directory, file), "utf8")));
      if (job.runId) this.syncProjection(job);
      else if (["queued", "running"].includes(job.status)) { job.status = "failed"; job.operationState = "stale"; job.updatedAt = this.now(); job.completedAt = job.updatedAt; job.terminationReason = "platform-restart"; job.log = redactLog(`${job.log}\nInterrupted by platform restart.`); }
      this.jobs.set(job.id, validatePlatformRecord("workflow-job", job)); this.save(job);
    }
  }

  save(job) { validatePlatformRecord("workflow-job", job); writeFileSync(resolve(this.directory, `${job.id}.json`), `${JSON.stringify(job, null, 2)}\n`); }

  syncProjection(job) {
    const run = this.ledger.get(job.runId); if (!run) return job;
    job.operationState = run.visible_state; job.status = displayStatus(run.visible_state);
    if (["succeeded", "cancelled", "failed-retryable", "failed-terminal", "stale", "blocked"].includes(run.visible_state)) {
      job.completedAt ??= this.now(); job.updatedAt = this.now(); job.terminationReason ??= run.visible_state;
      job.durationMs ??= job.startedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : null;
    }
    return job;
  }

  create(projectId, workflow, parentJobId, { idempotencyKey, inputFingerprint } = {}) {
    const id = jobId(), createdAt = this.now(), command = workflowCommand(projectId, workflow, id);
    idempotencyKey ??= id;
    const submission = this.ledger.submit({ projectId, operationKind: workflow, idempotencyKey, inputFingerprint: inputFingerprint ?? JSON.stringify(command) });
    if (!submission.created) {
      if (submission.state === "conflict") throw new Error("This command identity was already used with different inputs.");
      const existing = this.list().find((item) => item.runId === submission.runId);
      if (existing) return this.syncProjection(existing);
      throw new Error("The existing durable command has no inspectable job projection.");
    }
    const attempt = submission.attempt;
    const job = { schemaVersion: 1, id, projectId, workflow, status: "queued", createdAt, updatedAt: createdAt, startedAt: null, completedAt: null, durationMs: null, command: command.map((part) => part.startsWith(ROOT) ? part.slice(ROOT.length + 1) : part), log: "Queued for local execution.", outputTruncated: false, terminationReason: null, ...(parentJobId ? { parentJobId } : {}), exitCode: null, runId: submission.runId, stageId: attempt.stage_id, attemptId: attempt.attempt_id, idempotencyKey, operationState: "queued" };
    this.jobs.set(id, job); this.save(job); this.queue.push({ job, command }); void this.drain(); return job;
  }

  async drain() {
    if (this.active) return;
    const entry = this.queue.shift(); if (!entry) return;
    this.active = true;
    const { job, command } = entry, owner = `platform-${job.id}`;
    const claimed = this.ledger.claim(job.runId, owner);
    if (!claimed) { this.syncProjection(job); this.save(job); this.active = false; void this.drain(); return; }
    job.attemptId = claimed.attempt_id; job.stageId = claimed.stage_id; job.operationState = "running"; job.status = "running"; job.startedAt = this.now(); job.updatedAt = job.startedAt; job.log = "Started local workflow.\n"; this.save(job);
    const result = await this.executor(command, (chunk) => {
      this.ledger.heartbeat(job.attemptId, owner, claimed.fencingToken);
      const combined = job.log + chunk.toString(); job.outputTruncated ||= combined.length > 20000; job.log = redactLog(combined); job.updatedAt = this.now(); this.save(job);
    }, (cancel) => this.cancelHandlers.set(job.id, cancel));
    this.cancelHandlers.delete(job.id);
    try {
      const run = this.ledger.get(job.runId);
      if (run?.visible_state === "cancelled") { job.operationState = "cancelled"; job.status = "cancelled"; job.terminationReason = "human-cancelled"; }
      else {
        this.ledger.finish(job.attemptId, owner, claimed.fencingToken, result.exitCode === 0 ? { status: "succeeded" } : { status: "failed", retryClass: "retryable", message: "Local command returned a nonzero exit code." });
        job.operationState = result.exitCode === 0 ? "succeeded" : "failed-retryable"; job.status = displayStatus(job.operationState); job.exitCode = result.exitCode; job.terminationReason = result.exitCode === 0 ? "completed" : "nonzero-exit";
      }
    } catch (error) { job.operationState = "stale"; job.status = "failed"; job.terminationReason = "fence-lost"; job.log = redactLog(`${job.log}\n${error.message}`); }
    const combined = job.log + (result.output ?? ""); job.outputTruncated ||= combined.length > 20000; job.log = redactLog(combined); job.completedAt = this.now(); job.updatedAt = job.completedAt; job.durationMs = Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)); this.save(job);
    this.active = false; void this.drain();
  }

  list() { return [...this.jobs.values()].map((job) => this.syncProjection(job)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  snapshot() { return this.list().map((job) => ({ ...job, queuePosition: job.operationState === "queued" ? this.queue.findIndex((entry) => entry.job.id === job.id) + 1 : null, progress: job.operationState === "queued" ? "waiting" : job.operationState === "running" ? "executing" : "complete", recoveryHint: ["stale", "failed-retryable", "blocked"].includes(job.operationState) ? "Review the durable operation state before retrying." : job.operationState === "cancelled" ? "This job was intentionally stopped. Submit a new command when ready." : null })); }
  get(id) { const job = this.jobs.get(id); return job && this.syncProjection(job); }
  cancel(id) { const job = this.get(id); if (!job) throw new Error(`Job not found: ${id}`); if (!["queued", "running"].includes(job.operationState)) throw new Error(`Job ${id} is already ${job.operationState}.`); this.queue = this.queue.filter((entry) => entry.job.id !== id); if (!this.ledger.cancel(job.runId)) throw new Error("The durable job could not be cancelled."); this.cancelHandlers.get(id)?.(); job.operationState = "cancelled"; job.status = "cancelled"; job.completedAt = this.now(); job.updatedAt = job.completedAt; job.durationMs = job.startedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : 0; job.terminationReason = "human-cancelled"; job.log = redactLog(`${job.log}\nCancelled by the local operator.`); this.save(job); return job; }
  rerun(id) { const job = this.get(id); if (!job) throw new Error(`Job not found: ${id}`); if (job.operationState === "cancelled") return this.create(job.projectId, job.workflow, job.id, { idempotencyKey: `${job.id}:resubmitted:${Date.now()}` }); const retry = this.ledger.retry(job.runId); const nextId = jobId(), createdAt = this.now(), next = { ...job, id: nextId, parentJobId: job.id, status: "queued", operationState: "queued", createdAt, updatedAt: createdAt, startedAt: null, completedAt: null, durationMs: null, exitCode: null, terminationReason: null, log: "Queued durable retry.", attemptId: retry.attempt.attempt_id, stageId: retry.attempt.stage_id };
    this.jobs.set(next.id, next); this.save(next); this.queue.push({ job: next, command: workflowCommand(next.projectId, next.workflow, next.id) }); void this.drain(); return next; }
}
