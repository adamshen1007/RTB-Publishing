import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ROOT } from "../scripts/lib.mjs";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

class FakeElement {
  constructor(tagName, ownerDocument, id = "") {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.classList = { toggle() {} };
    this.hidden = false;
    this.open = false;
    this.textContent = "";
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.replaceCount = 0;
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) {
    this.replaceCount += 1;
    this.children = children;
    this.ownerDocument.defaultView.scrollY = 0;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this[name] = String(value); }
  cloneNode() { return new FakeElement(this.tagName, this.ownerDocument); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (item) => {
      if (!(item instanceof FakeElement)) return;
      if (selector === "details[open]" && item.tagName === "DETAILS" && item.open) matches.push(item);
      item.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  closest(selector) {
    if (selector === "[data-job-id]") {
      let item = this;
      while (item) { if (item.dataset?.jobId) return item; item = item.parent; }
    }
    return null;
  }
}

function attachParents(item, parent = null) {
  if (!(item instanceof FakeElement)) return;
  item.parent = parent;
  item.children.forEach((child) => attachParents(child, item));
}

function browserHarness(initialWorkspace) {
  let workspace = structuredClone(initialWorkspace);
  let interval;
  const view = { scrollX: 0, scrollY: 240, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; }, confirm: () => true, location: { origin: "http://127.0.0.1:4310" } };
  const elements = new Map();
  const document = {
    defaultView: view,
    activeElement: null,
    createElement: (tag) => new FakeElement(tag, document),
    querySelector(selector) {
      if (selector === "dialog[open]") return [...elements.values()].find((item) => item.tagName === "DIALOG" && item.open) ?? null;
      if (!selector.startsWith("#")) return null;
      return elements.get(selector.slice(1)) ?? null;
    },
  };
  ["workspace-title", "project-count", "index-status", "pilot-status", "projects", "jobs", "empty-jobs", "notice", "refresh", "confirm-human-session", "human-session-status", "close-dossier", "open-onboarding", "close-onboarding", "dossier", "dossier-title", "dossier-content", "onboarding"].forEach((id) => {
    const tag = id === "dossier" || id === "onboarding" ? "dialog" : id === "empty-jobs" ? "template" : "div";
    elements.set(id, new FakeElement(tag, document, id));
  });
  elements.get("empty-jobs").content = new FakeElement("fragment", document);
  const fetch = async (url) => ({
    ok: true,
    headers: { get: () => null },
    json: async () => url === "/api/session" ? { csrfToken: "csrf", mutationCapability: "capability" } : structuredClone(workspace),
  });
  const run = async () => {
    const source = readFileSync(resolve(ROOT, "platform", "web", "app.js"), "utf8");
    await new AsyncFunction("window", "document", "fetch", "setInterval", "crypto", source)(view, document, fetch, (callback, milliseconds) => { interval = { callback, milliseconds }; }, { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
    [...elements.values()].forEach((element) => attachParents(element));
  };
  const poll = async () => { await interval.callback(); [...elements.values()].forEach((element) => attachParents(element)); };
  return { document, elements, run, poll, setWorkspace: (next) => { workspace = structuredClone(next); }, view, interval: () => interval };
}

const workspace = (overrides = {}) => ({
  workspace: { name: "RTB Publishing" }, projects: [], publicationProjects: [], jobs: [], lifecycle: {}, releaseReviews: {}, betaPreparation: {},
  index: { generation: 1, indexedAt: "2026-07-29T00:00:00.000Z", stale: false, error: null },
  pilot: { sessions: { observed: 0, required: 10 }, decision: "collecting-evidence" },
  ...overrides,
});

test("unchanged polling does not reconstruct the workspace or jobs", async () => {
  const harness = browserHarness(workspace());
  await harness.run();
  const projects = harness.elements.get("projects"), jobs = harness.elements.get("jobs");
  assert.equal(harness.interval().milliseconds, 5000);
  assert.equal(projects.replaceCount, 1);
  assert.equal(jobs.replaceCount, 1);
  harness.setWorkspace(workspace({ index: { generation: 1, indexedAt: "2026-07-29T00:00:05.000Z", stale: false, error: null } }));
  await harness.poll();
  assert.equal(projects.replaceCount, 1);
  assert.equal(jobs.replaceCount, 1);
});

test("job polling updates jobs without reconstructing review controls", async () => {
  const harness = browserHarness(workspace());
  await harness.run();
  const projects = harness.elements.get("projects"), jobs = harness.elements.get("jobs");
  harness.setWorkspace(workspace({ jobs: [{ id: "JOB-1", projectId: "rtb-publishing-core", workflow: "quality-check", status: "running", progress: "executing", queuePosition: null, log: "running", durationMs: null, terminationReason: null, recoveryHint: null }] }));
  await harness.poll();
  assert.equal(projects.replaceCount, 1);
  assert.equal(jobs.replaceCount, 2);
});

test("workspace rendering waits for active review input and then restores scroll", async () => {
  const harness = browserHarness(workspace());
  await harness.run();
  const projects = harness.elements.get("projects");
  const input = new FakeElement("input", harness.document, "rights-role");
  input.value = "Publishing rights owner";
  input.focus();
  harness.setWorkspace(workspace({ workspace: { name: "Changed workspace" }, index: { generation: 2, indexedAt: "2026-07-29T00:00:05.000Z", stale: false, error: null } }));
  await harness.poll();
  assert.equal(projects.replaceCount, 1);
  assert.equal(input.value, "Publishing rights owner");
  harness.document.activeElement = null;
  harness.view.scrollY = 240;
  await harness.poll();
  assert.equal(projects.replaceCount, 2);
  assert.equal(harness.view.scrollY, 240);
});

test("changed jobs retain expanded log details", async () => {
  const running = { id: "JOB-1", projectId: "rtb-publishing-core", workflow: "quality-check", status: "running", progress: "executing", queuePosition: null, log: "running", durationMs: null, terminationReason: null, recoveryHint: null };
  const harness = browserHarness(workspace({ jobs: [running] }));
  await harness.run();
  const jobs = harness.elements.get("jobs");
  const details = jobs.querySelectorAll("details[open]");
  assert.equal(details.length, 0);
  const firstDetails = (() => { const find = (item) => item.tagName === "DETAILS" ? item : item.children.map(find).find(Boolean); return find(jobs); })();
  firstDetails.open = true;
  harness.setWorkspace(workspace({ jobs: [{ ...running, status: "passed", progress: "complete", durationMs: 1250, terminationReason: "exit" }] }));
  await harness.poll();
  assert.equal(jobs.querySelectorAll("details[open]").length, 1);
});
