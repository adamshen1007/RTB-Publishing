import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { parse, stringify } from "yaml";
import { PLATFORM_LOCAL_FILE } from "./constants.mjs";
import { loadWorkspace, validatePlatformRecord } from "./model.mjs";
import { safeExternalPath, validateExternalRoot } from "./security.mjs";

export const emptyLocalWorkspace = () => ({ schemaVersion: 1, allowedRoots: [], projects: [] });

function validatedLocalWorkspace(local) {
  validatePlatformRecord("platform-local", local, "local workspace overlay");
  const roots = local.allowedRoots.map(validateExternalRoot);
  const ids = new Set();
  const paths = new Set();
  for (const project of local.projects) {
    if (ids.has(project.id)) throw new Error(`Duplicate local project ID: ${project.id}`);
    if (paths.has(project.path)) throw new Error(`Duplicate local project path: ${project.path}`);
    ids.add(project.id);
    paths.add(project.path);
    safeExternalPath(project.path, roots);
  }
  return { ...local, allowedRoots: roots };
}

export function loadLocalWorkspace(file = PLATFORM_LOCAL_FILE) {
  if (!existsSync(file)) return emptyLocalWorkspace();
  return validatedLocalWorkspace(parse(readFileSync(resolve(file), "utf8")));
}

export function saveLocalWorkspace(local, { file = PLATFORM_LOCAL_FILE, dryRun = false } = {}) {
  const validated = validatedLocalWorkspace(local);
  if (!dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, stringify(validated, { lineWidth: 100 }));
  }
  return validated;
}

export function loadEffectiveWorkspace(workspaceFile, localFile = PLATFORM_LOCAL_FILE) {
  const local = loadLocalWorkspace(localFile);
  return loadWorkspace(workspaceFile, { local });
}

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function inspectExternalCandidate(path, { localFile = PLATFORM_LOCAL_FILE } = {}) {
  if (!path) throw new Error("project import requires an absolute project path.");
  if (!isAbsolute(path)) throw new Error(`External project path must be absolute: ${path}`);
  const absolute = validateExternalRoot(path);
  const packageFile = resolve(absolute, "package.json");
  if (!existsSync(packageFile)) throw new Error("External project must contain package.json; external kits are not executable in M5A.2.");
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  const local = loadLocalWorkspace(localFile);
  const allowed = local.allowedRoots.some((root) => absolute === root || absolute.startsWith(`${root}${sep}`));
  return {
    path: absolute,
    id: slug(pkg.name ?? basename(absolute)),
    name: pkg.name ?? basename(absolute),
    description: pkg.description ?? "External repository",
    allowed,
    recommendedRoot: absolute,
    eligible: allowed
  };
}

export function allowExternalRoot(path, { localFile = PLATFORM_LOCAL_FILE, dryRun = false, confirm = false } = {}) {
  const root = validateExternalRoot(path);
  if (!dryRun && !confirm) throw new Error("Allowing an external root requires --confirm.");
  const local = loadLocalWorkspace(localFile);
  if (!local.allowedRoots.includes(root)) local.allowedRoots.push(root);
  local.allowedRoots.sort();
  saveLocalWorkspace(local, { file: localFile, dryRun });
  return root;
}

export function removeExternalRoot(path, { localFile = PLATFORM_LOCAL_FILE, dryRun = false, confirm = false } = {}) {
  const root = resolve(path);
  const local = loadLocalWorkspace(localFile);
  if (!local.allowedRoots.includes(root)) throw new Error(`External root is not allowlisted: ${root}`);
  if (local.projects.some((project) => project.path === root || project.path.startsWith(`${root}${sep}`))) throw new Error("Remove projects under this root before removing its allowlist entry.");
  if (!dryRun && !confirm) throw new Error("Removing an external root requires --confirm.");
  local.allowedRoots = local.allowedRoots.filter((entry) => entry !== root);
  saveLocalWorkspace(local, { file: localFile, dryRun });
  return root;
}

export function importExternalProject(path, { id, localFile = PLATFORM_LOCAL_FILE, workspaceFile, dryRun = false } = {}) {
  const local = loadLocalWorkspace(localFile);
  const candidate = inspectExternalCandidate(path, { localFile });
  if (!candidate.allowed) throw new Error(`External project is not allowlisted. First run: rtb-publishing platform root allow "${candidate.recommendedRoot}" --confirm`);
  const project = { id: id ?? candidate.id, kind: "repository", path: safeExternalPath(candidate.path, local.allowedRoots).absolute };
  const all = loadWorkspace(workspaceFile, { local }).projects;
  if (all.some((item) => item.id === project.id)) throw new Error(`Project ID already registered: ${project.id}`);
  if (all.some((item) => item.path === project.path)) throw new Error(`Project path already registered: ${project.path}`);
  local.projects.push(project);
  saveLocalWorkspace(local, { file: localFile, dryRun });
  return project;
}

export function removeExternalProject(id, { localFile = PLATFORM_LOCAL_FILE, dryRun = false, confirm = false } = {}) {
  const local = loadLocalWorkspace(localFile);
  const project = local.projects.find((item) => item.id === id);
  if (!project) throw new Error(`Local external project is not registered: ${id}`);
  if (!dryRun && !confirm) throw new Error("Removal requires --confirm; project files will not be deleted.");
  local.projects = local.projects.filter((item) => item.id !== id);
  saveLocalWorkspace(local, { file: localFile, dryRun });
  return project;
}
