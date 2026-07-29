import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { ROOT } from "../lib.mjs";

const SCHEMA_DIRECTORY = resolve(ROOT, "schemas", "books");
const SCHEMA_FILES = {
  "book-project": "book-project.schema.json",
  "book-blueprint": "book-blueprint.schema.json",
  "book-chapter": "book-chapter.schema.json",
  "schema-migration": "schema-migration.schema.json",
  "migration-report": "migration-report.schema.json",
};

export const CURRENT_SCHEMA_VERSION = "1";

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

/** Canonical JSON is a sorted UTF-8 representation with a terminating newline. */
export function canonicalRecordJson(record, { omit = [] } = {}) {
  const excluded = new Set(omit);
  const copy = Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key)));
  return `${JSON.stringify(canonicalize(copy), null, 2)}\n`;
}

/** Blueprint identity is the canonical record excluding its self-referential hash. */
export function canonicalBlueprintHash(blueprint) {
  return sha256(canonicalRecordJson(blueprint, { omit: ["content_hash"] }));
}

/** Lifecycle identity is its canonical record excluding its self-referential hash. */
export function canonicalLifecycleHash(lifecycle) {
  return sha256(canonicalRecordJson(lifecycle, { omit: ["content_hash"] }));
}

export function diagnostic({ field = "$", problem, cause, repair }) {
  return { field, problem, cause, repair };
}

function schemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  for (const file of Object.values(SCHEMA_FILES)) ajv.addSchema(JSON.parse(readFileSync(resolve(SCHEMA_DIRECTORY, file), "utf8")));
  return ajv;
}

const ajv = schemas();

function jsonPointer(instancePath) {
  return instancePath || "$";
}

function schemaDiagnostics(errors = []) {
  return [...errors]
    .map((error) => diagnostic({
      field: error.keyword === "required" ? `${jsonPointer(error.instancePath)}.${error.params.missingProperty}` : jsonPointer(error.instancePath),
      problem: `schema ${error.keyword} violation`,
      cause: error.message ?? "record does not satisfy the contract",
      repair: "Update the record to match the documented versioned schema and remove undeclared fields.",
    }))
    .sort((left, right) => `${left.field}\0${left.problem}`.localeCompare(`${right.field}\0${right.problem}`));
}

/** Rejects paths before target content is opened. Existing symlinks are rejected at every segment. */
export function resolveSafeRelativePath(root, requestedPath, { mustExist = false } = {}) {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new Error("problem: unsafe path; cause: path is empty; repair: provide a non-empty repository-relative path");
  }
  if (requestedPath.includes("\\") || isAbsolute(requestedPath) || /^[A-Za-z]:/.test(requestedPath)) {
    throw new Error("problem: unsafe path; cause: absolute or platform-specific path; repair: use a slash-delimited relative path");
  }
  const segments = requestedPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("problem: unsafe path; cause: traversal or empty path segment; repair: use a normalized relative path without . or ..");
  }
  const rootReal = realpathSync(root);
  const target = resolve(rootReal, requestedPath);
  const escape = relative(rootReal, target);
  if (escape === "" || escape === ".." || escape.startsWith(`..${sep}`) || isAbsolute(escape)) {
    throw new Error("problem: unsafe path; cause: resolved path escapes the project root; repair: use a path below the project root");
  }
  let cursor = rootReal;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    if (!existsSync(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error("problem: unsafe path; cause: symbolic links are not allowed; repair: replace the link with a regular file or directory inside the project root");
    }
  }
  if (mustExist && !existsSync(target)) {
    throw new Error("problem: missing path; cause: declared path does not exist; repair: create the declared file or directory inside the project root");
  }
  return target;
}

export function readStructuredFile(file, { root = ROOT } = {}) {
  const absoluteFile = resolve(file);
  const lexicalRelative = relative(resolve(root), absoluteFile);
  const physicalRelative = relative(realpathSync(root), absoluteFile);
  const relativeFile = !lexicalRelative.startsWith("..") && lexicalRelative !== "" ? lexicalRelative : physicalRelative;
  const safeFile = resolveSafeRelativePath(root, relativeFile, { mustExist: true });
  const raw = readFileSync(safeFile, "utf8");
  try {
    return { file: safeFile, raw, record: safeFile.endsWith(".json") ? JSON.parse(raw) : parse(raw) };
  } catch (error) {
    throw new Error(`problem: malformed record; cause: ${error.message}; repair: provide valid YAML or JSON for the declared schema version`);
  }
}

function declaredPaths(recordType, record) {
  if (recordType === "book-project") {
    return [record.paths?.root, record.paths?.metadata, record.paths?.chapters, record.paths?.assets, record.paths?.research, record.paths?.reviews, record.blueprint?.path, record.lifecycle?.path]
      .filter(Boolean).map((path) => ({ path, mustExist: true }))
      .concat((record.output_profiles ?? []).map((profile) => ({ path: profile.path, mustExist: false })));
  }
  if (recordType === "book-blueprint") return (record.chapter_contracts ?? []).map((chapter) => chapter.source_path).filter(Boolean).map((path) => ({ path, mustExist: true }));
  if (recordType === "book-chapter") return record.source_path ? [{ path: record.source_path, mustExist: true }] : [];
  return [];
}

function semanticDiagnostics(recordType, record) {
  const result = [];
  if (recordType === "book-blueprint") {
    const chapterIds = record.chapter_contracts?.map((chapter) => chapter.id) ?? [];
    const orders = record.chapter_contracts?.map((chapter) => chapter.order) ?? [];
    const partValues = record.parts ?? [];
    const partIds = new Set(partValues.map((part) => part.id));
    const partOrders = partValues.map((part) => part.order);
    if (new Set(chapterIds).size !== chapterIds.length) result.push(diagnostic({ field: ".chapter_contracts", problem: "duplicate stable ID", cause: "chapter contract IDs must be unique", repair: "Assign one stable ID to each chapter contract." }));
    if (new Set(orders).size !== orders.length) result.push(diagnostic({ field: ".chapter_contracts", problem: "duplicate chapter order", cause: "chapter order values must be unique", repair: "Assign each chapter a unique positive order." }));
    if (partIds.size !== partValues.length) result.push(diagnostic({ field: ".parts", problem: "duplicate stable ID", cause: "part IDs must be unique", repair: "Assign one stable ID to each part." }));
    if (new Set(partOrders).size !== partOrders.length) result.push(diagnostic({ field: ".parts", problem: "duplicate part order", cause: "part order values must be unique", repair: "Assign each part a unique positive order." }));
    if (canonicalBlueprintHash(record) !== record.content_hash) result.push(diagnostic({ field: ".content_hash", problem: "stale canonical Blueprint hash", cause: "content_hash must equal SHA-256 of canonical sorted Blueprint JSON excluding content_hash", repair: "Recompute the Blueprint hash with canonicalBlueprintHash after an authorized change." }));
    for (const chapter of record.chapter_contracts ?? []) if (chapter.part_id && !partIds.has(chapter.part_id)) result.push(diagnostic({ field: `.chapter_contracts.${chapter.id}.part_id`, problem: "unknown part ID", cause: "chapter references a part not declared by this blueprint", repair: "Declare the part or reference an existing part stable ID." }));
  }
  if (recordType === "book-project") {
    const profiles = record.output_profiles ?? [];
    const ids = profiles.map((profile) => profile.id);
    const paths = profiles.map((profile) => profile.path);
    if (new Set(ids).size !== ids.length) result.push(diagnostic({ field: ".output_profiles", problem: "duplicate stable ID", cause: "output profile IDs must be unique", repair: "Assign one stable ID to each output profile." }));
    if (new Set(paths).size !== paths.length) result.push(diagnostic({ field: ".output_profiles", problem: "duplicate output path", cause: "output profile paths must be unique", repair: "Assign each output profile a distinct repository-relative path." }));
  }
  return result;
}

function addPathDiagnostic(diagnostics, field, error) {
  const [problem = "invalid path", cause = "", repair = ""] = error.message.replace(/^problem: /, "").split("; ");
  diagnostics.push(diagnostic({ field, problem, cause: cause.replace(/^cause: /, ""), repair: repair.replace(/^repair: /, "") }));
}

function validateLifecycleReference(project, lifecycle) {
  const required = ["id", "project_id", "content_hash"];
  const diagnostics = [];
  for (const key of required) if (!(key in lifecycle)) diagnostics.push(diagnostic({ field: `.lifecycle.${key}`, problem: "missing lifecycle reference field", cause: "referenced lifecycle record lacks required ownership or hash data", repair: "Provide id, project_id, and canonical content_hash in the lifecycle record." }));
  if (lifecycle.id && lifecycle.id !== project.lifecycle.id) diagnostics.push(diagnostic({ field: ".lifecycle.id", problem: "lifecycle ID mismatch", cause: "project reference does not match lifecycle record ID", repair: "Align the Book Project lifecycle ID with the referenced lifecycle record." }));
  if (lifecycle.project_id && lifecycle.project_id !== project.id) diagnostics.push(diagnostic({ field: ".lifecycle.project_id", problem: "lifecycle ownership mismatch", cause: "referenced lifecycle belongs to another project", repair: "Reference the lifecycle record owned by this Book Project." }));
  const calculated = lifecycle.content_hash && canonicalLifecycleHash(lifecycle);
  if (calculated && lifecycle.content_hash !== calculated) diagnostics.push(diagnostic({ field: ".lifecycle.content_hash", problem: "stale canonical lifecycle hash", cause: "lifecycle hash does not match its canonical sorted record", repair: "Recompute the lifecycle hash after an authorized change." }));
  if (lifecycle.content_hash && project.lifecycle.content_hash !== lifecycle.content_hash) diagnostics.push(diagnostic({ field: ".lifecycle.content_hash", problem: "lifecycle hash mismatch", cause: "project reference does not bind the referenced lifecycle bytes", repair: "Copy the referenced lifecycle canonical hash into the Book Project lifecycle reference." }));
  return diagnostics;
}

function validateProjectReferences(project, root) {
  const diagnostics = [];
  try {
    const blueprintPath = resolveSafeRelativePath(root, project.blueprint.path, { mustExist: true });
    const blueprint = readStructuredFile(blueprintPath, { root }).record;
    const blueprintValidation = validateRecord("book-blueprint", blueprint, { root, checkPaths: true });
    diagnostics.push(...blueprintValidation.diagnostics.map((item) => ({ ...item, field: `blueprint:${item.field}` })));
    if (blueprint.id !== project.blueprint.id) diagnostics.push(diagnostic({ field: ".blueprint.id", problem: "Blueprint ID mismatch", cause: "project reference does not match referenced Blueprint ID", repair: "Align the Book Project Blueprint ID with the referenced Blueprint." }));
    if (blueprint.project_id !== project.id) diagnostics.push(diagnostic({ field: ".blueprint.project_id", problem: "Blueprint ownership mismatch", cause: "referenced Blueprint belongs to another project", repair: "Reference a Blueprint whose project_id equals this Book Project ID." }));
    const calculated = canonicalBlueprintHash(blueprint);
    if (project.blueprint.content_hash !== calculated) diagnostics.push(diagnostic({ field: ".blueprint.content_hash", problem: "Blueprint hash mismatch", cause: "project reference does not equal the canonical Blueprint hash", repair: "Set the Project Blueprint hash to canonicalBlueprintHash of the referenced Blueprint." }));
  } catch (error) { addPathDiagnostic(diagnostics, project.blueprint.path, error); }
  try {
    const lifecyclePath = resolveSafeRelativePath(root, project.lifecycle.path, { mustExist: true });
    const lifecycle = readStructuredFile(lifecyclePath, { root }).record;
    diagnostics.push(...validateLifecycleReference(project, lifecycle));
  } catch (error) { addPathDiagnostic(diagnostics, project.lifecycle.path, error); }
  return diagnostics;
}

export function validateRecord(recordType, record, { root, checkPaths = false } = {}) {
  const schema = ajv.getSchema(`https://rtb-publishing.local/schemas/books/${SCHEMA_FILES[recordType]}`);
  if (!schema) throw new Error(`Unknown record type: ${recordType}`);
  const validSchema = schema(record);
  const diagnostics = validSchema ? semanticDiagnostics(recordType, record) : schemaDiagnostics(schema.errors);
  if (validSchema && checkPaths) {
    for (const declared of declaredPaths(recordType, record)) try { resolveSafeRelativePath(root, declared.path, { mustExist: declared.mustExist }); } catch (error) { addPathDiagnostic(diagnostics, declared.path, error); }
    const hashTargets = recordType === "book-project"
      ? [[record.paths?.metadata, record.content_hash]]
      : recordType === "book-chapter"
        ? [[record.source_path, record.content_hash]]
        : recordType === "book-blueprint"
          ? (record.chapter_contracts ?? []).map((chapter) => [chapter.source_path, chapter.content_hash])
          : [];
    for (const [declaredPath, expectedHash] of hashTargets) {
      if (!declaredPath || !expectedHash) continue;
      try {
        const target = resolveSafeRelativePath(root, declaredPath, { mustExist: true });
        if (lstatSync(target).isFile() && sha256(readFileSync(target)) !== expectedHash) {
          diagnostics.push(diagnostic({ field: declaredPath, problem: "stale content hash", cause: "declared SHA-256 does not match canonical source bytes", repair: "Update the record's content hash after an authorized canonical mutation." }));
        }
      } catch { /* The path diagnostic above is the deterministic primary error. */ }
    }
    if (recordType === "book-project") diagnostics.push(...validateProjectReferences(record, root));
  }
  diagnostics.sort((left, right) => `${left.field}\0${left.problem}\0${left.cause}`.localeCompare(`${right.field}\0${right.problem}\0${right.cause}`));
  return { valid: diagnostics.length === 0, diagnostics };
}

/** Finds declared Book Project manifests below a safe root in stable path order. */
export function discoverBookProjects(root, { ignoredDirectoryNames = new Set() } = {}) {
  const discovered = [];
  function visit(directory) {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch (error) { throw new Error(`problem: inaccessible directory; cause: ${error.code ?? error.message}; repair: restore read permission or remove the inaccessible path from the discovery workspace`); }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const target = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && !ignoredDirectoryNames.has(entry.name)) visit(target);
      else if (entry.isFile() && entry.name === "book.project.yaml") discovered.push(target);
    }
  }
  visit(realpathSync(root));
  return discovered;
}

export function inferRecordType(record) {
  if (record?.record_type) return "schema-migration";
  if (record?.chapter_contracts) return "book-blueprint";
  if (record?.source_path) return "book-chapter";
  if (record?.paths && record?.output_profiles) return "book-project";
  return undefined;
}

export function validateFile(file, { root = ROOT, recordType, checkPaths = true } = {}) {
  const loaded = readStructuredFile(file, { root });
  const type = recordType ?? inferRecordType(loaded.record);
  if (!type) return { valid: false, diagnostics: [diagnostic({ problem: "unknown record type", cause: "record does not identify a supported Book Project, Blueprint, Chapter, or migration", repair: "Use a supported versioned record shape." })] };
  return { ...validateRecord(type, loaded.record, { root, checkPaths }), record: loaded.record, recordType: type, file: loaded.file, raw: loaded.raw };
}
