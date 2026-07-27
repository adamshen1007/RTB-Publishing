import assert from "node:assert/strict";
import test from "node:test";
import { assertBaselinePreconditions } from "../scripts/record-increment-1-baseline.mjs";

const passedCommands = [
  { id: "pnpm-check", exitCode: 0, result: "passed" },
  { id: "pnpm-build", exitCode: 0, result: "passed" },
  { id: "pnpm-verify-outputs", exitCode: 0, result: "passed" }
];

test("Increment 1 baseline requires a clean worktree and all required commands", () => {
  assert.doesNotThrow(() => assertBaselinePreconditions({ dirty: false, commands: passedCommands }));
  assert.throws(() => assertBaselinePreconditions({ dirty: true, commands: passedCommands }), /clean Git worktree/);
  assert.throws(() => assertBaselinePreconditions({ dirty: false, commands: passedCommands.slice(0, 2) }), /pnpm-verify-outputs/);
  assert.throws(() => assertBaselinePreconditions({ dirty: false, commands: [...passedCommands.slice(0, 2), { id: "pnpm-verify-outputs", exitCode: 1, result: "failed" }] }), /pnpm-verify-outputs/);
});
