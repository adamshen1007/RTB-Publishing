import { randomBytes } from "node:crypto";
export const GATES = ["blueprint", "beta", "publish"];
export const STATES = ["blueprint_review", "evidence", "notion_beta", "published"];
export const id = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString("hex").toUpperCase()}`;
export const timestamp = (now = () => Date.now()) => new Date(now()).toISOString();
export const lifecycleRecord = (row) => ({ schemaVersion: 1, projectId: row.projectId ?? row.project_id, version: row.version, state: STATES.includes(row.status) ? row.status : "blueprint_review", guard: ["blueprint_required", "blueprint_approved", "beta_approved", "published", "blocked"].includes(row.guard) ? row.guard : "blueprint_required", updatedAt: row.updatedAt ?? row.updated_at });
