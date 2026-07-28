const state = { csrfToken: "", mutationCapability: "", operator: null, data: null };
const $ = (selector) => document.querySelector(selector);
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; };

function workflowLabel(value) {
  return ({ "quality-check": "Run all checks", "research-validate": "Validate research", "agent-review-fake": "Run safe agent review", "kit-check": "Check generated kit" })[value] ?? value;
}

function projectCard(project, index) {
  const card = node("article", `project-card${index === 0 ? " primary" : ""}`);
  const meta = node("div", "project-meta");
  meta.append(node("span", "", `${project.stage} · ${project.source}`), node("span", "", project.milestone));
  card.append(meta, node("h3", "", project.name), node("p", "description", project.description));
  const signals = node("div", "signals");
  [[project.signals.researchTopics, "Research"], [project.signals.agentRuns, "Agent runs"], [project.signals.documents, "Documents"]].forEach(([value, label]) => { const signal = node("div", "signal"); signal.append(node("strong", "", value), node("span", "", label)); signals.append(signal); });
  card.append(signals, node("p", "next", project.nextAction));
  const actions = node("div", "actions");
  const inspect = node("button", "quiet-button", "View dossier"); inspect.type = "button"; inspect.addEventListener("click", () => openDossier(project)); actions.append(inspect);
  project.workflows.forEach((workflow) => { const button = node("button", "action", workflowLabel(workflow)); button.type = "button"; button.addEventListener("click", () => runWorkflow(project, workflow, button)); actions.append(button); });
  if (!project.workflows.length) actions.append(node("span", "read-only", "Read-only · workflows disabled"));
  card.append(actions);
  const lifecycle = state.data?.lifecycle?.[project.id];
  if (lifecycle) card.append(lifecyclePanel(project, lifecycle));
  return card;
}

function lifecyclePanel(project, lifecycle) {
  const section = node("section", "lifecycle-review"); section.setAttribute("aria-label", "Lifecycle review");
  const current = lifecycle.lifecycle;
  section.append(node("h4", "", "Guided release review"), node("p", "muted", current ? `Lifecycle ${current.version} · ${current.state.replaceAll("_", " ")}` : lifecycle.unavailable));
  const reviewStatus = state.data?.releaseReviews?.[project.id];
  if (reviewStatus) section.append(releaseReviewControls(project, reviewStatus));
  const betaPreparation = state.data?.betaPreparation?.[project.id];
  if (betaPreparation) section.append(betaPreparationControl(project, betaPreparation));
  ["blueprint", "beta", "publish"].forEach((gate) => {
    const result = lifecycle.gates?.[gate], label = gate[0].toUpperCase() + gate.slice(1), row = node("div", "gate-row"), detailId = `${project.id}-${gate}-guard`;
    row.append(node("strong", "", `${label} Gate`), node("span", result?.ok ? "gate-ready" : "gate-unavailable", result?.ok ? "Ready for review" : "Unavailable"));
    const detail = node("p", "muted", result?.message ?? "This gate is unavailable for this project."); detail.id = detailId; row.append(detail);
    const needsIntent = ["beta", "publish"].includes(gate), action = node("button", "quiet-button", `Approve ${label}`); action.type = "button"; action.disabled = !result?.ok || !state.operator || (needsIntent && !result.intent); action.setAttribute("aria-describedby", detailId); action.addEventListener("click", () => confirmGate(project, gate, current.version, result.intent)); row.append(action); section.append(row);
  });
  return section;
}

const reviewLabels = {
  "migration-visual-review": "Migration visual review",
  "pdf-screen-reader-visual-review": "PDF and screen-reader visual review",
  "rights-and-brand-review": "Rights and brand review",
};

function releaseReviewControls(project, status) {
  const group = node("div", "review-group");
  const heading = node("h5", "", "Candidate-bound release reviews"); group.append(heading, node("p", "candidate-identity", status.candidateIdentity ? `Displayed candidate ${status.candidateIdentity}` : "No release candidate displayed"), node("p", "muted", status.message));
  Object.entries(reviewLabels).forEach(([kind, label]) => {
    const review = status.reviews[kind], row = node("div", "review-row"), detailId = `${project.id}-${kind}-status`;
    const title = node("strong", "", label), durable = node("span", `review-decision ${review.decision}`, review.decision); row.append(title, durable);
    const detail = node("p", "muted", review.message); detail.id = detailId; row.append(detail);
    let roleInput = null;
    if (kind === "rights-and-brand-review") {
      const inputId = `${project.id}-rights-role`, labelNode = node("label", "declaration-label", "Declaration: my qualified rights-review role"); labelNode.htmlFor = inputId;
      roleInput = node("input", "declaration-input"); roleInput.id = inputId; roleInput.type = "text"; roleInput.maxLength = 200; roleInput.autocomplete = "organization-title"; roleInput.placeholder = "For example: publishing rights owner"; roleInput.setAttribute("aria-describedby", `${detailId} ${inputId}-help`);
      const help = node("small", "muted", "Required only for approval. This is your human declaration, not a server-verified credential."); help.id = `${inputId}-help`; row.append(labelNode, roleInput, help);
    }
    const actions = node("div", "review-actions");
    ["approved", "rejected"].forEach((decision) => { const button = node("button", decision === "approved" ? "action" : "quiet-button", decision === "approved" ? "Record approval" : "Record rejection"); button.type = "button"; button.disabled = !state.operator || !status.intent; button.setAttribute("aria-describedby", detailId); button.addEventListener("click", () => recordReleaseReview(project, kind, decision, roleInput, status.intent)); actions.append(button); });
    row.append(actions); group.append(row);
  });
  return group;
}

function betaPreparationControl(project, status) {
  const row = node("div", "gate-row beta-preparation"), detailId = `${project.id}-beta-preparation-status`;
  row.append(node("strong", "", "Prepare exact Beta material"), node("span", status.state === "ready" ? "gate-ready" : "gate-unavailable", status.state === "ready" ? "Receipt current" : "Blocked"));
  const detail = node("p", "muted", status.message); detail.id = detailId; row.append(detail);
  const action = node("button", "action", "Prepare Beta"); action.type = "button"; action.disabled = status.state !== "ready" || !state.operator; action.setAttribute("aria-describedby", detailId); action.addEventListener("click", () => prepareBeta(project)); row.append(action);
  return row;
}

function renderJobs(jobs) {
  const container = $("#jobs"); container.replaceChildren();
  if (!jobs.length) return container.append($("#empty-jobs").content.cloneNode(true));
  jobs.forEach((job) => {
    const article = node("article", "job"); const head = node("div", "job-head");
    const identity = node("div"); identity.append(node("div", "job-id", job.id), node("div", "", `${job.projectId} · ${workflowLabel(job.workflow)}`));
    head.append(identity, node("span", `status ${job.status}`, job.status)); article.append(head);
    const progress = node("ol", "job-progress");
    const step = job.status === "queued" ? 0 : job.status === "running" ? 1 : 2;
    [job.queuePosition ? `Queued #${job.queuePosition}` : "Queued", "Executing", "Recorded"].forEach((label, index) => progress.append(node("li", index < step ? "done" : index === step ? "current" : "", label)));
    progress.setAttribute("aria-label", `Job progress: ${job.progress}`); article.append(progress);
    const details = node("details"); details.append(node("summary", "", "View local log"), node("pre", "", job.log || "No output yet.")); article.append(details);
    const actions = node("div", "job-actions");
    if (["queued", "running"].includes(job.status)) { const cancel = node("button", "quiet-button", "Cancel job"); cancel.type = "button"; cancel.addEventListener("click", () => jobAction(job, "cancel")); actions.append(cancel); }
    else { const rerun = node("button", "quiet-button", "Run again"); rerun.type = "button"; rerun.addEventListener("click", () => jobAction(job, "rerun")); actions.append(rerun); }
    if (job.durationMs != null) actions.append(node("span", "job-duration", `${(job.durationMs / 1000).toFixed(1)}s · ${job.terminationReason}`));
    if (job.recoveryHint) article.append(node("p", "recovery-hint", job.recoveryHint));
    article.append(actions); container.append(article);
  });
}

function render(data) {
  state.data = data; $("#workspace-title").textContent = data.workspace.name; $("#project-count").textContent = `${data.projects.length} projects / local`;
  const indexStatus = $("#index-status"); indexStatus.textContent = data.index?.stale ? `Showing last valid index: ${data.index.error}` : `Live index generation ${data.index?.generation ?? 1}`; indexStatus.classList.toggle("warning", Boolean(data.index?.stale));
  $("#pilot-status").textContent = data.pilot ? `Pilot evidence ${data.pilot.sessions.observed}/${data.pilot.sessions.required} · ${data.pilot.decision}` : "Pilot evidence unavailable";
  const known = new Set(data.projects.map((project) => project.id)); const publicationProjects = Object.keys(data.lifecycle ?? {}).filter((id) => !known.has(id)).map((id) => ({ id, name: id, stage: "publication", source: "canonical book", milestone: "Human gates", description: "Verified book candidate and human publication approvals.", signals: { researchTopics: 0, agentRuns: 0, documents: 1 }, nextAction: "Complete the named reviews, then confirm the exact lifecycle gate.", workflows: [] }));
  const visibleProjects = [...data.projects, ...publicationProjects]; const projects = $("#projects"); projects.replaceChildren(...visibleProjects.map(projectCard)); renderJobs(data.jobs ?? []);
}

function showNotice(message) { const notice = $("#notice"); notice.textContent = message; notice.hidden = !message; }
function captureRotation(response) { state.csrfToken = response.headers.get("x-rtb-publishing-next-csrf") ?? state.csrfToken; state.mutationCapability = response.headers.get("x-rtb-publishing-next-capability") ?? state.mutationCapability; }

function metric(label, value) { const item = node("div", "dossier-metric"); item.append(node("strong", "", value), node("span", "", label)); return item; }
async function openDossier(project) {
  const dialog = $("#dossier"); $("#dossier-title").textContent = project.name; const content = $("#dossier-content"); content.replaceChildren(node("p", "", "Loading canonical evidence…")); dialog.showModal();
  try {
    const [research, agents] = await Promise.all([fetch(`/api/projects/${project.id}/research`).then((r) => r.json()), fetch(`/api/projects/${project.id}/agent-runs`).then((r) => r.json())]);
    content.replaceChildren();
    const health = node("section", "dossier-section"); health.append(node("h3", "", "Operating status"), node("p", "", `${project.health}. ${project.nextAction}`)); content.append(health);
    const researchSection = node("section", "dossier-section"); researchSection.append(node("h3", "", "Research"));
    if (!research.topics.length) researchSection.append(node("p", "muted", "No research topics are registered for this project."));
    research.topics.forEach((topic) => { const group = node("div", "dossier-record"); group.append(node("strong", "", topic.title)); const metrics = node("div", "dossier-metrics"); [["sources", topic.sources], ["claims", topic.claims], ["proposed", topic.proposedClaims], ["stale", topic.staleSources]].forEach(([label, value]) => metrics.append(metric(label, value))); group.append(metrics, node("small", "", `Reviewed ${topic.asOf} · ${topic.status}`)); researchSection.append(group); }); content.append(researchSection);
    const agentSection = node("section", "dossier-section"); agentSection.append(node("h3", "", "Agent reviews"));
    if (!agents.runs.length) agentSection.append(node("p", "muted", "No agent runs are registered for this project."));
    agents.runs.forEach((run) => { const record = node("div", "dossier-record"); record.append(node("strong", "", `${run.runId} · ${run.status}`), node("p", "muted", `${run.findings.length} findings · ${run.changes} changes · ${run.decision}`)); agentSection.append(record); }); content.append(agentSection);
  } catch (error) { content.replaceChildren(node("p", "error", `Dossier unavailable: ${error.message}`)); }
}

async function jobAction(job, action) {
  if (!window.confirm(`${action === "cancel" ? "Cancel" : "Run again from"} ${job.id}?`)) return;
  const response = await fetch(`/api/jobs/${job.id}/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken }, body: JSON.stringify({ confirm: true }) });
  const result = await response.json(); if (!response.ok) return showNotice(result.message); showNotice(""); await refresh();
}

async function confirmGate(project, gate, expectedVersion, intent) {
  if (!window.confirm(`Approve the exact current ${gate} gate in this confirmed human session?`)) return;
  const payload = { confirm: true, reason: `Explicit guided Creator Studio ${gate} approval`, ...(["beta", "publish"].includes(gate) ? { intent } : { expectedVersion }) };
  const response = await fetch(`/api/projects/${project.id}/lifecycle/gates/${gate}`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken, "x-rtb-publishing-capability": state.mutationCapability, origin: window.location.origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify(payload) });
  const result = await response.json();
  captureRotation(response); if (!response.ok) { if (response.status === 409) await refresh(); return showNotice(result.message); } await refresh(); showNotice(`${gate[0].toUpperCase() + gate.slice(1)} approval recorded.`);
}

async function prepareBeta(project) {
  if (!window.confirm("Prepare Beta from every current canonical chapter and the fixed private Notion sync receipt?")) return;
  const response = await fetch(`/api/projects/${project.id}/lifecycle/beta-preparation`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken, "x-rtb-publishing-capability": state.mutationCapability, origin: window.location.origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: true }) });
  const result = await response.json(); captureRotation(response);
  if (!response.ok) return showNotice(result.message); await refresh(); showNotice("Exact Beta material prepared on the server. Review the now-ready Beta gate before approving it.");
}

async function recordReleaseReview(project, kind, decision, roleInput, intent) {
  const qualifiedRole = roleInput?.value.trim() ?? "";
  if (kind === "rights-and-brand-review" && decision === "approved" && !qualifiedRole) { roleInput.focus(); return showNotice("Declare your non-empty qualified rights-review role before recording approval."); }
  if (!window.confirm(`Record a durable ${decision} decision for ${reviewLabels[kind]} on the latest exact candidate?`)) return;
  const payload = { confirm: true, intent, decision, ...(kind === "rights-and-brand-review" && qualifiedRole ? { qualifiedRole } : {}) };
  const response = await fetch(`/api/projects/${project.id}/release-reviews/${kind}`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken, "x-rtb-publishing-capability": state.mutationCapability, origin: window.location.origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify(payload) });
  const result = await response.json(); captureRotation(response);
  if (!response.ok) { if (response.status === 409) await refresh(); return showNotice(result.message); } await refresh(); showNotice(`${reviewLabels[kind]} ${decision} decision recorded for the displayed exact candidate.`);
}

async function bootstrapOperator() {
  if (!window.confirm("Confirm that a human is present and taking responsibility for review decisions in this local session?")) return;
  const submit = () => fetch("/api/session/bootstrap", { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken, "x-rtb-publishing-capability": state.mutationCapability, origin: window.location.origin, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ confirm: true }) });
  let response = await submit();
  if (response.status === 403) { await issueSession(); response = await submit(); }
  const result = await response.json();
  if (!response.ok) return showNotice(result.message);
  state.operator = result.operator; state.csrfToken = result.csrfToken; state.mutationCapability = result.mutationCapability; $("#human-session-status").textContent = "Confirmed human review session"; $("#confirm-human-session").textContent = "Renew human review session"; await refresh();
}

async function issueSession() { const session = await (await fetch("/api/session")).json(); state.operator = null; state.csrfToken = session.csrfToken; state.mutationCapability = session.mutationCapability; $("#human-session-status").textContent = "Human review session not confirmed"; }

async function refresh() {
  const response = await fetch("/api/workspace"); if (!response.ok) throw new Error("Workspace state could not be loaded. Run platform doctor in the terminal."); render(await response.json()); showNotice("");
}

async function runWorkflow(project, workflow, button) {
  if (!window.confirm(`Start “${workflowLabel(workflow)}” for ${project.name}? The result will be recorded locally.`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/projects/${project.id}/workflows/${workflow}`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken }, body: JSON.stringify({ confirm: true, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message); showNotice(""); await refresh();
  } catch (error) { showNotice(error.message); } finally { button.disabled = false; }
}

$("#refresh").addEventListener("click", refresh);
$("#confirm-human-session").addEventListener("click", bootstrapOperator);
$("#close-dossier").addEventListener("click", () => $("#dossier").close());
$("#open-onboarding").addEventListener("click", () => $("#onboarding").showModal());
$("#close-onboarding").addEventListener("click", () => $("#onboarding").close());
try { await issueSession(); await refresh(); setInterval(() => refresh().catch((error) => showNotice(error.message)), 5000); } catch (error) { showNotice(error.message); }
