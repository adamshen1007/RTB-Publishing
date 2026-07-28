# Local Development

<!-- cspell:words APFS -->

## Purpose

This guide sets up and runs the publishing and engineering-kit workflows on
macOS. They require no database, credentials, or private service.

## Prerequisites

- Git
- Node.js 24
- pnpm 11
- Pandoc 3 or newer
- Vale 3 or newer

Check the installed versions:

```bash
git --version
node --version
pnpm --version
pandoc --version
vale --version
```

The repository pins its Node version in `.node-version` and its pnpm version in
`package.json`.

### Install Homebrew, Pandoc, and Vale

If `brew` is unavailable, install Homebrew using the command on
[brew.sh](https://brew.sh/), then follow the installer's shell-path instructions.

Install the system publishing tools:

```bash
brew install pandoc vale
```

## First Setup

```bash
git clone https://github.com/adamshen1007/RTB Publishing.git
cd RTB Publishing
pnpm install
```

`pnpm install` also downloads the browser runtime used by Mermaid CLI.

## Daily Commands

Run all quality gates:

```bash
pnpm check
```

Generate HTML, EPUB, and DOCX:

```bash
pnpm build
```

Preview the generated HTML:

```bash
pnpm preview
```

Open <http://127.0.0.1:4173> and press `Ctrl+C` in Terminal when finished.

Each generic build writes its combined manuscript and rendered files into one
private generation below `dist/books/.generations/`. There is no separate
generic `buildRoot`; co-locating both halves prevents a mixed generation. After
every file and directory has been flushed, RTB atomically replaces the small
project pointer in `dist/books/.current/`. Preview resolves that pointer for
every request, opens the selected file without following symbolic links, reads
only through the pinned descriptor, and rechecks the descriptor, path, and
pointer before returning bytes under the workspace output lock. It never falls
back to an older conventional output directory. If the pointer
is missing or invalid, rebuild instead of selecting generation files by hand.
The successful build keeps the current generation and two complete
predecessors. Older generations first move into a project-and-token-scoped
private quarantine with a durable transaction record while the exact pointer is
rechecked before every move. Any pointer change restores all moved generations.
The synchronous build does not delete quarantined generations; retained
evidence awaits a separately reviewed bounded cleanup policy.

The flush-and-rename protocol is designed for local APFS and ordinary Linux
filesystems that implement file and directory `fsync`. It cannot promise
equivalent power-loss behavior on every network, virtual, removable, or
vendor-specific filesystem; build and publish on a supported local filesystem
when release evidence matters.

Remove generated files:

```bash
pnpm clean
```

## Individual Quality Gates

```bash
pnpm check:tools
pnpm check:markdown
pnpm check:links
pnpm check:spelling
pnpm check:style
pnpm check:diagrams
pnpm check:citations
pnpm test
pnpm check:example
pnpm check:research
pnpm test:agents
pnpm eval:agents
pnpm check:agent-example
pnpm test:platform
pnpm check:platform
```

Run an individual gate while fixing a focused problem, then run `pnpm check`
before requesting review.

## Engineering Kit Commands

```bash
pnpm rtb-publishing doctor
pnpm rtb-publishing validate examples/ai-launch-copilot/rtb-publishing.project.yaml
pnpm rtb-publishing generate examples/ai-launch-copilot/rtb-publishing.project.yaml --check
```

See the [engineering-kit generator guide](engineering-kit-generator.md) for
project creation, dry runs, regeneration, and conflict recovery.

## Research Commands

```bash
pnpm rtb-publishing research validate research/topics/customer-validation-before-mvp/research.yaml
pnpm rtb-publishing research status research/topics/customer-validation-before-mvp/research.yaml
pnpm rtb-publishing research build research/topics/customer-validation-before-mvp/research.yaml --check
```

See the [research automation guide](research-automation.md) for topic creation,
source records, evidence relationships, freshness, and protected brief builds.

## Agent Commands

```bash
pnpm rtb-publishing agent list
pnpm rtb-publishing agent doctor
pnpm rtb-publishing agent run research-reviewer \
  --subject research/topics/customer-validation-before-mvp/research.yaml \
  --provider fake \
  --run-id RUN-LOCAL-001
```

The fake provider needs no secret and is the normal development and CI path.
See the [agent runtime guide](agent-runtime.md) before human review, applying a
proposal, or making an optional live-provider request.

## Founder Workspace

```bash
pnpm rtb-publishing platform doctor
pnpm rtb-publishing platform index
pnpm rtb-publishing platform pilot check
pnpm platform:start
```

Open <http://127.0.0.1:4310>. Follow the
[local workspace guide](local-founder-workspace.md) for workflow execution and
recovery.

## Generated Files

The build writes private generated material to:

```text
dist/books/
├── .current/<project-id>.json
└── .generations/<project-id>/<generation-id>/
    ├── build/combined.md
    ├── build/diagrams/
    └── output-root/<project-id>/<declared artifacts>
```

These paths are internal and ignored by Git. Use `pnpm preview` rather than
opening a remembered generation path. `pnpm clean` may remove them after active
build and preview readers release the workspace output lock.

## Adding a Chapter

1. Copy `templates/chapter-template.md` into the book's `chapters/` directory.
2. Give it the next zero-padded sequence number.
3. Complete every required section.
4. Add public, traceable sources for external claims.
5. Run `pnpm check` and `pnpm build`.
6. Review the HTML and at least one downloadable format.
