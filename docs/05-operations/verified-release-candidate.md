# Verified release candidate

RTB Publishing builds HTML, PDF, and EPUB from one disk-backed immutable source
snapshot. Pandoc produces HTML, EPUB, and derived Typst; pinned Typst 0.15.0
produces the PDF. Prince is not used.

## One-time local setup

Install Pandoc and download the exact Typst, veraPDF, W3C EPUBCheck, Java, and
Noto Serif artifacts listed in the PDF and EPUB toolchain locks under
`publishing/`. Set these variables to the verified local files:

- `PDF_TYPST`
- `PDF_JAVA`
- `PDF_VERAPDF`
- `PDF_VERAPDF_JAR`
- `PDF_FONT`
- `EPUBCHECK_ARCHIVE`
- `EPUBCHECK_JAR`
- `JAVA_HOME`

The command fails before rendering if a file is absent or its hash differs from
the lock.

## Build and check

Run `pnpm release:candidate`. Then check:

1. `dist/candidates/<book-id>/<candidate-hash>/` contains one HTML, PDF, and EPUB file plus the
   retained `source-snapshot/` audit bundle.
2. `verification.json` says `passed`, EPUBCheck has no messages, both veraPDF
   profiles are compliant, and semantic parity passed.
3. `candidate.json` records the three artifact hashes and says
   `releaseEligible: false` while named manual reviews remain unfinished.
4. No `manifest.json` exists yet. This is correct before Publish approval.

Run `pnpm release:resource-proof` to repeat the 512 MiB, 8 MiB-chunk memory
bound test.

## Human review and Publish

Follow the
[beginner publication approval procedure](beginner-publication-approval.md)
for the complete do-this, verify-this, and check sequence.

Review representative and high-risk pages in all three formats. A named
reviewer must record the PDF screen-reader/visual decision and the YC migration
decision. Rebuild after any change. Beta approval advances the lifecycle
version, so rebuild at that post-Beta version and repeat all three exact
candidate reviews before Publish. The Creator then approves the exact final
candidate hash through the lifecycle Publish gate.

After the three exact, hash-bound review records make the candidate eligible,
use the exact manifest command Creator Studio displays with
`--approval-id <stored-approval-id>`. RTB reads that approval from its durable
lifecycle ledger; a browser-authored JSON file is not accepted. Finalization
persists one exact pending manifest and identity. The build then promotes and
verifies the derived immutable directory, durably records the filesystem
`material-verified` phase, and only then uses process-private, one-time
promotion authority to complete the finalization and identity together. It
then records `ledger-completed` before deleting any prior-release backup. An
identical retry safely resumes either pending ledger state or a
material-verified promotion. Only an exact completed durable finalization verifies as a
release. RTB Publishing does not claim hosted activation or subscriber
delivery in Increment 1.

An unapproved build is immutable candidate evidence only. It is stored at
`dist/candidates/<book-id>/<candidate-hash>/` and can never write under
`dist/releases/`. After exact Publish approval, the finalized bundle is stored
at `dist/releases/immutable/<book-id>/<release-id>/`. An identical completed
release may be verified and reused; a different bundle can never overwrite
that release ID. The older `dist/releases/<book-id>/` layout is read-only
legacy reconciliation input and is never destructively promoted in place.

The build first holds the workspace output lock and then the nested project
writer lock. It uses a unique staging directory and does not remove the
existing promoted release. After registration and pending finalization, it
verifies staging, records a durable promotion state machine, and atomically
renames staging.
The promotion boundary accepts no output directory from a caller. It validates
both live locks and the discovered book/workspace relationship before marker
recovery, then derives the only permitted immutable target from the workspace,
project ID, and release ID.
Both locks pin the real directory path plus device and inode. Each handle also
pins its lock parent and file, keeps the file descriptor open, and rechecks the
descriptor identity, one-link status, and exact owner bytes. Existing path
segments below the workspace—including the project, lock directories,
`build`, `dist`, candidates, immutable releases, staging, and promotion
targets—must be physical directories rather than symbolic links. Replacing a
root, lock parent, or lock file after acquisition—or unlinking or hard-linking
the lock—invalidates its handle before further mutation. A stale release cannot
remove a successor lock.

The project is re-discovered only after both locks are held. RTB compares the
fresh canonical identity—including snapshot pointer hash/version and all
manifest, Blueprint, metadata, and chapter material—with the caller's view,
then rechecks it after rendering and after the final completion hook,
immediately before one-time capability consumption and ledger completion. If
the pointer or material changes, the attempt cannot promote or complete; start
a fresh build from the newly discovered project.
The capability also pins the complete output directory chain and every exact
candidate, manifest, verification, artifact, and retained-source file. A copied
replacement of the immutable root, project namespace, or release target fails
closed before completion and before cleanup.
Verification inventories the complete recursive release tree, including hidden
files and nested directories. Only the declared artifacts, retained snapshot
files, and fixed candidate, verification, and manifest records are allowed.
Any extra, missing, linked, type-changed, or hash-changed entry blocks release.
The prior release backup remains until the promoted directory passes exact
verification again. Every rename has durable intent and completion phases.
Before durable material verification, failure or restart restores the prior
verified directory. A `material-verified` recovery may resume completion only
when the exact current approval, Beta, review, and policy authority still pass;
otherwise it rolls back. A completed ledger is reconciled to
`ledger-completed` before recovery deletes the backup. Version 2 markers use a
closed schema containing the phase, project/release IDs, random UUID token,
prior-target flag, and exact recursive identity-and-byte evidence for every
transaction path except the marker itself. Recovery derives only the recorded
pre-state or the one exact post-state allowed by an interrupted intent phase;
it never adopts a live filesystem snapshot. All paths are derived from trusted
roots; malformed, mismatched, traversal, symbolic-link, or copied replacement
state is rejected without filesystem mutation. Immutable verification also requires
the exact derived `immutable/<project>/<release-id>` path, real-path
containment, regular expected files, and a recursively symbolic-link-free
tree.
`pnpm clean` and other build output writers take the same workspace lock, so a
clean at repository root cannot race a build under a nested book directory.

Promotion recovery and cleanup also require the original lock authority and
pinned `.promotion-state`, marker, backup, quarantine, target, and parent
identities. If any is replaced, RTB reports that recovery is required and
preserves both the successor namespace and existing evidence without mutation.
Every promotion mutator is private to this boundary. The sole public entry
validates both live locks, canonical project identity, and the exact durable
candidate, manifest, identity, and finalization rows before constructing the
coordinator. Recovery validates marker-bound evidence before reconstructing
private coordinator state. Each owned rename,
removal, directory creation, and temporary-marker rename proves its exact
post-state before the coordinator advances. A replacement in the
validation-to-advance window makes the error recovery-required. Direct calls,
public re-exports,
copied objects, and marker, backup, or quarantine replacement are rejected
without adopting the replacement.

Dead-process lock files are not reclaimed automatically. Because pathname
rename and removal cannot provide a safe three-actor ownership transfer, stale
locks fail closed and require the documented all-writers-stopped manual
procedure in [publishing troubleshooting](publishing-troubleshooting.md).

An older `reserved` identity is adopted only when its exact candidate, current
real approval and policy, current Beta, and existing manifest all reproduce.
Otherwise preserve the evidence and obtain a new Publish approval. Verification
of a completed release proves its approval and bytes were valid at completion;
a later Blueprint invalidation does not rewrite that history. Current delivery
eligibility or revocation is a separate product decision.

Every verification checks the completed identity, finalization, candidate
registry row, manifest, stored source and artifact hashes, Publish and Beta
approval facts, exact reviews, and causal timestamps. When upgrading a
database created before completion-time approval facts were stored,
verification backfills those facts only if the completed identity,
candidate source/artifacts/lifecycle, manifest JSON/checksum, historical review
policy, exact human approval bindings, required Beta binding, and timestamps
all prove the approval was current at completion. If any redundant field
differs, stop and preserve the directory and database. The explicit
reconciliation error means a human must review the old evidence or create a
new candidate and approval; do not delete the old release.

For the YC book, copy the complete shell-quoted verification command printed
by the successful approved build. It contains the actual workspace path, book
path, and release ID. Creator Studio shows the same server-authored command
after refresh. Do not type or substitute those values manually.
