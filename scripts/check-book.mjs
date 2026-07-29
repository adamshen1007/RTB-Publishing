import { validateBook } from "./book-contract.mjs";
import { resolveBookProject } from "./books/discovery.mjs";

const project = resolveBookProject(process.argv[2]);
const result = validateBook({ project });

if (result.failures.length) {
  for (const failure of result.failures) console.error(`✗ ${failure}`);
  process.exit(1);
}

console.log(`✓ Book contract: ${result.actual.length}/${result.planned.length} canonical chapters (${result.status}).`);
