import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { CURRENT_SCHEMA_VERSION, diagnostic, inferRecordType, readStructuredFile, resolveSafeRelativePath, sha256, validateRecord } from "./model.mjs";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

/** Keeps hostile/unknown version input out of strict reports and diagnostics. */
function reportVersion(value) {
  const raw = value === undefined || value === null ? "0" : typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw)) return raw;
  return `unsupported-${sha256(canonicalJson({ schema_version: value })).slice("sha256:".length, "sha256:".length + 32)}`;
}

function reportBase(recordType, source, inputHash, outputHash, status, changes, rollbackLimit) {
  const timestamp = source.updated_at ?? source.created_at ?? "1970-01-01T00:00:00.000Z";
  return {
    id: `migration-${recordType}-${source.id ?? "unknown"}`,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: timestamp,
    updated_at: timestamp,
    producer: "rtb-publishing",
    validation_rules: ["schema-migration-v1", "dry-run-no-canonical-writes"],
    record_type: recordType,
    from_version: reportVersion(source.schema_version),
    to_version: CURRENT_SCHEMA_VERSION,
    input_hash: inputHash,
    output_hash: outputHash,
    status,
    changes,
    rollback_limit: rollbackLimit,
    canonical_source_unchanged: true,
  };
}

function migrateProjectV0(source) {
  // v0 deliberately accepts only the documented pre-versioned fixture shape.
  const identity = source.id ?? source.project_id;
  const paths = source.paths ?? { root: source.root_path ?? source.assets_path ?? "assets", metadata: source.metadata_path, chapters: source.chapters_path, assets: source.assets_path ?? "assets" };
  return {
    id: identity,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: source.created_at,
    updated_at: source.updated_at ?? source.created_at,
    producer: source.producer ?? "rtb-publishing",
    validation_rules: source.validation_rules ?? ["book-project-v1"],
    content_hash: source.content_hash,
    locale: source.locale ?? source.lang,
    paths,
    output_profiles: source.output_profiles ?? source.outputs,
    blueprint: source.blueprint,
    lifecycle: source.lifecycle,
  };
}

export function migrateRecord(recordType, source) {
  const inputHash = sha256(canonicalJson(source));
  const version = reportVersion(source?.schema_version);
  let output;
  let status;
  let changes;
  if (version === CURRENT_SCHEMA_VERSION) {
    output = source;
    status = "unchanged";
    changes = [];
  } else if (version === "0" && recordType === "book-project") {
    output = migrateProjectV0(source);
    status = "migrated";
    changes = ["schema_version: 0 -> 1", "legacy project path and output aliases normalized"];
  } else {
    return {
      output: undefined,
      report: reportBase(recordType, source, inputHash, inputHash, "blocked", [], "No automatic rollback exists because no canonical write was attempted."),
      diagnostics: [diagnostic({ field: ".schema_version", problem: "unsupported schema version", cause: `no forward migration from reported version ${version} for ${recordType}`, repair: "Install a compatible migrator or restore a supported source version; dry-run never changes canonical files." })],
    };
  }
  const outputHash = sha256(canonicalJson(output));
  const validation = validateRecord(recordType, output, { checkPaths: false });
  const diagnostics = [...validation.diagnostics];
  const effectiveStatus = diagnostics.length ? "blocked" : status;
  return {
    output,
    report: reportBase(recordType, source, inputHash, outputHash, effectiveStatus, effectiveStatus === "blocked" ? [] : changes, "Dry-run produces no canonical write. Applying this plan requires the WP95 authorized mutation service; no automatic rollback is provided."),
    diagnostics,
  };
}

export function migrateFileDryRun(file, { root, recordType, interruptAt } = {}) {
  const absoluteRoot = root ?? dirname(file);
  const relativeFile = relative(absoluteRoot, file);
  const safeFile = resolveSafeRelativePath(absoluteRoot, relativeFile, { mustExist: true });
  const before = readFileSync(safeFile, "utf8");
  const loaded = readStructuredFile(safeFile, { root: absoluteRoot });
  const type = recordType ?? inferRecordType(loaded.record) ?? "book-project";
  const result = migrateRecord(type, loaded.record);
  if (interruptAt === "before-apply") {
    result.report.status = "blocked";
    result.report.changes = [];
    result.report.rollback_limit = "Recovery is explicit: no canonical write was attempted; rerun the dry-run after resolving the interruption.";
    result.diagnostics.push(diagnostic({ field: "$", problem: "migration interrupted", cause: "interruption injected before any apply phase", repair: "Resolve the interruption and rerun the dry-run; canonical source remains unchanged." }));
  }
  const after = readFileSync(safeFile, "utf8");
  const sourceUnchanged = sha256(before) === sha256(after);
  if (!sourceUnchanged) result.diagnostics.push(diagnostic({ problem: "canonical source changed", cause: "dry-run observed changed source bytes", repair: "Stop and investigate; dry-run must never write canonical source." }));
  result.report.canonical_source_unchanged = sourceUnchanged;
  result.diagnostics.sort((left, right) => `${left.field}\0${left.problem}`.localeCompare(`${right.field}\0${right.problem}`));
  return { ...result, recordType: type, canonical_source_unchanged: sourceUnchanged };
}
