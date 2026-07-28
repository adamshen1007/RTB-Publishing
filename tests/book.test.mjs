import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLETE_MANUSCRIPT_STATUSES,
  canonicalChapterEntries,
  canonicalChapterFiles,
  namespaceFootnotes,
  validateChapter
} from "../scripts/book-contract.mjs";
import { discoverBookProject } from "../scripts/books/discovery.mjs";

const completeChapter = `# Chapter 2 — Test a Decision

> **Core Principle:** Make the decision testable.

## Learning Objectives

- Name the decision.
- Define the evidence.
- Choose a review date.

## Deep Dive

Explain the decision.

## AI Founder Interpretation

Use AI as bounded assistance.

## Callouts

> **Decision Lens:** State the choice.

> **Common Failure:** Avoid vague evidence.

## Checklist

- [ ] Name the choice.
- [ ] Record evidence.
- [ ] Set a review date.

## Worksheet

| Prompt | Answer |
| --- | --- |
| Decision | |

## Key Takeaways

- Decisions need evidence.
- Evidence needs ownership.
- Reviews need dates.

## Sources

- [Example primary source](https://example.com/source)
`;

test("chapter contract accepts a complete canonical chapter", () => {
  assert.deepEqual(validateChapter("02-test-a-decision.md", completeChapter), []);
});

test("chapter contract reports missing beginner-facing elements", () => {
  const failures = validateChapter("02-test-a-decision.md", "# Chapter 2 — Incomplete\n");
  assert.ok(failures.some((failure) => failure.includes("Core Principle")));
  assert.ok(failures.some((failure) => failure.includes("Worksheet")));
  assert.ok(failures.some((failure) => failure.includes("Sources")));
});

test("canonical contents parser returns ordered chapter filenames", () => {
  assert.deepEqual(canonicalChapterFiles("| 01 | A | `01-a.md` |\n| 02 | B | `02-b.md` |"), ["01-a.md", "02-b.md"]);
});

test("canonical contents parser preserves exact titles", () => {
  assert.deepEqual(canonicalChapterEntries("| 02 | Test a Decision | `02-test-a-decision.md` |"), [
    { number: "02", title: "Test a Decision", file: "02-test-a-decision.md" }
  ]);
  assert.ok(validateChapter("02-test-a-decision.md", completeChapter, "Different Title").some((failure) => failure.includes("heading must match")));
});

test("footnote namespaces remain unique when chapters are combined", () => {
  const chapter = "Claim.[^source]\n\n[^source]: Source note.";
  assert.equal(namespaceFootnotes(chapter, "02"), "Claim.[^02-source]\n\n[^02-source]: Source note.");
});

test("publication preparation uses explicit public statuses and artifact naming", () => {
  assert.ok(COMPLETE_MANUSCRIPT_STATUSES.includes("Publication Candidate"));
  assert.ok(COMPLETE_MANUSCRIPT_STATUSES.includes("Public Preview"));
  assert.equal(discoverBookProject("books/volume-01-yc-playbook").outputProfiles.find((profile) => profile.format === "epub").filename, "rtb-publishing-playbook.epub");
});
