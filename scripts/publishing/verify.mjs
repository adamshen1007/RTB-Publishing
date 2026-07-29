import { readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { command, fileHash } from "./common.mjs";
import { verifyHtmlChapterAnchors } from "../verify-outputs.mjs";

const normalize = (value) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
const htmlText = (file) => normalize(readFileSync(file, "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|#160);/g, " ").replace(/&amp;/g, "&"));
const pandocText = (file) => normalize(command("pandoc", [file, "--to=plain"], { capture: true }).stdout);

function collectRoles(node, roles) { if (!node || typeof node !== "object") return; if (typeof node.role === "string") roles.set(node.role, (roles.get(node.role) ?? 0) + 1); for (const child of node.children ?? []) collectRoles(child, roles); }
async function pdfSemantics(file) {
  const document = await getDocument({ data: new Uint8Array(readFileSync(file)), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [], urls = new Set(), roles = new Map(); let annotations = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber), content = await page.getTextContent(), pageAnnotations = await page.getAnnotations(), tree = await page.getStructTree();
    pages.push(content.items.map((item) => item.str).join(" ")); annotations += pageAnnotations.length;
    for (const item of pageAnnotations) if (item.url) urls.add(item.url);
    collectRoles(tree, roles);
  }
  const metadata = await document.getMetadata();
  return { text: normalize(pages.join(" ")), pages: document.numPages, annotations, urls, roles, language: metadata.info?.Language ?? metadata.metadata?.get("dc:language") ?? null };
}

function requireTitles(text, titles, format) { const missing = titles.filter((title) => !text.includes(normalize(title))); if (missing.length) throw new Error(`${format} semantic validation is missing chapter titles: ${missing.join(", ")}`); }
function requireOrder(text, titles, format) { let cursor = -1; for (const title of titles) { const next = text.indexOf(title, cursor + 1); if (next < cursor) throw new Error(`${format} chapter order differs from canonical order.`); cursor = next; } }
function tokenCoverage(source, output) { const tokens = (value) => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [], available = new Map(); for (const token of tokens(output)) available.set(token, (available.get(token) ?? 0) + 1); const expected = tokens(source); let found = 0; for (const token of expected) { const count = available.get(token) ?? 0; if (count > 0) { found += 1; available.set(token, count - 1); } } return expected.length ? found / expected.length : 1; }
export function assertSafeMarkup(markup, format) { if (/<(?:script|iframe|object|embed|form|button)\b/i.test(markup) || /<input\b(?![^>]*\btype=["']?checkbox\b)/i.test(markup) || /\son[a-z]+\s*=/i.test(markup) || /\b(?:href|src|action|formaction)\s*=\s*["']?\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(markup) || /<meta\b[^>]*http-equiv/i.test(markup)) throw new Error(`${format} security validation rejected executable or unsafe markup.`); }
function epubStructure(file) { const entries = command("unzip", ["-Z1", file]).stdout.trim().split(/\r?\n/), required = ["mimetype", "META-INF/container.xml", "EPUB/content.opf", "EPUB/nav.xhtml"]; for (const name of required) if (!entries.includes(name)) throw new Error(`EPUB package is missing ${name}.`); const xhtml = entries.filter((name) => name.endsWith(".xhtml")).map((name) => command("unzip", ["-p", file, name]).stdout).join("\n"); return { entries, xhtml }; }
function runEpubCheck(file, tools) { const reportFile = resolve(dirname(file), `.epubcheck-${process.pid}.json`); try { const result = command(tools.java, ["-Xmx96m", "-jar", tools.epubJar, "--json", reportFile, file], { allowFailure: true, env: { JAVA_HOME: tools.javaHome } }), report = JSON.parse(readFileSync(reportFile, "utf8")), summary = report.checker; if (result.status !== 0 || summary.nFatal || summary.nError || summary.nWarning || summary.nUsage) throw new Error(`W3C EPUBCheck rejected ${basename(file)}: ${summary.nFatal} fatal, ${summary.nError} error, ${summary.nWarning} warning, ${summary.nUsage} usage.`); return { version: summary.checkerVersion, fatal: summary.nFatal, errors: summary.nError, warnings: summary.nWarning, usage: summary.nUsage, spineItems: report.publication.nSpines }; } finally { rmSync(reportFile, { force: true }); } }
function assertInternalHtmlLinks(html) { const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])); for (const match of html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(match[1])) throw new Error(`HTML navigation points to missing anchor #${match[1]}.`); }

export async function verifyFormats({ project, snapshotMarkdown, outputs, pdfTools, pdfDerived, sourceFingerprint, env = process.env }) {
  const titles = project.chapters.map((chapter) => normalize(readFileSync(chapter.sourcePath, "utf8").match(/^#\s+(.+)$/m)?.[1] ?? chapter.id));
  const html = readFileSync(outputs.html, "utf8"); if (!/^<!DOCTYPE html>/i.test(html)) throw new Error("HTML validator rejected the document shell."); assertSafeMarkup(html, "HTML");
  if (readFileSync(outputs.epub).subarray(0, 2).toString("ascii") !== "PK") throw new Error("EPUB validator rejected the ZIP signature.");
  const anchorFailures = verifyHtmlChapterAnchors(html, project.chapters); if (anchorFailures.length) throw new Error(anchorFailures.join("\n")); assertInternalHtmlLinks(html);
  const epub = epubStructure(outputs.epub); assertSafeMarkup(epub.xhtml, "EPUB"); const epubCheck = runEpubCheck(outputs.epub, pdfTools);
  const canonicalText = pandocText(snapshotMarkdown), texts = { html: htmlText(outputs.html), epub: pandocText(outputs.epub) }, pdf = await pdfSemantics(outputs.pdf); texts.pdf = pdf.text;
  const coverage = {}; for (const [format, text] of Object.entries(texts)) { requireTitles(text, titles, format.toUpperCase()); requireOrder(text, titles, format.toUpperCase()); coverage[format] = tokenCoverage(canonicalText, text); if (coverage[format] < 0.985) throw new Error(`${format.toUpperCase()} normalized token coverage ${coverage[format].toFixed(4)} is below 0.985.`); }
  const source = readFileSync(snapshotMarkdown, "utf8"), sourceLinks = [...new Set([...source.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]))], combinedMarkup = `${html}\n${epub.xhtml}`;
  for (const link of sourceLinks) { if (!combinedMarkup.includes(link.replaceAll("&", "&amp;")) && !combinedMarkup.includes(link)) throw new Error(`HTML/EPUB omitted canonical link ${link}`); if (!pdf.urls.has(link)) throw new Error(`PDF omitted canonical link annotation ${link}`); }
  const expectedTables = (source.match(/^\|.+\|$/gm) ?? []).length > 0, expectedFigures = (source.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length, expectedNotes = (source.match(/^\[\^[^\]]+\]:/gm) ?? []).length;
  if (expectedTables && (!/<table\b/i.test(html) || !/<table\b/i.test(epub.xhtml) || !(pdf.roles.get("Table") > 0))) throw new Error("HTML, EPUB, or tagged PDF omitted canonical tables.");
  if ((html.match(/<img\b/gi) ?? []).length < expectedFigures || (epub.xhtml.match(/<img\b/gi) ?? []).length < expectedFigures || (pdf.roles.get("Figure") ?? 0) < expectedFigures) throw new Error("HTML, EPUB, or tagged PDF omitted canonical figures.");
  if ((pdf.roles.get("Note") ?? 0) < expectedNotes) throw new Error("Tagged PDF omitted canonical footnote semantics.");
  const vera = {}; for (const flavour of ["2a", "ua1"]) { const result = command(pdfTools.vera, ["--format", "json", "--flavour", flavour, outputs.pdf], { env: { JAVA_HOME: pdfTools.javaHome, PDF_VERAPDF_JAR: pdfTools.jar, JAVA_TOOL_OPTIONS: "-Xmx96m" } }); const parsed = JSON.parse(result.stdout), validation = parsed.report.jobs[0].validationResult[0]; if (!validation.compliant) throw new Error(`veraPDF ${flavour} rejected ${basename(outputs.pdf)}.`); vera[flavour] = { compliant: true, profile: validation.profileName, failedRules: validation.details.failedRules, failedChecks: validation.details.failedChecks }; }
  const artifacts = Object.fromEntries(Object.entries(outputs).map(([format, file]) => [format, { path: basename(file), mediaType: { html: "text/html", epub: "application/epub+zip", pdf: "application/pdf" }[format], bytes: statSync(file).size, sha256: fileHash(file) }]));
  return { schemaVersion: 1, sourceFingerprint, status: "passed", semanticParity: { status: "passed", dimensions: ["chapter-order", "chapter-headings", "normalized-readable-text", "links", "tables", "figures", "notes"], normalizedTokenCoverage: coverage }, html: { internalLinks: "passed", unsafeMarkup: 0 }, epub: { packageEntries: epub.entries.length, requiredNavigation: "passed", epubCheck }, pdf: { pages: pdf.pages, language: pdf.language, annotations: pdf.annotations, externalLinks: pdf.urls.size, taggedRoles: Object.fromEntries([...pdf.roles].sort()), derived: pdfDerived, vera }, artifacts };
}
