import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

test("publishing workflow checks out complete history for provenance tests", () => {
  const workflow = parse(readFileSync(".github/workflows/publishing.yml", "utf8"));
  const checkout = workflow.jobs.quality.steps.find((step) => step.uses === "actions/checkout@v4");

  assert.ok(checkout, "publishing workflow must check out the repository");
  assert.equal(checkout.with?.["fetch-depth"], 0, "historical provenance tests require complete Git history");
});
