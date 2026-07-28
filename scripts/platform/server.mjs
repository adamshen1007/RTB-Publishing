import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PLATFORM_WEB_DIRECTORY, LOOPBACK_HOSTS } from "./constants.mjs";
import { ROOT } from "../lib.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { agentRunDetail, WorkspaceIndex, researchDetail } from "./indexer.mjs";
import { JobManager } from "./jobs.mjs";
import { safePlatformPath } from "./security.mjs";
import { pilotStatus } from "./operations.mjs";
import { loadEffectiveWorkspace } from "./local-state.mjs";
import { MutationService } from "../state/mutation-journal.mjs";
import { LifecycleService } from "../lifecycle/service.mjs";
import { CanonicalLifecycleBindingProvider } from "../lifecycle/bindings.mjs";
import { BetaPreparationService } from "../lifecycle/beta-preparation.mjs";
import { ReleaseReviewService } from "../publishing/release-review-service.mjs";
import { openStateDatabase } from "../state/database.mjs";

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const json = (response, status, body, headers = {}) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers }); response.end(JSON.stringify(body)); };
const validOrigin = (origin) => !origin || /^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/.test(origin);

async function body(request, maximumBytes = 10000) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (Buffer.byteLength(value) > maximumBytes) throw new Error("Request body exceeds the supported limit.");
  }
  return value ? JSON.parse(value) : {};
}

const exactJson = (contentType) => contentType === "application/json";
const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const loopbackHost = (host) => /^(?:127\.0\.0\.1|localhost)(?::\d+)?$|^\[::1\](?::\d+)?$/.test(host ?? "");
const loopbackAddress = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const cookies = (request) => Object.fromEntries((request.headers.cookie ?? "").split(";").map((part) => part.trim().split("=", 2)).filter(([key, value]) => key && value));

export class LocalSessionManager {
  constructor({ now = () => Date.now(), ttlMs = 5 * 60 * 1000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.sessions = new Map(); }
  issue() { const id = randomBytes(24).toString("hex"); const session = { id, csrfToken: randomBytes(24).toString("hex"), capability: randomBytes(24).toString("hex"), operatorId: null, intents: new Map(), expiresAt: this.now() + this.ttlMs }; this.sessions.set(id, session); return session; }
  peek(id) { const session = this.sessions.get(id); return session && session.expiresAt > this.now() ? session : null; }
  consume(id, csrfToken, capability) {
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= this.now() || session.csrfToken !== csrfToken || session.capability !== capability) return null;
    // Rotate synchronously before any body or service await: the old pair is one-use.
    session.csrfToken = randomBytes(24).toString("hex"); session.capability = randomBytes(24).toString("hex"); session.expiresAt = this.now() + this.ttlMs;
    return session;
  }
  bootstrap(id, csrfToken, capability) {
    const session = this.consume(id, csrfToken, capability);
    if (!session) return null;
    session.operatorId ??= `human-${randomBytes(12).toString("hex")}`;
    return session;
  }
  issueIntent(session, value) {
    if (!session?.operatorId || session.expiresAt <= this.now()) return null;
    const signature = JSON.stringify(value);
    for (const [token, intent] of session.intents) if (intent.signature === signature && intent.expiresAt > this.now()) return token;
    while (session.intents.size >= 50) session.intents.delete(session.intents.keys().next().value);
    const token = randomBytes(24).toString("hex");
    session.intents.set(token, { ...value, signature, expiresAt: Math.min(session.expiresAt, this.now() + this.ttlMs) });
    return token;
  }
  consumeIntent(session, token, expected = {}) {
    if (!session || typeof token !== "string") return null;
    const intent = session.intents.get(token); session.intents.delete(token);
    if (!intent || intent.expiresAt <= this.now() || Object.entries(expected).some(([key, value]) => intent[key] !== value)) return null;
    return intent;
  }
  cookie(session) { return `rtb_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(this.ttlMs / 1000)}`; }
}

function mutationServiceFor(options, projectId) {
  if (options.mutationService?.projectId === projectId) return options.mutationService;
  if (options.mutationServices instanceof Map) return options.mutationServices.get(projectId);
  return options.mutationServices?.[projectId];
}

const registeredPolicies = {
  "rtb-publishing-core": {
    registeredRoot: ROOT,
    paths: ["chapters/*.md", "worksheets/*.md"],
    sourcePaths: ["*.md", "*.yaml", "chapters/*.md", "worksheets/*.md", "references/*.md", "reviews/*.md", "assets/*", "diagrams/*", "releases/*.md"]
  }
};

/** Only committed registered projects with a reviewed policy gain a writer. */
export function createRegisteredMutationServices({ workspaceFile, localFile, now } = {}) {
  const workspace = loadEffectiveWorkspace(workspaceFile, localFile);
  const services = new Map();
  for (const project of workspace.projects) {
    const policy = registeredPolicies[project.id];
    if (!policy || project.source === "local" || project.kind !== "repository" || resolve(ROOT, project.path) !== policy.registeredRoot) continue;
    const book = resolveBookProject();
    services.set(project.id, new MutationService({ root: book.legacyRoot, projectId: project.id, allowedPaths: policy.paths, sourcePaths: policy.sourcePaths, now, requireCurrentBlueprint: true, materialBlueprintFieldsForCommand: (command) => command.files.flatMap((file) => file.path.endsWith("book-project.yaml") ? ["reader", "promised_outcome", "scope", "thesis"] : file.path.endsWith("blueprint.yaml") ? ["chapter_contracts"] : []) }));
  }
  return services;
}

export function createRegisteredLifecycleServices({ workspaceFile, localFile, now } = {}) {
  const workspace = loadEffectiveWorkspace(workspaceFile, localFile); const services = new Map();
  for (const project of workspace.projects) if (project.id === "rtb-publishing-core" && project.source !== "local") { const book = resolveBookProject(); services.set(project.id, new LifecycleService({ root: book.legacyRoot, projectId: project.id, projectPath: book.workspacePath, bindingProvider: new CanonicalLifecycleBindingProvider({ book, approvalProjectId: project.id }), now })); services.set(book.id, new LifecycleService({ root: book.legacyRoot, projectId: book.id, projectPath: book.workspacePath, bindingProvider: new CanonicalLifecycleBindingProvider({ book }), now })); }
  return services;
}

export function createRegisteredReleaseReviewServices({ lifecycleServices } = {}) {
  const services = new Map();
  const book = resolveBookProject();
  if (lifecycleServices?.has(book.id)) services.set(book.id, (actor) => new ReleaseReviewService({ root: book.legacyRoot, projectId: book.id, actorResolver: () => actor }));
  return services;
}

export function createRegisteredBetaPreparationServices({ lifecycleServices } = {}) {
  const services = new Map();
  const book = resolveBookProject();
  const lifecycle = lifecycleServices?.get(book.id);
  if (lifecycle) services.set(book.id, (actor) => new BetaPreparationService({ book, bindingProvider: lifecycle.bindingProvider, actorResolver: () => actor }));
  return services;
}

function contextualService(services, projectId, actor = null) {
  const value = services instanceof Map ? services.get(projectId) : services?.[projectId];
  return typeof value === "function" ? value(actor) : value;
}

function publicBetaStatus(service) {
  if (!service) return null;
  const { state, code, message, chapterCount, failures } = service.inspect();
  return { state, code, message, ...(chapterCount == null ? {} : { chapterCount }), ...(failures ? { failures } : {}) };
}

function publicationStatus({ lifecycleServices, releaseReviewServices, betaPreparationServices, sessions, session }) {
  const publicationProjects = [];
  const lifecycle = Object.fromEntries([...lifecycleServices].map(([projectId, service]) => {
    const status = service.status();
    if (session?.operatorId) for (const gate of ["beta", "publish"]) {
      const material = status.gates?.[gate];
      if (material?.ok && material.materialRevision) material.intent = sessions.issueIntent(session, { action: "lifecycle-gate", projectId, gate, lifecycleVersion: status.lifecycle.version, materialRevision: material.materialRevision });
    }
    const projectPath = service.projectPath ?? null;
    if (projectPath && releaseReviewServices.has(projectId)) {
      const approval = status.approvals.filter((item) => item.gate === "publish" && !item.invalidated).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      let releaseId = null; const database = openStateDatabase(service.databaseFile); try { releaseId = database.prepare("SELECT release_id FROM release_finalizations WHERE project_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1").get(projectId)?.release_id ?? null; } finally { database.close(); }
      const build = approval ? `pnpm release:candidate -- ${shellQuote(projectPath)} --lifecycle-version ${approval.lifecycleVersion - 1} --approval-id ${shellQuote(approval.id)}` : null;
      const verify = releaseId ? `pnpm release:verify -- ${shellQuote(".")} ${shellQuote(projectPath)} ${shellQuote(releaseId)}` : null;
      status.commands = { build, verify, releaseId };
      publicationProjects.push({ id: projectId, name: `Publication · ${projectId}`, path: projectPath, stage: "publication", source: "canonical book", milestone: "Human gates", description: "Verified book candidate and human publication approvals.", signals: { researchTopics: 0, agentRuns: 0, documents: 1 }, nextAction: "Complete the named reviews, then confirm the exact lifecycle gate.", workflows: [] });
    }
    return [projectId, { ...status, projectPath }];
  }));
  const releaseReviews = Object.fromEntries([...releaseReviewServices].map(([projectId]) => {
    const status = contextualService(releaseReviewServices, projectId)?.status();
    if (session?.operatorId && status?.candidateHash) status.intent = sessions.issueIntent(session, { action: "release-review", projectId, candidateHash: status.candidateHash });
    return [projectId, status];
  }));
  return { lifecycle, publicationProjects, releaseReviews, betaPreparation: Object.fromEntries([...betaPreparationServices].map(([projectId]) => [projectId, publicBetaStatus(contextualService(betaPreparationServices, projectId))])) };
}

export function createPlatformServer(options = {}) {
  const indexService = options.indexService ?? (options.index ? { refresh: () => options.index } : new WorkspaceIndex({ file: options.workspaceFile, localFile: options.localFile }));
  const jobs = options.jobs ?? new JobManager(options.jobOptions);
  const csrfToken = options.csrfToken ?? randomBytes(24).toString("hex");
  const sessions = options.sessions ?? new LocalSessionManager({ now: options.now, ttlMs: options.sessionTtlMs });
  const lifecycleServices = options.lifecycleServices ?? (options.lifecycleService ? new Map([[options.lifecycleService.projectId, options.lifecycleService]]) : options.mutationService ? new Map() : createRegisteredLifecycleServices({ workspaceFile: options.workspaceFile, localFile: options.localFile, now: options.now }));
  const useRegisteredPublicationServices = !options.lifecycleService && !options.mutationService;
  const releaseReviewServices = options.releaseReviewServices ?? (useRegisteredPublicationServices ? createRegisteredReleaseReviewServices({ lifecycleServices }) : new Map());
  const betaPreparationServices = options.betaPreparationServices ?? (useRegisteredPublicationServices ? createRegisteredBetaPreparationServices({ lifecycleServices }) : new Map());
  const requests = new Map();
  const server = createHttpServer(async (request, response) => {
    let rebootstrap;
    try {
      const address = request.socket.remoteAddress ?? "unknown";
      const minute = Math.floor(Date.now() / 60000);
      const rateKey = `${address}:${minute}`;
      const count = (requests.get(rateKey) ?? 0) + 1;
      requests.set(rateKey, count);
      if (count > 120) return json(response, 429, { error: "rate_limit", message: "Too many local requests; wait one minute." });
      const url = new URL(request.url, "http://localhost");
      const addressInfo = server.address();
      const listenerHost = addressInfo && typeof addressInfo !== "string" ? `${addressInfo.family === "IPv6" ? `[${addressInfo.address}]` : addressInfo.address}:${addressInfo.port}` : null;
      const sameListener = Boolean(listenerHost) && request.headers.host === listenerHost && loopbackAddress(request.socket.remoteAddress);
      if (request.method === "GET" && url.pathname === "/api/session") {
        if (!sameListener || request.headers["x-forwarded-host"] || request.headers.forwarded) return json(response, 400, { error: "local_boundary", message: "Local sessions require the direct listener origin." });
        const session = sessions.issue();
        return json(response, 200, { csrfToken: session.csrfToken, mutationCapability: session.capability, operator: null, expiresAt: new Date(session.expiresAt).toISOString() }, { "set-cookie": sessions.cookie(session) });
      }
      if (request.method === "POST" && url.pathname === "/api/session/bootstrap") {
        if (!sameListener || !exactJson(request.headers["content-type"]) || request.headers.origin !== `http://${listenerHost}` || request.headers["sec-fetch-site"] !== "same-origin") return json(response, 403, { error: "operator_bootstrap_denied", message: "Local operator bootstrap requires the direct local origin." });
        const input = await body(request);
        if (input.confirm !== true || Object.keys(input).some((key) => key !== "confirm")) return json(response, 400, { error: "confirmation", message: "Explicit confirmation is required; reviewer identity is created by the local server." });
        const session = sessions.bootstrap(cookies(request).rtb_session, request.headers["x-rtb-publishing-csrf"], request.headers["x-rtb-publishing-capability"]);
        if (!session) return json(response, 403, { error: "operator_bootstrap_denied", message: "Refresh the local session and confirm the human review session again." });
        return json(response, 200, { operator: session.operatorId, csrfToken: session.csrfToken, mutationCapability: session.capability, expiresAt: new Date(session.expiresAt).toISOString() }, { "x-rtb-publishing-next-csrf": session.csrfToken, "x-rtb-publishing-next-capability": session.capability });
      }
      const index = indexService.refresh();
      if (request.method === "GET" && url.pathname === "/api/workspace") {
        const session = sessions.peek(cookies(request).rtb_session);
        return json(response, 200, { ...index, pilot: pilotStatus(options.pilotDirectory), onboarding: { registeredProjects: index.projects.length, localProjects: index.projects.filter((project) => project.source === "local").length, externalWorkflows: "disabled", nextCommand: "rtb-publishing platform project onboard /absolute/path/to/project" }, jobs: jobs.snapshot(), ...publicationStatus({ lifecycleServices, releaseReviewServices, betaPreparationServices, sessions, session }) });
      }
      const betaPreparationMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/lifecycle\/beta-preparation$/);
      if (request.method === "POST" && betaPreparationMatch) {
        const session = sessions.consume(cookies(request).rtb_session, request.headers["x-rtb-publishing-csrf"], request.headers["x-rtb-publishing-capability"]);
        const service = contextualService(betaPreparationServices, betaPreparationMatch[1], session ? { type: "human", id: `local-operator:${session.operatorId}` } : null);
        if (!service || !session?.operatorId || url.search || !sameListener || !loopbackHost(request.headers.host) || request.headers["x-forwarded-host"] || request.headers.forwarded || !exactJson(request.headers["content-type"]) || request.headers.origin !== `http://${listenerHost}` || request.headers["sec-fetch-site"] !== "same-origin") return json(response, 403, { error: "beta_preparation_auth", message: "A confirmed local human session and direct loopback origin are required." });
        rebootstrap = { "x-rtb-publishing-next-csrf": session.csrfToken, "x-rtb-publishing-next-capability": session.capability };
        const input = await body(request);
        if (input.confirm !== true || Object.keys(input).some((key) => key !== "confirm")) return json(response, 400, { error: "beta_preparation_authority", message: "Beta preparation accepts confirmation only; hashes and reviewer identity are resolved by the server." }, rebootstrap);
        try { return json(response, 201, await service.prepare(), rebootstrap); }
        catch (error) { return json(response, 409, { error: "beta_preparation_blocked", message: error.message }, rebootstrap); }
      }
      const reviewMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/release-reviews\/(migration-visual-review|pdf-screen-reader-visual-review|rights-and-brand-review)$/);
      if (request.method === "POST" && reviewMatch) {
        const session = sessions.consume(cookies(request).rtb_session, request.headers["x-rtb-publishing-csrf"], request.headers["x-rtb-publishing-capability"]);
        const service = contextualService(releaseReviewServices, reviewMatch[1], session ? { type: "human", id: `local-operator:${session.operatorId}` } : null);
        if (!service || !session?.operatorId || url.search || !sameListener || !loopbackHost(request.headers.host) || request.headers["x-forwarded-host"] || request.headers.forwarded || !exactJson(request.headers["content-type"]) || request.headers.origin !== `http://${listenerHost}` || request.headers["sec-fetch-site"] !== "same-origin") return json(response, 403, { error: "release_review_auth", message: "A confirmed local human session and direct loopback origin are required." });
        rebootstrap = { "x-rtb-publishing-next-csrf": session.csrfToken, "x-rtb-publishing-next-capability": session.capability };
        const input = await body(request);
        if (input.confirm !== true) return json(response, 400, { error: "confirmation", message: "Explicit human review confirmation is required." }, rebootstrap);
        const authority = sessions.consumeIntent(session, input.intent, { action: "release-review", projectId: reviewMatch[1] });
        if (!authority) return json(response, 409, { error: "stale_review_intent", message: "This review view is stale or was already used. Refresh and inspect the current exact candidate before deciding." }, rebootstrap);
        const recordInput = { ...input, kind: reviewMatch[2] }; delete recordInput.confirm; delete recordInput.intent;
        try { return json(response, 201, service.record(recordInput, { expectedCandidateHash: authority.candidateHash }), rebootstrap); }
        catch (error) { return json(response, error.code === "STALE_REVIEW_INTENT" ? 409 : 400, { error: error.code === "STALE_REVIEW_INTENT" ? "stale_review_intent" : "release_review_rejected", message: error.message }, rebootstrap); }
      }
      const gateMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/lifecycle\/gates\/(blueprint|beta|publish)$/);
      if (request.method === "POST" && gateMatch) {
        const service = lifecycleServices.get(gateMatch[1]); const session = sessions.consume(cookies(request).rtb_session, request.headers["x-rtb-publishing-csrf"], request.headers["x-rtb-publishing-capability"]);
        if (!service || !session?.operatorId || !sameListener || request.headers["x-forwarded-host"] || request.headers.forwarded || !exactJson(request.headers["content-type"]) || request.headers.origin !== `http://${listenerHost}` || request.headers["sec-fetch-site"] !== "same-origin") return json(response, 403, { error: "gate_auth", message: "A bootstrapped local operator and direct local confirmation are required." });
        const input = await body(request), intentRequired = ["beta", "publish"].includes(gateMatch[2]);
        const allowed = intentRequired ? ["confirm", "intent", "reason"] : ["confirm", "expectedVersion", "reason"];
        if (input.confirm !== true || (input.reason && typeof input.reason !== "string") || Object.keys(input).some((key) => !allowed.includes(key)) || (!intentRequired && !Number.isInteger(input.expectedVersion))) return json(response, 400, { error: "confirmation", message: "Explicit confirmation and the server-issued current-material intent are required; lifecycle bindings and actor identity are resolved by the server." });
        rebootstrap = { "x-rtb-publishing-next-csrf": session.csrfToken, "x-rtb-publishing-next-capability": session.capability };
        const authority = intentRequired ? sessions.consumeIntent(session, input.intent, { action: "lifecycle-gate", projectId: gateMatch[1], gate: gateMatch[2] }) : null;
        if (intentRequired && !authority) return json(response, 409, { error: "stale_gate_intent", message: "This approval view is stale or was already used. Refresh and inspect the current exact material before approving it." }, rebootstrap);
        const result = await service.approve({ gate: gateMatch[2], expectedVersion: authority?.lifecycleVersion ?? input.expectedVersion, expectedMaterialRevision: authority?.materialRevision, explicitConfirmation: true, actor: { type: "human", id: `local-operator:${session.operatorId}` }, reason: input.reason ?? "Explicit local confirmation" });
        return json(response, result.state === "succeeded" ? 202 : ["conflict", "stale"].includes(result.state) ? 409 : 400, result, rebootstrap);
      }
      const projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
      if (request.method === "GET" && projectMatch) {
        const project = index.projects.find((item) => item.id === projectMatch[1]);
        return project ? json(response, 200, project) : json(response, 404, { error: "not_found", message: "Project is not registered." });
      }
      const detailMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/(research|agent-runs)$/);
      if (request.method === "GET" && detailMatch) return json(response, 200, detailMatch[2] === "research" ? researchDetail(detailMatch[1]) : agentRunDetail(detailMatch[1]));
      const mutationMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/mutations\/replace-files$/);
      if (request.method === "POST" && mutationMatch) {
        const service = mutationServiceFor(options, mutationMatch[1]); const lifecycleService = lifecycleServices.get(mutationMatch[1]);
        const host = request.headers.host;
        const session = sessions.consume(cookies(request).rtb_session, request.headers["x-rtb-publishing-csrf"], request.headers["x-rtb-publishing-capability"]);
        if (!service) return json(response, 403, { error: "mutation_denied", message: "This project has no approved local mutation service." });
        if (url.search || !sameListener || !loopbackHost(host) || request.headers["x-forwarded-host"] || request.headers.forwarded) return json(response, 400, { error: "local_boundary", message: "Mutation requests must use the direct loopback origin." });
        if (!exactJson(request.headers["content-type"])) return json(response, 415, { error: "content_type", message: "Mutation requests require exact application/json." });
        if (request.headers.origin !== `http://${listenerHost}` || request.headers["sec-fetch-site"] !== "same-origin") return json(response, 403, { error: "origin", message: "Mutation requests require the configured same origin." });
        if (!session) return json(response, 403, { error: "mutation_auth", message: "Refresh the local session before submitting a mutation." });
        rebootstrap = { "x-rtb-publishing-next-csrf": session.csrfToken, "x-rtb-publishing-next-capability": session.capability };
        const sessionKey = `${session.id}:${mutationMatch[1]}:${minute}`;
        const sessionCount = (requests.get(sessionKey) ?? 0) + 1;
        requests.set(sessionKey, sessionCount);
        if (sessionCount > 20) return json(response, 429, { error: "rate_limit", message: "Too many mutation requests; wait one minute." });
        const input = await body(request, 256 * 1024);
        if (input.command !== "replace_files" || input.projectId !== mutationMatch[1]) return json(response, 403, { error: "mutation_denied", message: "Only the approved replace-files command is available for this project." });
        if (!Array.isArray(input.files) || input.files.some((file) => !service.allowsPath(file?.path))) return json(response, 403, { error: "path_denied", message: "This action cannot change that file." });
        const expectation = lifecycleService?.mutationExpectation();
        if (lifecycleService && !expectation) return json(response, 400, { error: "blueprint_required", message: "A current Blueprint approval is required before canonical mutation." }, rebootstrap);
        const result = await service.execute(expectation ? { ...input, expectedLifecycleVersion: expectation.version, expectedLifecycleGuard: expectation.guard } : input);
        return json(response, result.state === "succeeded" ? 200 : result.state === "conflict" ? 409 : 400, result, rebootstrap);
      }
      const workflowMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/workflows\/([a-z-]+)$/);
      if (request.method === "POST" && workflowMatch) {
        if (request.headers["content-type"] !== "application/json") return json(response, 415, { error: "content_type", message: "Workflow requests require application/json." });
        if (request.headers["x-rtb-publishing-csrf"] !== csrfToken) return json(response, 403, { error: "csrf", message: "Refresh the workspace before starting a workflow." });
        const origin = request.headers.origin;
        if (!validOrigin(origin)) return json(response, 403, { error: "origin", message: "Remote origins are not allowed." });
        const input = await body(request);
        if (input.confirm !== true || (input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,256}$/.test(input.idempotencyKey)))) return json(response, 400, { error: "confirmation", message: "Confirm with one stable command identity after reviewing the workflow." });
        const project = index.projects.find((item) => item.id === workflowMatch[1]);
        if (!project || !project.workflows.includes(workflowMatch[2])) return json(response, 403, { error: "workflow_denied", message: "That workflow is not allowed for this project." });
        return json(response, 202, jobs.create(project.id, workflowMatch[2], undefined, { idempotencyKey: input.idempotencyKey ?? `legacy:${project.id}:${workflowMatch[2]}:${Date.now()}` }));
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
    } catch {
      return json(response, 400, { error: "request_failed", message: "Request could not be processed safely." }, rebootstrap);
    }
  });
  return { server, csrfToken, indexService, jobs, sessions, mutationServices: options.mutationServices, lifecycleServices, releaseReviewServices, betaPreparationServices };
}

export async function startPlatform({ host = "127.0.0.1", port = 4310, ...options } = {}) {
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("M5A is local-only; host must be 127.0.0.1 or ::1.");
  const platform = createPlatformServer({ ...options, mutationServices: options.mutationServices ?? createRegisteredMutationServices({ workspaceFile: options.workspaceFile, localFile: options.localFile, now: options.now }), lifecycleServices: options.lifecycleServices ?? createRegisteredLifecycleServices({ workspaceFile: options.workspaceFile, localFile: options.localFile, now: options.now }) });
  await new Promise((resolvePromise, reject) => platform.server.once("error", reject).listen(port, host, resolvePromise));
  return platform;
}
