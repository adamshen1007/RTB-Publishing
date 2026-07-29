import assert from "node:assert/strict";
import { mkdtempSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import yazl from "yazl";
import {
  assertBaselinePreconditions,
  assertStableRepositorySnapshot,
  normalizeEpubDocument,
  readEpubEntries,
  runBaselineCapture
} from "../scripts/record-increment-1-baseline.mjs";

const passedCommands = [
  { id: "pnpm-check", exitCode: 0, result: "passed" },
  { id: "pnpm-build", exitCode: 0, result: "passed" },
  { id: "pnpm-verify-outputs", exitCode: 0, result: "passed" }
];

test("Increment 1 baseline requires a clean worktree and all required commands", () => {
  assert.doesNotThrow(() => assertBaselinePreconditions({ dirty: false, commands: passedCommands }));
  assert.throws(() => assertBaselinePreconditions({ dirty: true, commands: passedCommands }), /clean Git worktree/);
  assert.throws(() => assertBaselinePreconditions({ dirty: false, commands: passedCommands.slice(0, 2) }), /pnpm-verify-outputs/);
  assert.throws(() => assertBaselinePreconditions({ dirty: false, commands: [...passedCommands.slice(0, 2), { id: "pnpm-verify-outputs", exitCode: 1, result: "failed" }] }), /pnpm-verify-outputs/);
});

test("EPUB semantic snapshots exclude build-time metadata", () => {
  const first = '<dc:date id="epub-date">2026-07-27T14:45:00Z</dc:date><meta property="dcterms:modified">2026-07-27T14:45:00Z</meta>';
  const second = '<dc:date id="epub-date" content="2026-07-27T15:00:00Z" /><meta content="2026-07-27T15:00:00Z" property="dcterms:modified" />';
  assert.equal(normalizeEpubDocument(first), normalizeEpubDocument(second));
  assert.equal(
    normalizeEpubDocument('<meta data-note="a > b" property="dcterms:modified" content="2026-07-27T15:00:00Z" />'),
    '<meta content="[build-time]" data-note="a > b" property="dcterms:modified" />'
  );
});

test("baseline capture rejects a revision or worktree change after checks complete", async () => {
  const snapshots = [
    { commit: "abc123", dirty: false },
    { commit: "def456", dirty: false }
  ];
  await assert.rejects(
    runBaselineCapture("unused.json", {
      readSnapshot: () => snapshots.shift(),
      runCommand: (command) => ({ id: command.id, exitCode: 0, result: "passed" }),
      writeRecord: async (_output, options) => {
        const end = options.readSnapshot();
        assertStableRepositorySnapshot(options.repositoryStart, end);
      }
    }),
    /revision changed during capture/
  );
  assert.throws(
    () => assertStableRepositorySnapshot({ commit: "abc123", dirty: false }, { commit: "abc123", dirty: true }),
    /throughout capture/
  );
});

test("EPUB entries are read through the Node ZIP reader", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "rtb-epub-"));
  const epubFile = resolve(directory, "sample.epub");
  const archive = new yazl.ZipFile();
  archive.addBuffer(Buffer.from("<package><dc:date>2026-07-27</dc:date></package>"), "EPUB/content.opf");
  archive.addBuffer(Buffer.from("ignored"), "META-INF/container.xml");
  const writing = pipeline(archive.outputStream, createWriteStream(epubFile));
  archive.end();
  await writing;
  try {
    assert.deepEqual(await readEpubEntries(epubFile), [
      { entry: "EPUB/content.opf", content: "<package><dc:date>2026-07-27</dc:date></package>" }
    ]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
