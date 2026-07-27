import { existsSync } from "node:fs";
import { relative } from "node:path";
import { ROOT } from "../lib.mjs";
import { LOOPBACK_HOSTS, PLATFORM_WEB_DIRECTORY, WORKSPACE_FILE } from "./constants.mjs";
import { buildWorkspaceIndex } from "./indexer.mjs";
import { loadWorkspace } from "./model.mjs";
import { startPlatform } from "./server.mjs";
import { addProject, inspectAnyProject, removeProject } from "./registry.mjs";
import { cleanJobs, diagnostics, pilotStatus, sanitizedJobs, validatePilotSessions, writeJsonOutput } from "./operations.mjs";
import { allowExternalRoot, importExternalProject, inspectExternalCandidate, loadEffectiveWorkspace, loadLocalWorkspace, removeExternalProject, removeExternalRoot } from "./local-state.mjs";
import { createWorkspaceBackup, inspectWorkspaceBackup, restoreWorkspaceBackup } from "./backups.mjs";

export async function runPlatformCommand(positionals, options) {
  const [command, action, subject] = positionals;
  if (command === "project") {
    if (action === "list") return loadEffectiveWorkspace().projects.forEach((project) => console.log(`${project.id.padEnd(22)} ${project.kind.padEnd(12)} ${project.source.padEnd(10)} ${project.path}`));
    if (action === "inspect") return console.log(JSON.stringify(inspectAnyProject(subject), null, 2));
    if (action === "onboard") {
      const candidate = inspectExternalCandidate(subject);
      console.log(JSON.stringify({ ...candidate, nextCommand: candidate.allowed ? `rtb-publishing platform project import "${candidate.path}" --dry-run` : `rtb-publishing platform root allow "${candidate.recommendedRoot}" --dry-run` }, null, 2));
      return;
    }
    if (action === "import") {
      const project = importExternalProject(subject, { id: options.id, dryRun: options["dry-run"] });
      console.log(`${options["dry-run"] ? "Would import" : "Imported"}: ${project.id} (local read-only)`);
      return;
    }
    if (action === "add") {
      const project = addProject(subject, { id: options.id, dryRun: options["dry-run"] });
      console.log(`${options["dry-run"] ? "Would add" : "Added"}: ${project.id} (${project.kind})`);
      return;
    }
    if (action === "remove") {
      const current = inspectAnyProject(subject);
      const project = current.source === "local" ? removeExternalProject(subject, { dryRun: options["dry-run"], confirm: options.confirm }) : removeProject(subject, { dryRun: options["dry-run"], confirm: options.confirm });
      console.log(`${options["dry-run"] ? "Would remove" : "Removed"}: ${project.id}; project files unchanged.`);
      return;
    }
    throw new Error("Platform project command must be list, inspect, onboard, import, add, or remove.");
  }
  if (command === "root") {
    if (action === "list") return loadLocalWorkspace().allowedRoots.forEach((root) => console.log(root));
    if (action === "allow") {
      const root = allowExternalRoot(subject, { dryRun: options["dry-run"], confirm: options.confirm });
      console.log(`${options["dry-run"] ? "Would allow" : "Allowed"}: ${root}`);
      return;
    }
    if (action === "remove") {
      const root = removeExternalRoot(subject, { dryRun: options["dry-run"], confirm: options.confirm });
      console.log(`${options["dry-run"] ? "Would remove" : "Removed"}: ${root}`);
      return;
    }
    throw new Error("Platform root command must be list, allow, or remove.");
  }
  if (command === "backup") {
    if (action === "create") {
      const result = createWorkspaceBackup({ output: options.output, dryRun: options["dry-run"] });
      console.log(`${options["dry-run"] ? "Would write" : "Wrote"} local workspace backup: ${result.file}`);
      return;
    }
    if (action === "inspect") return console.log(JSON.stringify(inspectWorkspaceBackup(subject), null, 2));
    if (action === "restore") {
      const result = restoreWorkspaceBackup(subject, { dryRun: options["dry-run"], confirm: options.confirm });
      console.log(`${options["dry-run"] ? "Would restore" : "Restored"}: ${result.projects} local project(s), ${result.roots} root(s); ${result.scope}.`);
      return;
    }
    throw new Error("Platform backup command must be create, inspect, or restore.");
  }
  if (command === "diagnose") {
    const report = diagnostics();
    if (options.output) console.log(`Wrote sanitized diagnostics: ${writeJsonOutput(options.output, report)}`);
    else console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (command === "jobs") {
    if (action === "export") {
      if (!options.output) throw new Error("jobs export requires --output <file>.");
      console.log(`Wrote sanitized job export: ${writeJsonOutput(options.output, sanitizedJobs())}`);
      return;
    }
    if (action === "clean") {
      const value = options["older-than"];
      if (!/^\d+d$/.test(value ?? "")) throw new Error("jobs clean requires --older-than <days>d.");
      const files = cleanJobs({ days: Number(value.slice(0, -1)), dryRun: options["dry-run"] });
      console.log(`${options["dry-run"] ? "Would delete" : "Deleted"} ${files.length} terminal job record(s).`);
      return;
    }
    throw new Error("Platform jobs command must be export or clean.");
  }
  if (command === "pilot" && action === "check") {
    console.log(`✓ ${validatePilotSessions()} pilot session record(s) validated.`);
    return;
  }
  if (command === "pilot" && action === "status") {
    const status = pilotStatus();
    if (options.json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`Sessions: ${status.sessions.observed}/${status.sessions.required}`);
      console.log(`Represented projects: ${status.projects.represented}/${status.projects.required}`);
      console.log(`Date span: ${status.dateSpanDays.observed}/${status.dateSpanDays.required} days`);
      console.log(`Task coverage: ${status.tasks.observed.length}/${status.tasks.required.length}${status.tasks.missing.length ? `; missing ${status.tasks.missing.join(", ")}` : ""}`);
      console.log(`Decision: ${status.decision}`);
    }
    return;
  }
  if (command === "doctor") {
    const checks = [["Workspace manifest", existsSync(WORKSPACE_FILE)], ["Dashboard assets", existsSync(PLATFORM_WEB_DIRECTORY)], ["Loopback host", LOOPBACK_HOSTS.has(options.host ?? "127.0.0.1")]];
    checks.forEach(([label, passed]) => console.log(`${passed ? "✓" : "✗"} ${label}`));
    buildWorkspaceIndex();
    if (checks.some(([, passed]) => !passed)) throw new Error("Platform doctor found setup problems.");
    return;
  }
  if (command === "index") {
    const index = buildWorkspaceIndex();
    if (options.json) console.log(JSON.stringify(index, null, 2));
    else {
      console.log(`${index.workspace.name}: ${index.projects.length} projects`);
      for (const project of index.projects) console.log(`${project.id.padEnd(22)} ${project.stage.padEnd(12)} ${project.nextAction}`);
    }
    return;
  }
  if (command === "start") {
    const host = options.host ?? "127.0.0.1";
    const port = Number(options.port ?? 4310);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535.");
    const platform = await startPlatform({ host, port });
    const address = platform.server.address();
    console.log(`RTB Publishing workspace: http://${host.includes(":") ? `[${host}]` : host}:${address.port}`);
    console.log(`Workspace source: ${relative(ROOT, WORKSPACE_FILE)}`);
    const stop = () => platform.server.close(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return new Promise(() => {});
  }
  throw new Error("Platform command must be doctor, index, start, project, root, backup, diagnose, jobs, or pilot.");
}
