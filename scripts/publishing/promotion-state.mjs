import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { writeJsonAtomic } from "./common.mjs";
import { assertLiveProjectLock, assertLiveWorkspaceOutputLock, assertPinnedEntry, pinPhysicalEntry } from "../state/project-lock.mjs";

const PHASES = new Set(["prepared", "backup-intent", "backup-complete", "activate-intent", "activate-complete", "material-verified", "ledger-completed", "commit-cleanup-intent", "commit-cleanup-complete", "rollback-quarantine-intent", "rollback-quarantine-complete", "rollback-restore-intent", "rollback-restore-complete", "rollback-cleanup-intent", "rollback-cleanup-complete"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const event = (hook, name, context) => hook?.(name, context);
const authorities = new WeakMap();
function syncDirectory(directory) { const fd = openSync(directory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
function ensureDirectory(directory) { mkdirSync(directory, { recursive: true }); syncDirectory(directory); if (dirname(directory) !== directory && existsSync(dirname(directory))) syncDirectory(dirname(directory)); }
function durableRename(source, target) { renameSync(source, target); syncDirectory(dirname(source)); if (dirname(target) !== dirname(source)) syncDirectory(dirname(target)); }
function durableRemove(path, options = {}) { rmSync(path, options); syncDirectory(dirname(path)); }
function guard(authority, context) { const state = authorities.get(authority); if (!state || state.context.outputRoot !== context.outputRoot || state.context.projectId !== context.projectId || state.context.releaseId !== context.releaseId || state.context.token !== context.token) throw new Error("Promotion mutation requires exact live branded recovery authority."); assertLiveWorkspaceOutputLock(state.workspaceLock, state.workspaceRoot); assertLiveProjectLock(state.projectLock, state.projectRoot); assertPromotionTransaction(state.transaction); return state; }
function refresh(authority, context) { const state = authorities.get(authority); state.context = context; state.transaction = pinPromotionTransaction(context); }
function rename(context, source, target, authority) { guard(authority, context); if (context.testOnlySkipDurability) renameSync(source, target); else durableRename(source, target); refresh(authority, context); }
function remove(context, path, options = {}, authority) { guard(authority, context); if (context.testOnlySkipDurability) rmSync(path, options); else durableRemove(path, options); refresh(authority, context); }
function ensure(context, directory, authority) { guard(authority, context); if (context.testOnlySkipDurability) mkdirSync(directory, { recursive: true }); else ensureDirectory(directory); refresh(authority, context); }
function safeIdentity(projectId, releaseId, token) { if (!SAFE_ID.test(projectId) || !SAFE_ID.test(releaseId) || !UUID.test(token)) throw new Error("Promotion identity must use safe project/release IDs and a cryptographically random UUID token."); }
function safeExisting(path) { if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Promotion paths cannot be symbolic links."); }
function inside(root, path) { const value = relative(resolve(root), resolve(path)); return value !== ".." && !value.startsWith(`..${sep}`); }

export function promotionContext(input) {
  const { outputRoot, projectId, releaseId, token } = input;
  safeIdentity(projectId, releaseId, token);
  const root = resolve(outputRoot), stagingRoot = resolve(root, ".staging"), stateRoot = resolve(root, ".promotion-state"), projectRoot = resolve(root, projectId);
  const context = { outputRoot: root, projectId, releaseId, token, staging: resolve(stagingRoot, `${projectId}-${token}`), target: resolve(projectRoot, releaseId), backup: resolve(stateRoot, `${projectId}-${releaseId}-${token}.backup`), quarantine: resolve(stateRoot, `${projectId}-${releaseId}-${token}.quarantine`), marker: resolve(stateRoot, `${projectId}-${releaseId}-${token}.json`), testOnlySkipDurability: input.testOnlySkipDurability === true };
  if (![context.staging, context.target, context.backup, context.quarantine, context.marker].every((path) => inside(root, path))) throw new Error("Promotion paths escape the trusted output root.");
  return context;
}

function validatePaths(context) { for (const path of [context.outputRoot, dirname(context.staging), dirname(context.target), dirname(context.marker), context.staging, context.target, context.backup, context.quarantine, context.marker]) safeExisting(path); }
export function pinPromotionTransaction(context) {
  validatePaths(context);
  const paths = [...new Set([context.outputRoot, dirname(context.staging), dirname(context.target), dirname(context.marker), context.staging, context.target, context.backup, context.quarantine, context.marker])];
  return paths.map((path) => existsSync(path) ? { path, missing: false, expected: lstatSync(path).isDirectory() ? "directory" : "file", identity: pinPhysicalEntry(path, lstatSync(path).isDirectory() ? "directory" : "file") } : { path, missing: true });
}
export function assertPromotionTransaction(authority) {
  for (const entry of authority) {
    if (entry.missing) { if (existsSync(entry.path)) throw new Error(`Promotion transaction identity changed: ${entry.path}`); }
    else assertPinnedEntry(entry.identity, entry.expected);
  }
  return true;
}
export function authorizePromotion(context, { workspaceRoot, projectRoot, workspaceLock, projectLock }) { assertLiveWorkspaceOutputLock(workspaceLock, workspaceRoot); assertLiveProjectLock(projectLock, projectRoot); const authority = Object.freeze({}); authorities.set(authority, { context, workspaceRoot, projectRoot, workspaceLock, projectLock, transaction: pinPromotionTransaction(context) }); return authority; }
function markerValue(context, phase, hadPrior) { return { schemaVersion: 1, projectId: context.projectId, releaseId: context.releaseId, token: context.token, phase, hadPrior }; }
function writeMarker(context, phase, hadPrior, authority, hook) { guard(authority, context); event(hook, `before-marker-${phase}`, context); guard(authority, context); ensure(context, dirname(context.marker), authority); guard(authority, context); if (context.testOnlySkipDurability) writeFileSync(context.marker, `${JSON.stringify(markerValue(context, phase, hadPrior))}\n`); else { writeJsonAtomic(context.marker, markerValue(context, phase, hadPrior)); syncDirectory(dirname(context.marker)); } const next = { ...context, phase, hadPrior }; refresh(authority, next); const transaction = authorities.get(authority).transaction; try { event(hook, `after-marker-${phase}`, next); } catch (error) { error.promotionContext = next; error.promotionTransactionAuthority = transaction; throw error; } return next; }
function readMarker(context) {
  const value = JSON.parse(readFileSync(context.marker, "utf8"));
  if (!exactKeys(value, ["schemaVersion", "projectId", "releaseId", "token", "phase", "hadPrior"]) || value.schemaVersion !== 1 || value.projectId !== context.projectId || value.releaseId !== context.releaseId || value.token !== context.token || !PHASES.has(value.phase) || typeof value.hadPrior !== "boolean") throw new Error("Promotion recovery marker is malformed or mismatched; no filesystem mutation was performed.");
  return { ...context, phase: value.phase, hadPrior: value.hadPrior };
}
function removeMarker(context, authority, hook) { event(hook, "before-marker-cleanup", context); remove(context, context.marker, { force: true }, authority); event(hook, "after-marker-cleanup", context); }

export function beginPromotion(input, authority, hook) {
  let context = promotionContext(input); validatePaths(context);
  guard(authority, context);
  if (!existsSync(context.staging)) throw new Error("Promotion staging directory is missing.");
  if (existsSync(context.marker) || existsSync(context.backup) || existsSync(context.quarantine)) throw new Error("Promotion state already exists; recover it before starting another transaction.");
  ensure(context, dirname(context.target), authority);
  const hadPrior = existsSync(context.target);
  context = writeMarker(context, "prepared", hadPrior, authority, hook);
  context = writeMarker(context, "backup-intent", hadPrior, authority, hook);
  event(hook, "before-old-to-backup", context); if (hadPrior) rename(context, context.target, context.backup, authority); event(hook, "after-old-to-backup", context);
  context = writeMarker(context, "backup-complete", hadPrior, authority, hook);
  context = writeMarker(context, "activate-intent", hadPrior, authority, hook);
  event(hook, "before-staging-to-target", context); rename(context, context.staging, context.target, authority); event(hook, "after-staging-to-target", context);
  return writeMarker(context, "activate-complete", hadPrior, authority, hook);
}

export function markPromotionMaterialVerified(context, authority, hook) { validatePaths(context); return writeMarker(context, "material-verified", context.hadPrior, authority, hook); }
export function markPromotionLedgerCompleted(context, authority, hook) { validatePaths(context); return writeMarker(context, "ledger-completed", context.hadPrior, authority, hook); }
export function commitPromotion(context, authority, hook) { guard(authority, context); if (context.phase !== "ledger-completed") throw new Error("Promotion cleanup requires durable ledger completion authority."); context = writeMarker(context, "commit-cleanup-intent", context.hadPrior, authority, hook); event(hook, "before-backup-cleanup", context); if (existsSync(context.backup)) remove(context, context.backup, { recursive: true, force: true }, authority); event(hook, "after-backup-cleanup", context); context = writeMarker(context, "commit-cleanup-complete", context.hadPrior, authority, hook); removeMarker(context, authority, hook); return context; }

export function rollbackPromotion(context, authority, hook) {
  validatePaths(context);
  guard(authority, context);
  context = writeMarker(context, "rollback-quarantine-intent", context.hadPrior, authority, hook);
  event(hook, "before-target-quarantine", context); if (existsSync(context.target) && !existsSync(context.quarantine)) rename(context, context.target, context.quarantine, authority); event(hook, "after-target-quarantine", context);
  context = writeMarker(context, "rollback-quarantine-complete", context.hadPrior, authority, hook);
  context = writeMarker(context, "rollback-restore-intent", context.hadPrior, authority, hook);
  event(hook, "before-backup-restore", context); if (context.hadPrior && existsSync(context.backup) && !existsSync(context.target)) rename(context, context.backup, context.target, authority); event(hook, "after-backup-restore", context);
  context = writeMarker(context, "rollback-restore-complete", context.hadPrior, authority, hook);
  context = writeMarker(context, "rollback-cleanup-intent", context.hadPrior, authority, hook);
  event(hook, "before-quarantine-cleanup", context); if (existsSync(context.quarantine)) remove(context, context.quarantine, { recursive: true, force: true }, authority); if (existsSync(context.staging)) remove(context, context.staging, { recursive: true, force: true }, authority); event(hook, "after-quarantine-cleanup", context);
  context = writeMarker(context, "rollback-cleanup-complete", context.hadPrior, authority, hook); removeMarker(context, authority, hook); return context;
}

function finishRollback(context, authority, hook) {
  const early = new Set(["prepared", "backup-intent"]);
  if (early.has(context.phase) && !existsSync(context.backup)) { if (existsSync(context.staging)) remove(context, context.staging, { recursive: true, force: true }, authority); removeMarker(context, authority, hook); return context; }
  if (!["rollback-quarantine-complete", "rollback-restore-intent", "rollback-restore-complete", "rollback-cleanup-intent", "rollback-cleanup-complete"].includes(context.phase)) {
    context = writeMarker(context, "rollback-quarantine-intent", context.hadPrior, authority, hook);
    if (existsSync(context.target) && !existsSync(context.quarantine)) rename(context, context.target, context.quarantine, authority);
    context = writeMarker(context, "rollback-quarantine-complete", context.hadPrior, authority, hook);
  }
  if (!["rollback-restore-complete", "rollback-cleanup-intent", "rollback-cleanup-complete"].includes(context.phase)) {
    context = writeMarker(context, "rollback-restore-intent", context.hadPrior, authority, hook);
    if (context.hadPrior && existsSync(context.backup) && !existsSync(context.target)) rename(context, context.backup, context.target, authority);
    context = writeMarker(context, "rollback-restore-complete", context.hadPrior, authority, hook);
  }
  context = writeMarker(context, "rollback-cleanup-intent", context.hadPrior, authority, hook);
  if (existsSync(context.quarantine)) remove(context, context.quarantine, { recursive: true, force: true }, authority); if (existsSync(context.staging)) remove(context, context.staging, { recursive: true, force: true }, authority);
  context = writeMarker(context, "rollback-cleanup-complete", context.hadPrior, authority, hook); removeMarker(context, authority, hook); return context;
}

export function authorizePromotionRecovery(input, options) { const trusted = promotionContext(input); validatePaths(trusted); if (!existsSync(trusted.marker)) return { state: "none", context: trusted, authority: authorizePromotion(trusted, options) }; const context = readMarker(trusted); validatePaths(context); return { state: "ready", context, authority: authorizePromotion(context, options) }; }
export function recoverPromotion(input, authority, hook) {
  const trusted = promotionContext(input); validatePaths(trusted); guard(authority, trusted); if (!existsSync(trusted.marker)) return { state: "none", context: trusted };
  let context = readMarker(trusted); validatePaths(context); guard(authority, context);
  if (context.phase === "material-verified") return { state: "completion-required", context };
  if (["ledger-completed", "commit-cleanup-intent", "commit-cleanup-complete"].includes(context.phase)) { if (context.phase === "ledger-completed") context = writeMarker(context, "commit-cleanup-intent", context.hadPrior, authority, hook); if (existsSync(context.backup)) remove(context, context.backup, { recursive: true, force: true }, authority); if (context.phase !== "commit-cleanup-complete") context = writeMarker(context, "commit-cleanup-complete", context.hadPrior, authority, hook); removeMarker(context, authority, hook); return { state: "committed", context }; }
  context = finishRollback(context, authority, hook); return { state: "rolled-back", context };
}

export function promotionMarkers(outputRoot, projectId, releaseId, { testOnlySkipDurability = false } = {}) { if (!SAFE_ID.test(projectId) || !SAFE_ID.test(releaseId)) throw new Error("Unsafe promotion identity."); const root = resolve(outputRoot, ".promotion-state"); if (!existsSync(root)) return []; safeExisting(root); return readdirSync(root).filter((name) => name.startsWith(`${projectId}-${releaseId}-`) && name.endsWith(".json")).sort().map((name) => { const token = basename(name, ".json").slice(`${projectId}-${releaseId}-`.length); return promotionContext({ outputRoot, projectId, releaseId, token, testOnlySkipDurability }); }); }
