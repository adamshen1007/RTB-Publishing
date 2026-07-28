import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { createHash } from "node:crypto";
import { ROOT } from "../lib.mjs";
import { readSnapshot } from "../state/snapshots.mjs";
import { assertNoSymlinkPath, pinPhysicalDirectory } from "../state/project-lock.mjs";
import { discoverBookProjects as manifestFiles, resolveSafeRelativePath, validateFile } from "./model.mjs";

const ignored = new Set([".git", ".rtb-content", ".rtb-state", ".tmp", "node_modules", "build", "dist", "tests", "examples"]);

function safeRelative(root, target) {
  const value = relative(root, target).split(sep).join("/");
  if (value.startsWith("../") || value === "..") throw new Error("Book Project escapes the requested workspace root.");
  return value;
}

function readYaml(root, path) {
  const file = resolveSafeRelativePath(root, path, { mustExist: true }); assertPrivateFile(file); return parse(readFileSync(file, "utf8"));
}
function assertPrivateFile(path) { const entry = lstatSync(path); if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) throw new Error(`Canonical input must be a private regular file with one link: ${path}`); return path; }

/**
 * Resolve one immutable project root once. `.rtb-content/current.json` is the
 * canonical reader boundary; projects without a pointer remain readable from
 * their legacy working tree during the documented transition.
 */
export function resolveProjectRoot(projectRoot, { preferCanonical = true } = {}) {
  const legacyRoot = pinPhysicalDirectory(projectRoot).path;
  if (!preferCanonical || !existsSync(resolve(legacyRoot, ".rtb-content", "current.json"))) {
    return { root: legacyRoot, authority: "legacy-working-tree", snapshotHash: null, pointerVersion: null };
  }
  const snapshot = readSnapshot(legacyRoot);
  assertNoSymlinkPath(legacyRoot, snapshot.root, { allowMissing: false });
  return { root: snapshot.root, authority: "rtb-content-current", snapshotHash: snapshot.snapshotHash, pointerVersion: snapshot.version };
}

function projectFromManifest(manifestFile, { workspaceRoot = ROOT, preferCanonical = true } = {}) {
  const workspace = pinPhysicalDirectory(workspaceRoot).path;
  const legacyRoot = pinPhysicalDirectory(dirname(manifestFile)).path;
  safeRelative(workspace, legacyRoot);
  assertNoSymlinkPath(workspace, legacyRoot, { allowMissing: false });
  const resolved = resolveProjectRoot(legacyRoot, { preferCanonical });
  const manifestPath = resolve(resolved.root, "book.project.yaml");
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) throw new Error(`Canonical project root has no safe manifest: ${manifestFile}`);
  assertPrivateFile(manifestPath);
  const validation = validateFile(manifestPath, { root: resolved.root, recordType: "book-project", checkPaths: true });
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.field}: ${item.problem}`).join("\n"));
  const manifest = validation.record;
  const blueprint = readYaml(resolved.root, manifest.blueprint.path);
  assertPrivateFile(resolveSafeRelativePath(resolved.root, manifest.lifecycle.path, { mustExist: true }));
  const metadata = readFileSync(assertPrivateFile(resolveSafeRelativePath(resolved.root, manifest.paths.metadata, { mustExist: true })), "utf8");
  const chapters = blueprint.chapter_contracts
    .map((chapter) => ({ ...chapter, sourcePath: resolveSafeRelativePath(resolved.root, chapter.source_path, { mustExist: true }) }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  for (const chapter of chapters) assertPrivateFile(chapter.sourcePath);
  if (new Set(chapters.map((chapter) => chapter.order)).size !== chapters.length) throw new Error(`Book Project ${manifest.id} has duplicate chapter order values.`);
  const parts = [...blueprint.parts].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const partIds = new Set(parts.map((part) => part.id));
  for (const chapter of chapters) if (chapter.part_id && !partIds.has(chapter.part_id)) throw new Error(`Book Project ${manifest.id} chapter ${chapter.id} references an unknown part.`);
  return {
    id: manifest.id,
    manifest,
    blueprint,
    root: resolved.root,
    legacyRoot,
    manifestPath,
    metadataPath: resolveSafeRelativePath(resolved.root, manifest.paths.metadata, { mustExist: true }),
    metadata,
    chapters,
    parts,
    authority: resolved.authority,
    snapshotHash: resolved.snapshotHash,
    pointerVersion: resolved.pointerVersion,
    outputProfiles: manifest.output_profiles.map((profile) => ({ ...profile, filename: basename(profile.path) })),
    workspacePath: safeRelative(workspace, legacyRoot),
    workspaceRoot: workspace,
  };
}

/** Read a declared Book Project; arbitrary paths are never followed outside its root. */
export function discoverBookProject(projectOrManifest, options = {}) {
  const requested = resolve(projectOrManifest);
  const manifest = basename(requested) === "book.project.yaml" ? requested : resolve(requested, "book.project.yaml");
  if (!existsSync(manifest)) throw new Error(`Book Project manifest does not exist: ${manifest}`);
  return projectFromManifest(manifest, options);
}

/** Discover only declared manifests, in stable workspace-relative order. */
export function discoverBooks(workspaceRoot = ROOT, options = {}) {
  const root = realpathSync(resolve(workspaceRoot));
  const files = manifestFiles(root, { ignoredDirectoryNames: ignored });
  const projects = files.map((file) => projectFromManifest(file, { workspaceRoot: root, ...options }));
  const ids = new Set();
  for (const project of projects) {
    if (ids.has(project.id)) throw new Error(`Duplicate Book Project ID discovered: ${project.id}`);
    ids.add(project.id);
  }
  return projects.sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
}

/** Resolve an explicit project, or the only registered manifest in a workspace. */
export function resolveBookProject(projectArgument, { workspaceRoot = ROOT } = {}) {
  if (projectArgument) return discoverBookProject(projectArgument, { workspaceRoot });
  const projects = discoverBooks(workspaceRoot);
  if (projects.length !== 1) throw new Error(`Expected exactly one discoverable Book Project; found ${projects.length}. Pass an explicit project path.`);
  return projects[0];
}

export function projectCanonicalIdentity(project) {
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const material = {
    id: project.id,
    root: realpathSync(project.root),
    legacyRoot: realpathSync(project.legacyRoot),
    workspaceRoot: realpathSync(project.workspaceRoot),
    workspacePath: project.workspacePath,
    authority: project.authority,
    snapshotHash: project.snapshotHash,
    pointerVersion: project.pointerVersion,
    manifest: project.manifest,
    blueprint: project.blueprint,
    metadataHash: digest(project.metadata),
    chapters: project.chapters.map((chapter) => ({ id: chapter.id, order: chapter.order, sourcePath: relative(project.root, chapter.sourcePath).split(sep).join("/"), contentHash: digest(readFileSync(chapter.sourcePath)) })),
  };
  return { ...material, materialHash: digest(JSON.stringify(material)) };
}

export function assertCurrentProjectIdentity(project) {
  const current = resolveBookProject(project.legacyRoot, { workspaceRoot: project.workspaceRoot });
  if (projectCanonicalIdentity(current).materialHash !== projectCanonicalIdentity(project).materialHash) throw new Error("Canonical Book Project snapshot or material changed after it was pinned; rebuild from the fresh project.");
  return current;
}
