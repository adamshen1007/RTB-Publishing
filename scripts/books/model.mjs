import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
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
};

export const CURRENT_SCHEMA_VERSION = "1";

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
  const relativeFile = relative(root, resolve(file));
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
      .filter(Boolean);
  }
  if (recordType === "book-blueprint") return (record.chapter_contracts ?? []).map((chapter) => chapter.source_path).filter(Boolean);
  if (recordType === "book-chapter") return record.source_path ? [record.source_path] : [];
  return [];
}

function semanticDiagnostics(recordType, record) {
  const result = [];
  if (recordType === "book-blueprint") {
    const chapterIds = record.chapter_contracts?.map((chapter) => chapter.id) ?? [];
    const orders = record.chapter_contracts?.map((chapter) => chapter.order) ?? [];
    const partIds = new Set(record.parts?.map((part) => part.id) ?? []);
    if (new Set(chapterIds).size !== chapterIds.length) result.push(diagnostic({ field: ".chapter_contracts", problem: "duplicate stable ID", cause: "chapter contract IDs must be unique", repair: "Assign one stable ID to each chapter contract." }));
    if (new Set(orders).size !== orders.length) result.push(diagnostic({ field: ".chapter_contracts", problem: "duplicate chapter order", cause: "chapter order values must be unique", repair: "Assign each chapter a unique positive order." }));
    for (const chapter of record.chapter_contracts ?? []) if (chapter.part_id && !partIds.has(chapter.part_id)) result.push(diagnostic({ field: `.chapter_contracts.${chapter.id}.part_id`, problem: "unknown part ID", cause: "chapter references a part not declared by this blueprint", repair: "Declare the part or reference an existing part stable ID." }));
  }
  return result;
}

export function validateRecord(recordType, record, { root, checkPaths = false } = {}) {
  const schema = ajv.getSchema(`https://rtb-publishing.local/schemas/books/${SCHEMA_FILES[recordType]}`);
  if (!schema) throw new Error(`Unknown record type: ${recordType}`);
  const validSchema = schema(record);
  const diagnostics = validSchema ? semanticDiagnostics(recordType, record) : schemaDiagnostics(schema.errors);
  if (validSchema && checkPaths) {
    for (const declaredPath of declaredPaths(recordType, record)) {
      try { resolveSafeRelativePath(root, declaredPath, { mustExist: true }); }
      catch (error) {
        const [problem = "invalid path", cause = "", repair = ""] = error.message.replace(/^problem: /, "").split("; ");
        diagnostics.push(diagnostic({ field: declaredPath, problem, cause: cause.replace(/^cause: /, ""), repair: repair.replace(/^repair: /, "") }));
      }
    }
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
  }
  diagnostics.sort((left, right) => `${left.field}\0${left.problem}\0${left.cause}`.localeCompare(`${right.field}\0${right.problem}\0${right.cause}`));
  return { valid: diagnostics.length === 0, diagnostics };
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
