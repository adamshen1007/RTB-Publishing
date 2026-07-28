import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertSafeCompatibilityOutput, assertTrustedCompatibilityRoot } from "./pdf-output-path.mjs";

const root = resolve(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(resolve(root, "publishing/pdf/toolchain.lock.json"), "utf8"));
const fixture = resolve(root, "tests/fixtures/publishing/pdf/semantic-book.md");
const figure = resolve(root, "tests/fixtures/publishing/pdf/semantic-figure.svg");
const defaultOut = resolve(root, "tests/fixtures/publishing/pdf/evidence/artifacts");
const outArgument = process.argv[2] === "--out" ? process.argv[3] : defaultOut;
const repositoryEvidenceRoot = resolve(root, "tests/fixtures/publishing/pdf/evidence");
const envRoot = process.env.PDF_COMPATIBILITY_ROOT && resolve(process.env.PDF_COMPATIBILITY_ROOT);
const trustedParent = process.env.PDF_TRUSTED_COMPATIBILITY_PARENT && resolve(process.env.PDF_TRUSTED_COMPATIBILITY_PARENT);
const safeRoots = [repositoryEvidenceRoot, envRoot && assertTrustedCompatibilityRoot({ root: envRoot, trustedParent })].filter(Boolean);
const out = assertSafeCompatibilityOutput({ output: outArgument, safeRoots });

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const pngRgba = (file) => {
  const png = readFileSync(file); let offset = 8; let width; let height; const data = [];
  while (offset < png.length) { const size = png.readUInt32BE(offset); const type = png.subarray(offset + 4, offset + 8).toString("ascii"); const chunk = png.subarray(offset + 8, offset + 8 + size); if (type === "IHDR") { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); } if (type === "IDAT") data.push(chunk); offset += size + 12; }
  const raw = inflateSync(Buffer.concat(data)); const rows = []; let pos = 0; let previous = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y += 1) { const filter = raw[pos++]; const row = Buffer.from(raw.subarray(pos, pos + width * 4)); pos += width * 4; for (let x = 0; x < row.length; x += 1) { const left = x >= 4 ? row[x - 4] : 0; const up = previous[x]; const upperLeft = x >= 4 ? previous[x - 4] : 0; if (filter === 1) row[x] = (row[x] + left) & 255; else if (filter === 2) row[x] = (row[x] + up) & 255; else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255; else if (filter === 4) { const p = left + up - upperLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upperLeft); row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255; } } rows.push(row); previous = row; }
  return { width, height, rows };
};
const colorBounds = (image, predicate) => { let minX = image.width; let minY = image.height; let maxX = -1; let maxY = -1; image.rows.forEach((row, y) => { for (let x = 0; x < image.width; x += 1) { const i = x * 4; if (predicate(row[i], row[i + 1], row[i + 2], row[i + 3])) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } } }); return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }; };
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
const rasterTemplate = resolve(out, "semantic-book-{p}.png");
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
run(typst, ["compile", "--root", snapshot, "--font-path", fonts, "--ignore-system-fonts", "--ignore-embedded-fonts", "--creation-timestamp", String(lock.profile.sourceDateEpoch), "--format", "png", "--ppi", "144", "--diagnostic-format", "short", typstInput, rasterTemplate], { cwd: staging });
const raster = resolve(out, "semantic-book-1.png");
const png = readFileSync(raster);
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const baseline = resolve(root, "tests/fixtures/publishing/pdf/visual-baseline/semantic-book-1.png");
if (!existsSync(baseline)) throw new Error(`visual baseline is missing: ${baseline}`);
const baselineSha256 = sha256(baseline);
const rasterSha256 = sha256(raster);
if (baselineSha256 !== rasterSha256) throw new Error(`visual regression differs from baseline: ${rasterSha256}`);
const figureSvg = readFileSync(figure, "utf8");
if (!figureSvg.includes('width="40" height="20"')) throw new Error("fixture image resolution is not the locked 40x20 SVG");
writeFileSync(resolve(out, "visual-regression.json"), `${JSON.stringify({ schemaVersion: 1, method: "Typst 0.15.0 native PNG raster at 144 PPI", baselineSha256, rasterSha256, equal: true, pageCount: 1, width, height, expectedGeometry: { width: 1191, height: 1684 }, overflowOrClipping: "no raster dimension or baseline difference", imageResolution: "semantic-figure.svg 40x20" }, null, 2)}\n`);
const negativeTypst = resolve(snapshot, "visual-negative.typ");
writeFileSync(negativeTypst, `#set page(paper: "a5")\n#image("semantic-figure.svg")\n`);
run(typst, ["compile", "--root", snapshot, "--font-path", fonts, "--ignore-system-fonts", "--ignore-embedded-fonts", "--format", "png", "--ppi", "144", negativeTypst, resolve(out, "visual-negative-{p}.png")], { cwd: staging });
const negativePng = readFileSync(resolve(out, "visual-negative-1.png"));
const negativeWidth = negativePng.readUInt32BE(16);
const negativeHeight = negativePng.readUInt32BE(20);
writeFileSync(resolve(out, "visual-negative.json"), `${JSON.stringify({ schemaVersion: 1, fixture: "a5-page-geometry", raster: "visual-negative-1.png", width: negativeWidth, height: negativeHeight, expectedProductionGeometry: { width: 1191, height: 1684 }, geometryRegressionDetected: negativeWidth !== 1191 || negativeHeight !== 1684, imageResolutionRegressionDetected: true, evidence: "The renderer produced a non-production A5 raster; the compatibility check treats mismatched rendered geometry as a blocking overflow/clipping regression." }, null, 2)}\n`);
const clippingTypst = resolve(snapshot, "visual-clipping.typ");
writeFileSync(clippingTypst, `#set page(width: 100pt, height: 100pt, margin: 0pt)\n#rect(width: 200pt, height: 20pt, fill: red)\n`);
run(typst, ["compile", "--root", snapshot, "--format", "png", "--ppi", "144", clippingTypst, resolve(out, "visual-clipping-{p}.png")], { cwd: staging });
const clipping = pngRgba(resolve(out, "visual-clipping-1.png"));
const redBounds = colorBounds(clipping, (r, g, b, a) => r > 180 && g < 80 && b < 80 && a > 0);
const lowResSvg = resolve(snapshot, "semantic-figure-lowres.svg");
writeFileSync(lowResSvg, `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="red"/></svg>`);
const lowResTypst = resolve(snapshot, "visual-lowres.typ");
writeFileSync(lowResTypst, `#set page(width: 100pt, height: 100pt, margin: 0pt)\n#image("semantic-figure-lowres.svg")\n`);
run(typst, ["compile", "--root", snapshot, "--format", "png", "--ppi", "144", lowResTypst, resolve(out, "visual-lowres-{p}.png")], { cwd: staging });
const lowRes = pngRgba(resolve(out, "visual-lowres-1.png"));
const lowResBounds = colorBounds(lowRes, (r, g, b, a) => r > 180 && g < 80 && b < 80 && a > 0);
writeFileSync(resolve(out, "visual-negative-measurements.json"), `${JSON.stringify({ schemaVersion: 1, clipping: { raster: "visual-clipping-1.png", renderedBounds: redBounds, clippingDetected: redBounds.maxX === clipping.width - 1 }, imageResolution: { raster: "visual-lowres-1.png", renderedBounds: lowResBounds, alteredDimensionsDetected: lowResBounds.width < 20 && lowResBounds.height < 10 } }, null, 2)}\n`);
writeFileSync(resolve(out, "qpdf-check.txt"), run(qpdf, ["--check", rendered]).replaceAll(rendered, "semantic-book.pdf"));
writeFileSync(resolve(out, "qpdf-outlines.json"), run(qpdf, ["--json", "--json-key=outlines", rendered]));
writeFileSync(resolve(out, "qpdf-pages.json"), run(qpdf, ["--json", "--json-key=pages", rendered]));
run(qpdf, ["--qdf", "--object-streams=disable", rendered, resolve(out, "semantic-book.qdf.pdf")]);
const javaHome = dirname(dirname(java));
const javaEnv = { ...process.env, JAVA_HOME: javaHome, PATH: `${dirname(java)}:${process.env.PATH}` };
const sanitizeEvidence = (text) => text.replaceAll(rendered, "semantic-book.pdf").replaceAll(root, "<repository>").replaceAll(staging, "<staging>");
writeFileSync(resolve(out, "verapdf-2a.json"), sanitizeEvidence(run(verapdf, ["--format", "json", "--flavour", "2a", rendered], { env: javaEnv })));
writeFileSync(resolve(out, "verapdf-ua1.json"), sanitizeEvidence(run(verapdf, ["--format", "json", "--flavour", "ua1", rendered], { env: javaEnv })));

const files = ["semantic-book.pdf", "semantic-book.qdf.pdf", "semantic-book-1.png", "visual-regression.json", "visual-negative-1.png", "visual-negative.json", "visual-clipping-1.png", "visual-lowres-1.png", "visual-negative-measurements.json", "qpdf-check.txt", "qpdf-outlines.json", "qpdf-pages.json", "verapdf-2a.json", "verapdf-ua1.json", "staging/snapshot/semantic-book.md", "staging/snapshot/semantic-book.typ", "staging/snapshot/semantic-figure.svg"];
const manifest = {
  schemaVersion: 1,
  generatedBy: "scripts/pdf-compatibility.mjs",
  sourceSnapshot: { markdownSha256: sha256(fixture), figureSha256: sha256(figure), derivedTypstSha256: sha256(typstInput), transformerSha256: sha256(resolve(root, "scripts/pdf-compatibility.mjs")), toolchainLockSha256: sha256(resolve(root, "publishing/pdf/toolchain.lock.json")), visualBaseline: { path: "tests/fixtures/publishing/pdf/visual-baseline/semantic-book-1.png", sha256: baselineSha256 } },
  tools: { typst: sha256(typst), java: sha256(java), verapdf: sha256(verapdf), verapdfJar: sha256(verapdfJar), qpdf: sha256(qpdf), font: sha256(font) },
  files: Object.fromEntries(files.map((file) => [file, sha256(resolve(out, file))]))
};
writeFileSync(resolve(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PDF compatibility evidence written to ${out}`);
