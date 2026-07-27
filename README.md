# RTB Publishing

RTB Publishing is a documentation-first foundation for building an AI-native
founder operating system. It is designed to turn reusable knowledge,
governance, research, engineering practices, and publishing workflows into a
compounding operating system for founders.

The current development priority is **The RTB Publishing Playbook for AI Founders**.
Its complete 23-chapter manuscript is a publication candidate. The repository
also contains the canonical strategy, architecture, engine specifications,
governance records, publishing templates, an initial Founder Library sample,
the local and CI publishing pipeline, a deterministic project-kit CLI, and a
traceable research workflow, a governed proposal-only agent runtime, and a
local multi-project dashboard. It is not yet a hosted SaaS application.

## Core Principles

- Git and Markdown are the source of truth.
- Documentation comes before implementation.
- Work is delivered in small, verifiable milestones.
- Research and externally verifiable claims require traceable sources.
- Derived formats such as Notion pages, websites, PDF, EPUB, and DOCX are
  publishing outputs.
- Strategic and architectural decisions require human approval.

The complete governance rules are defined in [CONSTITUTION.md](CONSTITUTION.md).

## Start Here

Clone the repository:

```bash
git clone https://github.com/adamshen1007/RTB Publishing.git
cd RTB Publishing
```

Then read these documents in order:

1. [Vision and manifesto](docs/strategy/vision-manifesto.md)
2. [Product requirements](docs/strategy/product-requirements.md)
3. [Roadmap](ROADMAP.md)
4. [System overview](docs/01-architecture/system-overview.md)
5. [Domain architecture](docs/01-architecture/domain-architecture.md)
6. [Capability architecture](docs/01-architecture/capability-architecture.md)
7. [Master specification](specs/000-master-spec.md)

Install dependencies and run the complete quality suite:

```bash
pnpm install
pnpm check
```

Build and preview the complete publication-candidate manuscript:

```bash
pnpm build
pnpm preview
```

Start with the [editorial brief](books/volume-01-yc-playbook/editorial-brief.md),
the [canonical table of contents](books/volume-01-yc-playbook/table-of-contents.md),
the [publication plan](books/volume-01-yc-playbook/publication-plan.md), the
[release-readiness checklist](books/volume-01-yc-playbook/release-readiness-checklist.md),
and the [book authoring workflow](docs/05-operations/book-authoring.md). The book
is an independent RTB Publishing publication; it is not endorsed by Y Combinator and
does not promise funding or a company outcome.

Create an engineering kit for a new project:

```bash
pnpm rtb-publishing create my-project \
  --name "My Project" \
  --description "A focused description of the project." \
  --owner "Your Name" \
  --audience "The people you intend to help" \
  --problem "The concrete problem they experience"
```

See the [engineering-kit generator guide](docs/05-operations/engineering-kit-generator.md)
before regenerating or forcing replacement.

Validate and inspect the example research topic:

```bash
pnpm rtb-publishing research validate \
  research/topics/customer-validation-before-mvp/research.yaml
pnpm rtb-publishing research status \
  research/topics/customer-validation-before-mvp/research.yaml
```

See the [research automation guide](docs/05-operations/research-automation.md)
before adding sources, advancing freshness dates, or rebuilding a brief.

Run the Research Review Agent without a provider key:

```bash
pnpm rtb-publishing agent run research-reviewer \
  --subject research/topics/customer-validation-before-mvp/research.yaml \
  --provider fake \
  --run-id RUN-LOCAL-001
```

This creates a proposal, not a canonical edit. Read the
[governed agent runtime guide](docs/05-operations/agent-runtime.md) before
reviewing, applying, or selecting the optional OpenAI provider.

Start the local Founder Workspace:

```bash
pnpm rtb-publishing platform doctor
pnpm platform:start
```

Open <http://127.0.0.1:4310>. See the
[local workspace guide](docs/05-operations/local-founder-workspace.md) before
running workflows or changing the project registry.

Inspect an external repository without changing local state:

```bash
pnpm rtb-publishing platform project onboard "/absolute/path/to/project"
```

External access requires a separate explicit allowlist and remains read-only.
The guide documents the dry-run and confirmation sequence.

The next product activity remains real internal use recorded with the
[M5A.1 pilot protocol](docs/05-operations/m5a1-pilot-protocol.md). Hosted M5B is
currently a no-go, not an implied next implementation stage.

```bash
pnpm rtb-publishing platform pilot status
```

This reports evidence progress but never turns local jobs into pilot sessions.

The preview is available at <http://127.0.0.1:4173>. See the
[local development guide](docs/05-operations/local-development.md) for system
prerequisites and individual commands.

## Canonical Repository Structure

```text
RTB Publishing/
├── governance/     # ADRs, RFCs, and policies
├── docs/           # Strategy, architecture, and operating guides
├── specs/          # Implementation contracts and engine specifications
├── templates/      # Reusable document and project templates
├── prompts/        # Reusable AI-assisted workflows
├── books/          # Canonical Founder Library source content
├── research/       # Topics, sources, evidence, claims, and research briefs
├── diagrams/       # Diagram sources and standards
├── publishing/     # Publishing pipeline configuration
├── automation/     # Reproducible automation
├── agents/         # Governed role definitions, prompts, and fake fixtures
├── evals/          # Deterministic agent evaluation cases
├── platform/       # Local dashboard assets
├── workspace/      # Multi-project registry
├── examples/       # Committed end-to-end reference projects
├── schemas/        # Machine-readable input contracts
├── scripts/        # Publishing and generator implementation
└── ci/             # Quality and continuous-integration configuration
```

The root [CONSTITUTION.md](CONSTITUTION.md) is the only canonical constitution.
Accepted architecture decisions live under [`governance/ADR`](governance/ADR),
and implementation contracts live under [`specs`](specs).

## Current Development Priority

M0 established the repository foundation, M1 implemented publishing, M2 added
project-kit generation, M3 provides traceable research automation, and M4 adds
governed assistance over those validated artifacts:

```text
validated research
  -> bounded agent proposal
  -> deterministic verification
  -> exact human approval or rejection
  -> existing M3 validation
```

See [ROADMAP.md](ROADMAP.md) for the complete milestone sequence. Product
platform expansion is paused while the book receives human editorial review.
The M5A evidence cycle may continue through genuine use, but hosted M5B scope
still requires real pilot evidence and a new RFC.

## Contributing and Security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report
security issues according to [SECURITY.md](SECURITY.md), not in a public issue.

## License

Copyright is reserved while RTB Publishing validates which components should become
open source. See [LICENSE](LICENSE) for the current terms.
