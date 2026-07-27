import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bookMetadata } from "./book-contract.mjs";
import { BOOK_DIR, BOOK_DIST_DIR, BOOK_OUTPUT_NAME } from "./lib.mjs";

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function verifyOutputs() {
  const metadata = bookMetadata(readFileSync(resolve(BOOK_DIR, "book.md"), "utf8"));
  const expected = [
    { file: resolve(BOOK_DIST_DIR, "index.html"), kind: "html", minimum: 1_000 },
    { file: resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.epub`), kind: "zip", minimum: 2_000 },
    { file: resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.docx`), kind: "zip", minimum: 2_000 },
  ];
  const failures = [];
  for (const output of expected) {
    if (!existsSync(output.file)) {
      failures.push(`Missing output: ${output.file}`);
      continue;
    }
    const size = statSync(output.file).size;
    if (size < output.minimum) {
      failures.push(`${output.file} is unexpectedly small (${size} bytes).`);
      continue;
    }
    const content = readFileSync(output.file);
    if (output.kind === "zip" && content.subarray(0, 2).toString("ascii") !== "PK") {
      failures.push(`${output.file} does not have a ZIP-compatible signature.`);
    }
    if (output.kind === "html") {
      const html = content.toString("utf8");
      if (!new RegExp(`<title>[^<]*${escaped(metadata.title)}[^<]*<\\/title>`, "i").test(html)) failures.push(`${output.file} does not contain the canonical document title.`);
      if (!new RegExp(escaped(metadata.version), "i").test(html)) failures.push(`${output.file} does not display the canonical version.`);
      if (!new RegExp(escaped(metadata.status), "i").test(html)) failures.push(`${output.file} does not display the canonical status.`);
      if (!/<body[\s>]/i.test(html)) failures.push(`${output.file} has no HTML body.`);
      if (!/Chapter 23[^<]*Build Your AI Founder Operating System/i.test(html)) failures.push(`${output.file} does not contain the final canonical chapter.`);
      if (!/Part VI[^<]*Put the System\s+into Practice/i.test(html)) failures.push(`${output.file} does not contain canonical part dividers.`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return expected.map((output) => ({ file: output.file, size: statSync(output.file).size }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    for (const output of verifyOutputs()) console.log(`✓ ${output.file} (${output.size} bytes)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
