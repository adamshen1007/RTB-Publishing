import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { StaticLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { createPlatformServer } from "../scripts/platform/server.mjs";

test("SEC-002/LIF-010 gate routes require a bootstrapped operator and keep bindings server-authoritative", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-platform-lifecycle-"));
  const blueprint = { briefHash: "brief", sourcePolicyHash: "source", budgetsHash: "budget", egressPolicyHash: "egress", blueprintHash: "blueprint" };
  const service = new LifecycleService({ root, projectId: "rtb-publishing-core", bindingProvider: new StaticLifecycleBindingProvider({ blueprint }) });
  let registeredBeta = null; service.bindingProvider.registerBeta = (input) => { registeredBeta = input; return { id: "BETA-fixture", bindings: input }; };
  const platform = createPlatformServer({ lifecycleService: service });
  await new Promise((done) => platform.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${platform.server.address().port}`;
  try {
    const sessionResponse = await fetch(`${base}/api/session`); const session = await sessionResponse.json(); const cookie = sessionResponse.headers.get("set-cookie").split(";")[0];
    const headers = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie, "x-rtb-publishing-csrf": session.csrfToken, "x-rtb-publishing-capability": session.mutationCapability };
    const denied = await fetch(`${base}/api/projects/rtb-publishing-core/lifecycle/gates/blueprint`, { method: "POST", headers, body: JSON.stringify({ confirm: true, expectedVersion: 0, bindings: { blueprintHash: "browser-forgery" } }) });
    assert.equal(denied.status, 403);
    const secondResponse = await fetch(`${base}/api/session`); const second = await secondResponse.json(); const secondCookie = secondResponse.headers.get("set-cookie").split(";")[0];
    const bootstrapHeaders = { ...headers, cookie: secondCookie, "x-rtb-publishing-csrf": second.csrfToken, "x-rtb-publishing-capability": second.mutationCapability };
    const bootstrap = await fetch(`${base}/api/session/bootstrap`, { method: "POST", headers: bootstrapHeaders, body: JSON.stringify({ confirm: true, operatorId: "editor" }) });
    assert.equal(bootstrap.status, 200); const operator = await bootstrap.json();
    const approved = await fetch(`${base}/api/projects/rtb-publishing-core/lifecycle/gates/blueprint`, { method: "POST", headers: { ...bootstrapHeaders, "x-rtb-publishing-csrf": operator.csrfToken, "x-rtb-publishing-capability": operator.mutationCapability }, body: JSON.stringify({ confirm: true, expectedVersion: 0, reason: "Reviewed local Blueprint", bindings: { blueprintHash: "browser-forgery" } }) });
    assert.equal(approved.status, 202); assert.equal((await approved.json()).approval.bindings.blueprintHash, "blueprint");
    const beta = await fetch(`${base}/api/projects/rtb-publishing-core/lifecycle/beta-evidence`, { method: "POST", headers: { ...bootstrapHeaders, "x-rtb-publishing-csrf": approved.headers.get("x-rtb-publishing-next-csrf"), "x-rtb-publishing-capability": approved.headers.get("x-rtb-publishing-next-capability") }, body: JSON.stringify({ confirm: true, betaSnapshotHash: "b".repeat(64), policyResultsHash: "c".repeat(64), reviewerId: "browser-forgery" }) });
    assert.equal(beta.status, 201); assert.equal(registeredBeta.reviewerId, "local-operator:editor"); assert.equal(registeredBeta.betaSnapshotHash, "b".repeat(64));
  } finally { await new Promise((done) => platform.server.close(done)); rmSync(root, { recursive: true, force: true }); }
});
