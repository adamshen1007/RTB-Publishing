import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { projectOutputPath } from "./books/assemble.mjs";
import { resolveBookProject } from "./books/discovery.mjs";
import { resolveCurrentGeneration } from "./books/generation.mjs";
import { DIST_DIR, ROOT } from "./lib.mjs";
import { acquireWorkspaceOutputLock, pinPhysicalDirectory } from "./state/project-lock.mjs";

const contentTypes = { ".css": "text/css; charset=utf-8", ".epub": "application/epub+zip", ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
function htmlName(project) { return projectOutputPath(project, resolve(DIST_DIR, "books"), "html").split("/").at(-1); }

export async function readPreviewAsset(project, requestPath, { workspaceRoot = project.workspaceRoot ?? ROOT, outputRoot = resolve(DIST_DIR, "books"), hooks = {} } = {}) {
  const logicalWorkspace = resolve(workspaceRoot), workspace = pinPhysicalDirectory(workspaceRoot).path, value = relative(logicalWorkspace, resolve(outputRoot)); if (value === ".." || value.startsWith(`..${sep}`)) throw new Error("Preview output path escapes the locked workspace."); const physicalOutputRoot = resolve(workspace, value), lock = await acquireWorkspaceOutputLock(workspace, { ownerId: `preview-read-${process.pid}` });
  try {
    const generation = resolveCurrentGeneration(project, { outputRoot: physicalOutputRoot }), requested = decodeURIComponent(new URL(requestPath, "http://localhost").pathname), relativePath = requested === "/" ? htmlName(project) : normalize(requested).replace(/^[/\\]+/, ""), file = resolve(generation.outputDirectory, relativePath);
    if (file !== generation.outputDirectory && !file.startsWith(`${generation.outputDirectory}${sep}`)) return { status: 403, body: Buffer.from("Forbidden"), contentType: "text/plain; charset=utf-8", generation: generation.generation };
    if (!existsSync(file)) return { status: 404, body: Buffer.from("Not found"), contentType: "text/plain; charset=utf-8", generation: generation.generation };
    const expected = lstatSync(file); if (expected.isSymbolicLink() || !expected.isFile() || expected.nlink !== 1) throw new Error("Preview target must be one private regular file."); const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { const opened = fstatSync(fd); if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== expected.dev || opened.ino !== expected.ino || opened.size !== expected.size || opened.mtimeMs !== expected.mtimeMs || opened.ctimeMs !== expected.ctimeMs) throw new Error("Preview target identity changed before descriptor read."); await hooks.afterOpen?.({ file, generation, fd }); const chunks = []; let offset = 0, first = true; while (offset < opened.size) { const chunk = Buffer.alloc(Math.min(65_536, opened.size - offset)), count = readSync(fd, chunk, 0, chunk.length, offset); if (count <= 0) throw new Error("Preview target ended during descriptor read."); chunks.push(chunk.subarray(0, count)); offset += count; if (first) { first = false; await hooks.duringRead?.({ file, generation, fd, offset }); } } const body = Buffer.concat(chunks), after = fstatSync(fd); if (!after.isFile() || after.nlink !== 1 || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error("Preview target descriptor changed during read."); const currentPath = lstatSync(file); if (currentPath.isSymbolicLink() || !currentPath.isFile() || currentPath.dev !== opened.dev || currentPath.ino !== opened.ino || currentPath.size !== opened.size || currentPath.mtimeMs !== opened.mtimeMs || currentPath.ctimeMs !== opened.ctimeMs) throw new Error("Preview target path changed during descriptor read."); const current = resolveCurrentGeneration(project, { outputRoot: physicalOutputRoot }); if (current.generation !== generation.generation || current.generationIdentity.dev !== generation.generationIdentity.dev || current.generationIdentity.ino !== generation.generationIdentity.ino) throw new Error("Preview generation changed during descriptor read."); await hooks.afterRead?.({ file, generation, body }); return { status: 200, body, contentType: contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream", generation: generation.generation }; } finally { closeSync(fd); }
  } finally { lock.release(); }
}

export function createPreviewServer(project, options = {}) { return createServer(async (request, response) => { try { const result = await readPreviewAsset(project, request.url, options); response.writeHead(result.status, { "cache-control": "no-store", "content-type": result.contentType, "x-rtb-generation": result.generation }).end(result.body); } catch (error) { response.writeHead(503, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" }).end(error.message); } }); }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const project = resolveBookProject(process.argv[2]), port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) { console.error("PORT must be an integer from 1 to 65535."); process.exit(1); }
  try { await readPreviewAsset(project, "/"); } catch (error) { console.error(error.message); process.exit(1); }
  const server = createPreviewServer(project); server.listen(port, "127.0.0.1", () => { console.log(`RTB Publishing preview available at http://127.0.0.1:${port}`); console.log("Press Ctrl+C to stop."); }); process.on("SIGINT", () => server.close(() => process.exit(0))); process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
