import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { ROOT } from "../lib.mjs";
import { WORKSPACE_FILE } from "./constants.mjs";
import { loadWorkspace, validatePlatformRecord } from "./model.mjs";
import { safePlatformPath } from "./security.mjs";
import { loadEffectiveWorkspace } from "./local-state.mjs";

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function detectProject(path, id) {
  const target = safePlatformPath(path, { allowRoot: true });
  const manifest = resolve(target.absolute, "rtb-publishing.project.yaml");
  if (existsSync(manifest)) {
    const record = parse(readFileSync(manifest, "utf8"));
    return { id: id ?? record.project?.slug ?? slug(basename(target.absolute)), kind: "kit", path: target.relative, manifest: "rtb-publishing.project.yaml" };
  }
  const packageFile = resolve(target.absolute, "package.json");
  if (existsSync(packageFile)) {
    const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
    return { id: id ?? slug(pkg.name ?? basename(target.absolute)), kind: "repository", path: target.relative };
  }
  throw new Error("Project must contain rtb-publishing.project.yaml or package.json.");
}

function save(workspace, file, dryRun) {
  validatePlatformRecord("workspace", workspace, "workspace manifest");
  if (!dryRun) writeFileSync(file, stringify(workspace, { lineWidth: 100 }));
  return workspace;
}

export function addProject(path, { id, file = WORKSPACE_FILE, dryRun = false } = {}) {
  const workspace = loadWorkspace(file);
  const project = detectProject(path, id);
  if (workspace.projects.some((item) => item.id === project.id)) throw new Error(`Project ID already registered: ${project.id}`);
  if (workspace.projects.some((item) => item.path === project.path)) throw new Error(`Project path already registered: ${project.path}`);
  workspace.projects.push(project);
  save(workspace, file, dryRun);
  return project;
}

export function removeProject(id, { file = WORKSPACE_FILE, dryRun = false, confirm = false } = {}) {
  const workspace = loadWorkspace(file);
  const project = workspace.projects.find((item) => item.id === id);
  if (!project) throw new Error(`Project is not registered: ${id}`);
  if (!confirm && !dryRun) throw new Error("Removal requires --confirm; project files will not be deleted.");
  workspace.projects = workspace.projects.filter((item) => item.id !== id);
  if (workspace.projects.length < 2) throw new Error("M5A.1 workspace must retain at least two projects.");
  save(workspace, file, dryRun);
  return project;
}

export function inspectProject(id, file = WORKSPACE_FILE) {
  const project = loadWorkspace(file).projects.find((item) => item.id === id);
  if (!project) throw new Error(`Project is not registered: ${id}`);
  return project;
}

export function inspectAnyProject(id, file = WORKSPACE_FILE, localFile) {
  const project = loadEffectiveWorkspace(file, localFile).projects.find((item) => item.id === id);
  if (!project) throw new Error(`Project is not registered: ${id}`);
  return project;
}
