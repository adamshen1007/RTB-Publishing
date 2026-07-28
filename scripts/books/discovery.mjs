import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { ROOT } from "../lib.mjs";
import { readSnapshot } from "../state/snapshots.mjs";
import { discoverBookProjects as manifestFiles, resolveSafeRelativePath, validateFile } from "./model.mjs";

const ignored = new Set([".git", ".rtb-content", ".rtb-state", "node_modules", "build", "dist", "tests", "examples"]);

function safeRelative(root, target) {
  const value = relative(root, target).split(sep).join("/");
  if (value.startsWith("../") || value === "..") throw new Error("Book Project escapes the requested workspace root.");
  return value;
}

function readYaml(root, path) {
  return parse(readFileSync(resolveSafeRelativePath(root, path, { mustExist: true }), "utf8"));
}

/**
 * Resolve one immutable project root once. `.rtb-content/current.json` is the
 * canonical reader boundary; projects without a pointer remain readable from
 * their legacy working tree during the documented transition.
 */
export function resolveProjectRoot(projectRoot, { preferCanonical = true } = {}) {
  const legacyRoot = resolve(projectRoot);
  if (!preferCanonical || !existsSync(resolve(legacyRoot, ".rtb-content", "current.json"))) {
    return { root: legacyRoot, authority: "legacy-working-tree", snapshotHash: null, pointerVersion: null };
  }
  const snapshot = readSnapshot(legacyRoot);
  return { root: snapshot.root, authority: "rtb-content-current", snapshotHash: snapshot.snapshotHash, pointerVersion: snapshot.version };
}

function projectFromManifest(manifestFile, { workspaceRoot = ROOT, preferCanonical = true } = {}) {
  const workspace = resolve(workspaceRoot);
  const legacyRoot = dirname(manifestFile);
  safeRelative(workspace, legacyRoot);
  const resolved = resolveProjectRoot(legacyRoot, { preferCanonical });
  const manifestPath = resolve(resolved.root, "book.project.yaml");
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) throw new Error(`Canonical project root has no safe manifest: ${manifestFile}`);
  const validation = validateFile(manifestPath, { root: resolved.root, recordType: "book-project", checkPaths: true });
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => `${item.field}: ${item.problem}`).join("\n"));
  const manifest = validation.record;
  const blueprint = readYaml(resolved.root, manifest.blueprint.path);
  const metadata = readFileSync(resolveSafeRelativePath(resolved.root, manifest.paths.metadata, { mustExist: true }), "utf8");
  const chapters = blueprint.chapter_contracts
    .map((chapter) => ({ ...chapter, sourcePath: resolveSafeRelativePath(resolved.root, chapter.source_path, { mustExist: true }) }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
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
  const files = manifestFiles(root).filter((file) => !safeRelative(root, file).split("/").some((segment) => ignored.has(segment)));
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
