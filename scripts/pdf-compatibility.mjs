import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(resolve(root, "publishing/pdf/toolchain.lock.json"), "utf8"));
const fixture = resolve(root, "tests/fixtures/publishing/pdf/semantic-book.md");
const figure = resolve(root, "tests/fixtures/publishing/pdf/semantic-figure.svg");
const defaultOut = resolve(root, "tests/fixtures/publishing/pdf/evidence/artifacts");
const out = resolve(process.argv[2] === "--out" ? process.argv[3] : defaultOut);

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const requireEnvFile = (name) => {
  const file = process.env[name];
  if (!file || !existsSync(file)) throw new Error(`${name} must name an existing pinned tool file`);
  return resolve(file);
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8", env: options.env ?? process.env });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  return `${result.stdout}${result.stderr}`;
};
const verify = (name, file, expected) => {
  const actual = sha256(file);
  if (actual !== expected) throw new Error(`${name} SHA-256 mismatch: ${actual}`);
  return actual;
};

const typst = requireEnvFile("PDF_TYPST");
const java = requireEnvFile("PDF_JAVA");
const verapdf = requireEnvFile("PDF_VERAPDF");
const verapdfJar = requireEnvFile("PDF_VERAPDF_JAR");
const qpdf = requireEnvFile("PDF_QPDF");
const font = requireEnvFile("PDF_FONT");
const renderer = lock.tools.renderer;
const x64 = renderer.artifacts.find((artifact) => artifact.platform === "macos-x86_64");
verify("Typst executable", typst, x64.executableSha256);
verify("Temurin java executable", java, lock.tools.javaRuntime.artifacts[0].executableSha256);
verify("veraPDF launcher", verapdf, lock.tools.structuralValidator.executableSha256);
verify("veraPDF main jar", verapdfJar, lock.tools.structuralValidator.mainJarSha256);
verify("qpdf executable", qpdf, lock.tools.pdfParser.executableSha256);
verify("Noto Serif", font, lock.fonts[0].sha256);

rmSync(out, { recursive: true, force: true });
const staging = resolve(out, "staging");
const snapshot = resolve(staging, "snapshot");
const fonts = dirname(font);
const rendered = resolve(out, "semantic-book.pdf");
mkdirSync(snapshot, { recursive: true });
cpSync(fixture, resolve(snapshot, "semantic-book.md"));
cpSync(figure, resolve(snapshot, "semantic-figure.svg"));

const markdown = readFileSync(resolve(snapshot, "semantic-book.md"), "utf8");
for (const expected of ["title: PDF Toolchain Compatibility Fixture", "author: Fixture Author", "lang: en-US", "# Chapter one", "![A navy rectangle used by the compatibility fixture.]", "## Fixture values {#table-one}"]) {
  if (!markdown.includes(expected)) throw new Error(`canonical Markdown fixture is missing: ${expected}`);
}

// This fixture-scoped transformer is deliberately versioned with the snapshot.
// Typst is derived only; Markdown remains the authored input to every format.
const derivedTypst = `#set document(\n  title: "PDF Toolchain Compatibility Fixture",\n  author: "Fixture Author",\n  keywords: ("fixture", "PDF", "accessibility"),\n  date: datetime(year: 2026, month: 7, day: 28),\n)\n#set text(font: "Noto Serif", lang: "en", region: "US", size: 10pt)\n#outline(title: [Table of contents])\n\n= Chapter one <chapter-one>\n\nRead this #link(<chapter-one>)[internal link] and this #link("https://example.com/")[external link].\n\n- One\n- Two\n\n#figure(\n  image("semantic-figure.svg", alt: "A navy rectangle used by the compatibility fixture."),\n  caption: [Fixture figure caption],\n)\n\n== Fixture values <table-one>\n\n#table(\n  columns: 2,\n  table.header([Name], [Value]),\n  [First], [One],\n)\n`;
const typstInput = resolve(snapshot, "semantic-book.typ");
writeFileSync(typstInput, derivedTypst);

run(typst, ["compile", "--root", snapshot, "--font-path", fonts, "--ignore-system-fonts", "--ignore-embedded-fonts", "--creation-timestamp", String(lock.profile.sourceDateEpoch), "--pdf-standard", "a-2a,ua-1", "--diagnostic-format", "short", typstInput, rendered], { cwd: staging });
writeFileSync(resolve(out, "qpdf-check.txt"), run(qpdf, ["--check", rendered]).replaceAll(rendered, "semantic-book.pdf"));
writeFileSync(resolve(out, "qpdf-outlines.json"), run(qpdf, ["--json", "--json-key=outlines", rendered]));
writeFileSync(resolve(out, "qpdf-pages.json"), run(qpdf, ["--json", "--json-key=pages", rendered]));
run(qpdf, ["--qdf", "--object-streams=disable", rendered, resolve(out, "semantic-book.qdf.pdf")]);
const javaHome = dirname(dirname(java));
const javaEnv = { ...process.env, JAVA_HOME: javaHome, PATH: `${dirname(java)}:${process.env.PATH}` };
const sanitizeEvidence = (text) => text.replaceAll(rendered, "semantic-book.pdf").replaceAll(root, "<repository>").replaceAll(staging, "<staging>");
writeFileSync(resolve(out, "verapdf-2a.json"), sanitizeEvidence(run(verapdf, ["--format", "json", "--flavour", "2a", rendered], { env: javaEnv })));
writeFileSync(resolve(out, "verapdf-ua1.json"), sanitizeEvidence(run(verapdf, ["--format", "json", "--flavour", "ua1", rendered], { env: javaEnv })));

const files = ["semantic-book.pdf", "semantic-book.qdf.pdf", "qpdf-check.txt", "qpdf-outlines.json", "qpdf-pages.json", "verapdf-2a.json", "verapdf-ua1.json", "staging/snapshot/semantic-book.md", "staging/snapshot/semantic-book.typ"];
const manifest = {
  schemaVersion: 1,
  generatedBy: "scripts/pdf-compatibility.mjs",
  sourceSnapshot: { markdownSha256: sha256(fixture), figureSha256: sha256(figure), derivedTypstSha256: sha256(typstInput) },
  tools: { typst: sha256(typst), java: sha256(java), verapdf: sha256(verapdf), verapdfJar: sha256(verapdfJar), qpdf: sha256(qpdf), font: sha256(font) },
  files: Object.fromEntries(files.map((file) => [file, sha256(resolve(out, file))]))
};
writeFileSync(resolve(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PDF compatibility evidence written to ${out}`);
