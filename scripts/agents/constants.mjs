import { resolve } from "node:path";
import { ROOT } from "../lib.mjs";

export const AGENT_DEFINITION_DIRECTORY = resolve(ROOT, "agents", "definitions");
export const AGENT_SCHEMA_DIRECTORY = resolve(ROOT, "schemas", "agents");
export const LOCAL_RUN_DIRECTORY = resolve(ROOT, ".rtb-publishing", "agent-runs");
export const AGENT_SCHEMA_VERSION = 1;
export const SENSITIVE_SEGMENTS = new Set([".env", ".git", ".npmrc", "node_modules", ".ssh"]);
export const EDITABLE_CLAIM_FIELDS = new Set(["statement", "classification", "confidence", "status", "limitations", "contradicts"]);
