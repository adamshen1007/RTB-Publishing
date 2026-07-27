const state = { csrfToken: "", data: null };
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
  return card;
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
  const projects = $("#projects"); projects.replaceChildren(...data.projects.map(projectCard)); renderJobs(data.jobs ?? []);
}

function showNotice(message) { const notice = $("#notice"); notice.textContent = message; notice.hidden = !message; }

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

async function refresh() {
  const response = await fetch("/api/workspace"); if (!response.ok) throw new Error("Workspace state could not be loaded. Run platform doctor in the terminal."); render(await response.json()); showNotice("");
}

async function runWorkflow(project, workflow, button) {
  if (!window.confirm(`Start “${workflowLabel(workflow)}” for ${project.name}? The result will be recorded locally.`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/projects/${project.id}/workflows/${workflow}`, { method: "POST", headers: { "content-type": "application/json", "x-rtb-publishing-csrf": state.csrfToken }, body: JSON.stringify({ confirm: true }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message); showNotice(""); await refresh();
  } catch (error) { showNotice(error.message); } finally { button.disabled = false; }
}

$("#refresh").addEventListener("click", refresh);
$("#close-dossier").addEventListener("click", () => $("#dossier").close());
$("#open-onboarding").addEventListener("click", () => $("#onboarding").showModal());
$("#close-onboarding").addEventListener("click", () => $("#onboarding").close());
try { state.csrfToken = (await (await fetch("/api/session")).json()).csrfToken; await refresh(); setInterval(() => refresh().catch((error) => showNotice(error.message)), 5000); } catch (error) { showNotice(error.message); }
