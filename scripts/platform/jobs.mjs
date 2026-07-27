import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT } from "../lib.mjs";
import { PLATFORM_JOB_DIRECTORY } from "./constants.mjs";
import { validatePlatformRecord } from "./model.mjs";
import { redactLog, safePlatformPath } from "./security.mjs";

const cli = resolve(ROOT, "bin", "rtb-publishing.mjs");
const research = resolve(ROOT, "research", "topics", "customer-validation-before-mvp", "research.yaml");
const kit = resolve(ROOT, "examples", "ai-launch-copilot", "rtb-publishing.project.yaml");

export function workflowCommand(projectId, workflow, jobId) {
  const key = `${projectId}:${workflow}`;
  const commands = {
    "rtb-publishing-core:quality-check": ["pnpm", "check"],
    "rtb-publishing-core:research-validate": [process.execPath, cli, "research", "validate", research],
    "rtb-publishing-core:agent-review-fake": [process.execPath, cli, "agent", "run", "research-reviewer", "--subject", research, "--provider", "fake", "--run-id", jobId.replace("JOB-", "RUN-"), "--output", resolve(ROOT, ".rtb-publishing", "agent-runs", jobId.replace("JOB-", "RUN-"))],
    "ai-launch-copilot:kit-check": [process.execPath, cli, "generate", kit, "--check"]
  };
  if (!commands[key]) throw new Error(`Workflow ${workflow} is not allowed for ${projectId}.`);
  return commands[key];
}

export function normalizeJob(job) {
  job.startedAt ??= null;
  job.completedAt ??= ["passed", "failed", "cancelled"].includes(job.status) ? job.updatedAt : null;
  job.durationMs ??= job.startedAt && job.completedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : null;
  job.outputTruncated ??= false;
  job.terminationReason ??= ["passed", "failed"].includes(job.status) ? "legacy-terminal-state" : null;
  return job;
}

function defaultExecutor(command, onOutput, registerCancel) {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0], command.slice(1), { cwd: ROOT, shell: false, env: { ...process.env, OPENAI_API_KEY: "" } });
    registerCancel(() => child.kill("SIGTERM"));
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("error", (error) => resolvePromise({ exitCode: 1, output: error.message }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, output: "" }));
  });
}

export class JobManager {
  constructor({ directory = PLATFORM_JOB_DIRECTORY, executor = defaultExecutor, now = () => new Date().toISOString() } = {}) {
    this.directory = safePlatformPath(directory, { mustExist: false }).absolute;
    this.executor = executor;
    this.now = now;
    this.queue = [];
    this.active = false;
    this.cancelHandlers = new Map();
    mkdirSync(this.directory, { recursive: true });
    this.jobs = new Map();
    for (const file of readdirSync(this.directory).filter((name) => name.endsWith(".json")).sort()) {
      const job = normalizeJob(JSON.parse(readFileSync(resolve(this.directory, file), "utf8")));
      if (["queued", "running"].includes(job.status)) {
        job.status = "failed";
        job.updatedAt = this.now();
        job.completedAt = this.now();
        job.durationMs = job.startedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : null;
        job.terminationReason = "platform-restart";
        job.exitCode = 1;
        job.log = redactLog(`${job.log}\nInterrupted by platform restart.`);
        this.save(job);
      }
      this.jobs.set(job.id, validatePlatformRecord("workflow-job", job));
    }
  }

  save(job) {
    validatePlatformRecord("workflow-job", job);
    writeFileSync(resolve(this.directory, `${job.id}.json`), `${JSON.stringify(job, null, 2)}\n`);
  }

  create(projectId, workflow, parentJobId) {
    const id = `JOB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const timestamp = this.now();
    const job = { schemaVersion: 1, id, projectId, workflow, status: "queued", createdAt: timestamp, updatedAt: timestamp, startedAt: null, completedAt: null, durationMs: null, command: workflowCommand(projectId, workflow, id).map((part) => part.startsWith(ROOT) ? part.slice(ROOT.length + 1) : part), log: "Queued for local execution.", outputTruncated: false, terminationReason: null, ...(parentJobId ? { parentJobId } : {}), exitCode: null };
    this.jobs.set(id, job);
    this.save(job);
    this.queue.push({ job, command: workflowCommand(projectId, workflow, id) });
    void this.drain();
    return job;
  }

  async drain() {
    if (this.active) return;
    const entry = this.queue.shift();
    if (!entry) return;
    this.active = true;
    const { job, command } = entry;
    job.status = "running";
    job.startedAt = this.now();
    job.updatedAt = this.now();
    job.log = "Started local workflow.\n";
    this.save(job);
    const result = await this.executor(command, (chunk) => {
      const combined = job.log + chunk.toString();
      job.outputTruncated ||= combined.length > 20000;
      job.log = redactLog(combined);
      job.updatedAt = this.now();
      this.save(job);
    }, (cancel) => this.cancelHandlers.set(job.id, cancel));
    this.cancelHandlers.delete(job.id);
    if (job.status !== "cancelled") {
      const combined = job.log + (result.output ?? "");
      job.outputTruncated ||= combined.length > 20000;
      job.log = redactLog(combined);
      job.exitCode = result.exitCode;
      job.status = result.exitCode === 0 ? "passed" : "failed";
      job.terminationReason = result.exitCode === 0 ? "completed" : "nonzero-exit";
      job.completedAt = this.now();
      job.durationMs = Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt));
      job.updatedAt = job.completedAt;
    }
    this.save(job);
    this.active = false;
    void this.drain();
  }

  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  snapshot() { return this.list().map((job) => ({
    ...job,
    queuePosition: job.status === "queued" ? this.queue.findIndex((entry) => entry.job.id === job.id) + 1 : null,
    progress: job.status === "queued" ? "waiting" : job.status === "running" ? "executing" : "complete",
    recoveryHint: job.status === "failed" ? (job.terminationReason === "platform-restart" ? "The platform stopped during execution. Review the log, correct the cause, then run again." : "Review the bounded log, correct the reported cause, then run again as a new job.") : job.status === "cancelled" ? "This job was intentionally stopped. Run again only when you are ready." : null
  })); }
  get(id) { return this.jobs.get(id); }
  cancel(id) {
    const job = this.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (!new Set(["queued", "running"]).has(job.status)) throw new Error(`Job ${id} is already ${job.status}.`);
    if (job.status === "queued") this.queue = this.queue.filter((entry) => entry.job.id !== id);
    else this.cancelHandlers.get(id)?.();
    job.status = "cancelled";
    job.completedAt = this.now();
    job.updatedAt = job.completedAt;
    job.durationMs = job.startedAt ? Math.max(0, Date.parse(job.completedAt) - Date.parse(job.startedAt)) : 0;
    job.terminationReason = "human-cancelled";
    job.log = redactLog(`${job.log}\nCancelled by the local operator.`);
    this.save(job);
    return job;
  }
  rerun(id) {
    const job = this.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    if (["queued", "running"].includes(job.status)) throw new Error("An active job cannot be rerun.");
    return this.create(job.projectId, job.workflow, job.id);
  }
}
