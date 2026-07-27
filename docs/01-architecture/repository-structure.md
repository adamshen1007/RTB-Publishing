# Repository Structure

RTB Publishing uses a root-first layout so canonical governance, documentation,
specifications, content, and operating configuration are visible immediately
after cloning the repository.

```text
RTB-Publishing/
├── .vale/styles/RTBPublishing/  # RTB Publishing writing rules
├── automation/              # Reproducible automation
├── books/                   # Founder Library source content
├── ci/                      # Quality and CI configuration
├── diagrams/                # Diagram sources and guidance
├── docs/
│   ├── strategy/            # Vision, PRD, strategy, and worthiness review
│   ├── 00-overview/         # Introductory documentation
│   ├── 01-architecture/     # System, domain, and capability architecture
│   ├── 02-authoring/        # Authoring standards
│   ├── 03-quality/          # Review and quality guidance
│   └── 05-operations/       # Operating processes
├── governance/              # ADRs, RFCs, and policies
├── prompts/                 # Reusable AI-assisted workflows
├── publishing/              # Publishing configuration
├── platform/                # Local Founder Workspace assets
├── pilots/                  # Sanitized internal pilot templates and records
├── research/                # Raw and processed research
├── specs/                   # Numbered, engine, and orchestration contracts
├── templates/               # Reusable templates
├── workspace/               # Multi-project registry
├── .rtb-publishing/platform/     # Ignored local registry, backups, and job state
├── CONSTITUTION.md          # Canonical governing principles
├── README.md                # Project entry point
└── ROADMAP.md               # Canonical milestone sequence
```

The repository must not introduce a second nested project root. Derived
publishing outputs belong in ignored output directories such as `dist/` and
must not replace their canonical Markdown sources.

The `.rtb-publishing/platform/` directory is local runtime state, not a canonical
project source. It must remain ignored by Git. Its external-project overlay may
reference explicitly allowed repositories without copying their content.
