import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PLATFORM_WEB_DIRECTORY, LOOPBACK_HOSTS } from "./constants.mjs";
import { agentRunDetail, WorkspaceIndex, researchDetail } from "./indexer.mjs";
import { JobManager } from "./jobs.mjs";
import { safePlatformPath } from "./security.mjs";
import { pilotStatus } from "./operations.mjs";

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const json = (response, status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(body)); };
const validOrigin = (origin) => !origin || /^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/.test(origin);

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 10000) throw new Error("Request body exceeds 10 KB.");
  }
  return value ? JSON.parse(value) : {};
}

export function createPlatformServer(options = {}) {
  const indexService = options.indexService ?? (options.index ? { refresh: () => options.index } : new WorkspaceIndex({ file: options.workspaceFile, localFile: options.localFile }));
  const jobs = options.jobs ?? new JobManager(options.jobOptions);
  const csrfToken = options.csrfToken ?? randomBytes(24).toString("hex");
  const requests = new Map();
  const server = createHttpServer(async (request, response) => {
    try {
      const address = request.socket.remoteAddress ?? "unknown";
      const minute = Math.floor(Date.now() / 60000);
      const rateKey = `${address}:${minute}`;
      const count = (requests.get(rateKey) ?? 0) + 1;
      requests.set(rateKey, count);
      if (count > 120) return json(response, 429, { error: "rate_limit", message: "Too many local requests; wait one minute." });
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/session") return json(response, 200, { csrfToken });
      const index = indexService.refresh();
      if (request.method === "GET" && url.pathname === "/api/workspace") return json(response, 200, { ...index, pilot: pilotStatus(options.pilotDirectory), onboarding: { registeredProjects: index.projects.length, localProjects: index.projects.filter((project) => project.source === "local").length, externalWorkflows: "disabled", nextCommand: "rtb-publishing platform project onboard /absolute/path/to/project" }, jobs: jobs.snapshot() });
      const projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
      if (request.method === "GET" && projectMatch) {
        const project = index.projects.find((item) => item.id === projectMatch[1]);
        return project ? json(response, 200, project) : json(response, 404, { error: "not_found", message: "Project is not registered." });
      }
      const detailMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/(research|agent-runs)$/);
      if (request.method === "GET" && detailMatch) return json(response, 200, detailMatch[2] === "research" ? researchDetail(detailMatch[1]) : agentRunDetail(detailMatch[1]));
      const workflowMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/workflows\/([a-z-]+)$/);
      if (request.method === "POST" && workflowMatch) {
        if (request.headers["content-type"] !== "application/json") return json(response, 415, { error: "content_type", message: "Workflow requests require application/json." });
        if (request.headers["x-rtb-publishing-csrf"] !== csrfToken) return json(response, 403, { error: "csrf", message: "Refresh the workspace before starting a workflow." });
        const origin = request.headers.origin;
        if (!validOrigin(origin)) return json(response, 403, { error: "origin", message: "Remote origins are not allowed." });
        const input = await body(request);
        if (input.confirm !== true) return json(response, 400, { error: "confirmation", message: "Set confirm to true after reviewing the workflow." });
        const project = index.projects.find((item) => item.id === workflowMatch[1]);
        if (!project || !project.workflows.includes(workflowMatch[2])) return json(response, 403, { error: "workflow_denied", message: "That workflow is not allowed for this project." });
        return json(response, 202, jobs.create(project.id, workflowMatch[2]));
      }
      const jobAction = url.pathname.match(/^\/api\/jobs\/(JOB-[A-Z0-9-]+)\/(cancel|rerun)$/);
      if (request.method === "POST" && jobAction) {
        if (request.headers["content-type"] !== "application/json" || request.headers["x-rtb-publishing-csrf"] !== csrfToken) return json(response, 403, { error: "job_action_denied", message: "Refresh the workspace before changing a job." });
        if (!validOrigin(request.headers.origin)) return json(response, 403, { error: "origin", message: "Remote origins are not allowed." });
        const input = await body(request);
        if (input.confirm !== true) return json(response, 400, { error: "confirmation", message: "Confirm the job action first." });
        return json(response, 202, jobAction[2] === "cancel" ? jobs.cancel(jobAction[1]) : jobs.rerun(jobAction[1]));
      }
      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.includes("..")) return json(response, 400, { error: "invalid_path", message: "Invalid asset path." });
        const file = safePlatformPath(resolve(PLATFORM_WEB_DIRECTORY, name));
        response.writeHead(200, { "content-type": types[extname(file.absolute)] ?? "application/octet-stream", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'", "x-frame-options": "DENY", "referrer-policy": "no-referrer" });
        return response.end(readFileSync(file.absolute));
      }
      return json(response, 404, { error: "not_found", message: "Route not found." });
    } catch (error) {
      return json(response, 400, { error: "request_failed", message: error.message });
    }
  });
  return { server, csrfToken, indexService, jobs };
}

export async function startPlatform({ host = "127.0.0.1", port = 4310 } = {}) {
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("M5A is local-only; host must be 127.0.0.1 or ::1.");
  const platform = createPlatformServer();
  await new Promise((resolvePromise, reject) => platform.server.once("error", reject).listen(port, host, resolvePromise));
  return platform;
}
