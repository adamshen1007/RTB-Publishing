import { DEFAULT_BOOK_PROJECT } from "./lib.mjs";
import { validateBook } from "./book-contract.mjs";
import { discoverBookProject } from "./books/discovery.mjs";

const project = discoverBookProject(process.argv[2] ?? DEFAULT_BOOK_PROJECT);
const result = validateBook({ project });

if (result.failures.length) {
  for (const failure of result.failures) console.error(`✗ ${failure}`);
  process.exit(1);
}

console.log(`✓ Book contract: ${result.actual.length}/${result.planned.length} canonical chapters (${result.status}).`);
