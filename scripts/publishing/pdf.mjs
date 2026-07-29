import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { command, fileHash, requireFile } from "./common.mjs";
const lock = JSON.parse(readFileSync(new URL("../../publishing/pdf/toolchain.lock.json", import.meta.url), "utf8"));
const epubLock = JSON.parse(readFileSync(new URL("../../publishing/epub/toolchain.lock.json", import.meta.url), "utf8"));
export function pdfTools(env = process.env) {
  const typst = requireFile("PDF_TYPST", env.PDF_TYPST), font = requireFile("PDF_FONT", env.PDF_FONT), vera = requireFile("PDF_VERAPDF", env.PDF_VERAPDF), jar = requireFile("PDF_VERAPDF_JAR", env.PDF_VERAPDF_JAR), java = requireFile("PDF_JAVA", env.PDF_JAVA), epubArchive = requireFile("EPUBCHECK_ARCHIVE", env.EPUBCHECK_ARCHIVE), epubJar = requireFile("EPUBCHECK_JAR", env.EPUBCHECK_JAR);
  const expected = lock.tools.renderer.artifacts[0].executableSha256; if (fileHash(typst) !== expected) throw new Error("PDF_TYPST does not match the pinned executable hash.");
  if (fileHash(font) !== lock.fonts[0].sha256 || fileHash(jar) !== lock.tools.structuralValidator.mainJarSha256 || fileHash(java) !== lock.tools.javaRuntime.artifacts[0].executableSha256 || fileHash(epubArchive) !== epubLock.validator.archiveSha256 || fileHash(epubJar) !== epubLock.validator.mainJarSha256) throw new Error("A renderer, validator, runtime, archive, or font does not match the pinned lock.");
  return { typst, font, vera, jar, java, epubArchive, epubJar, javaHome: dirname(dirname(java)) };
}
export function renderPdf(snapshot, output, { env = process.env, tools = pdfTools(env) } = {}) {
  const fontDirectory = resolve(snapshot.root, "fonts"), typst = resolve(snapshot.root, "book.typ"); mkdirSync(fontDirectory, { recursive: true }); copyFileSync(tools.font, resolve(fontDirectory, "NotoSerif-wdth-wght.ttf"));
  command("pandoc", [snapshot.markdown, "--from=markdown+yaml_metadata_block", "--to=typst", "--standalone", "--variable=mainfont:Noto Serif", "--resource-path", snapshot.root, "--output", typst]);
  // Pandoc renders Markdown task-list markers as U+2610, which the locked Noto
  // Serif face does not contain. Preserve the meaning with an ASCII box in the
  // derived Typst input; canonical Markdown is never changed.
  writeFileSync(typst, readFileSync(typst, "utf8").replaceAll("☐", "[ ]"));
  command(tools.typst, ["compile", `--root=${snapshot.root}`, `--font-path=${fontDirectory}`, "--ignore-system-fonts", "--ignore-embedded-fonts", `--creation-timestamp=${lock.profile.sourceDateEpoch}`, `--pdf-standard=${lock.profile.rendererArgument.split("=")[1]}`, "--diagnostic-format=short", typst, output]);
  return { output, typst, tools, lock, derived: { typstSha256: fileHash(typst), fontSha256: fileHash(resolve(fontDirectory, "NotoSerif-wdth-wght.ttf")), rendererSha256: fileHash(tools.typst) } };
}
