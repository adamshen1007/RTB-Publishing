import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { BOOK_DIR } from "./lib.mjs";
import { validateBook } from "./book-contract.mjs";
import { throwForInvalidLegacyBookProject } from "./books/compat.mjs";

const chapterDirectory = resolve(BOOK_DIR, "chapters");
throwForInvalidLegacyBookProject(BOOK_DIR);
const chapterFiles = readdirSync(chapterDirectory).filter((file) => file.endsWith(".md"));
const result = validateBook({ bookDirectory: BOOK_DIR, chapterFiles });

if (result.failures.length) {
  for (const failure of result.failures) console.error(`✗ ${failure}`);
  process.exit(1);
}

console.log(`✓ Book contract: ${result.actual.length}/${result.planned.length} canonical chapters (${result.status}).`);
