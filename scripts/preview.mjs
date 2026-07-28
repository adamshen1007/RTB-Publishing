import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { resolve as resolveOutput } from "node:path";
import { discoverBookProject } from "./books/discovery.mjs";
import { DEFAULT_BOOK_PROJECT, DIST_DIR } from "./lib.mjs";

const project = discoverBookProject(process.argv[2] ?? DEFAULT_BOOK_PROJECT);
const BOOK_DIST_DIR = resolveOutput(DIST_DIR, "books", project.id);

if (!existsSync(resolve(BOOK_DIST_DIR, "index.html"))) {
  console.error("No HTML build found. Run pnpm build before pnpm preview.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("PORT must be an integer from 1 to 65535.");
  process.exit(1);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".epub": "application/epub+zip",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : normalize(requestPath).replace(/^[/\\]+/, "");
  const file = resolve(BOOK_DIST_DIR, relativePath);
  if (file !== BOOK_DIST_DIR && !file.startsWith(`${BOOK_DIST_DIR}${sep}`)) {
    response.writeHead(403).end("Forbidden");
  } else if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
  } else {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`RTB Publishing preview available at http://127.0.0.1:${port}`);
  console.log("Press Ctrl+C to stop.");
});
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
