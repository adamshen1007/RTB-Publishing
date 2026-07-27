# RTB Publishing Domain Architecture

**Milestone:** M0 — Strategy and Governance  
**Status:** Draft

## Purpose

This document defines the domain architecture for RTB Publishing Core using bounded contexts. It establishes ownership boundaries so future specifications, AI agents, MCP integrations, and automation workflows remain modular and maintainable.

---

# 1. Domain Map

```text
RTB Publishing Core

├── Governance
├── Knowledge
├── Research
├── Engineering
├── Authoring
├── Publishing
├── Automation
├── AI Agents
├── Integrations
└── SDK / CLI
```

Each domain owns a clear set of responsibilities and communicates with other domains through documented contracts, events, and shared metadata.

---

# 2. Core Domains

## 2.1 Governance Domain

Owns:

- Constitution
- RFC process
- ADR process
- policies
- quality rules
- release rules
- decision history

Does not own:

- book content
- implementation code
- external integrations

Primary outputs:

- accepted RFCs
- accepted ADRs
- policy documents
- governance decisions

---

## 2.2 Knowledge Domain

Owns:

- Markdown knowledge base
- Obsidian-compatible notes
- lessons learned
- reusable patterns
- prompt library
- templates
- internal references

Does not own:

- raw external research collection
- final published books
- code implementation

Primary outputs:

- knowledge notes
- linked references
- reusable templates
- prompt assets

---

## 2.3 Research Domain

Owns:

- external source review
- research notes
- citation records
- quarterly updates
- competitor scans
- public YC/startup research synthesis

Does not own:

- final editorial voice
- book release workflow
- engineering implementation

Primary outputs:

- research memos
- source summaries
- citation packs
- update reports

---

## 2.4 Engineering Domain

Owns:

- PRDs
- specifications
- milestones
- acceptance criteria
- verification checklists
- engineering kits
- implementation prompts

Does not own:

- governance approval
- publishing exports
- editorial content strategy

Primary outputs:

- specs
- milestone plans
- engineering kits
- implementation prompts

---

## 2.5 Authoring Domain

Owns:

- books
- chapters
- worksheets
- callouts
- diagrams embedded in content
- editorial structure
- manuscript quality

Does not own:

- citation validation
- final release automation
- MCP implementation

Primary outputs:

- chapter drafts
- book outlines
- authoring templates
- manuscript-ready Markdown

---

## 2.6 Publishing Domain

Owns:

- Notion publishing workflow
- PDF export
- EPUB export
- DOCX export
- website/GitBook output
- edition packaging
- release artifacts

Does not own:

- canonical source truth
- research collection
- engineering specs

Primary outputs:

- Notion pages
- PDFs
- EPUBs
- DOCX files
- public documentation sites
- release bundles

---

## 2.7 Automation Domain

Owns:

- CI/CD workflows
- scheduled jobs
- quality checks
- build automation
- release automation
- quarterly update automation

Does not own:

- business rules
- source content
- editorial judgment

Primary outputs:

- GitHub Actions
- validation reports
- build logs
- release jobs

---

## 2.8 AI Agents Domain

Owns:

- agent registry
- agent contracts
- task handoffs
- prompt execution rules
- agent QA rules
- agent memory boundaries

Does not own:

- source-of-truth policy
- external tool implementation
- strategic decisions

Primary outputs:

- agent definitions
- prompts
- agent run reports
- handoff records

---

## 2.9 Integrations Domain

Owns:

- MCP adapter definitions
- GitHub integration
- Notion integration
- Figma integration
- Google Workspace integrations
- filesystem integration
- external tool fallback policies

Does not own:

- domain business logic
- canonical content
- final publishing decisions

Primary outputs:

- integration specs
- adapter contracts
- fallback workflows
- connection policies

---

## 2.10 SDK / CLI Domain

Owns:

- command-line interface
- local developer workflows
- project generators
- book generators
- validation commands
- export commands

Does not own:

- business policy
- source content
- editorial judgment

Primary outputs:

- CLI commands
- SDK modules
- local workflow tools

---

# 3. Context Interaction Model

RTB Publishing domains interact through events and documented contracts rather than hidden coupling.

```text
ResearchCompleted
  ↓
KnowledgeUpdated
  ↓
SpecificationRequested
  ↓
SpecificationGenerated
  ↓
AuthoringStarted
  ↓
ManuscriptReady
  ↓
QualityCheckPassed
  ↓
PublicationReady
  ↓
ReleasePublished
  ↓
RetrospectiveCompleted
```

---

# 4. Shared Kernel

The following object types are shared across domains:

- Project
- Book
- Chapter
- Research Note
- Source
- Prompt
- Template
- Diagram
- RFC
- ADR
- Specification
- Milestone
- Release
- Agent
- Quality Report

Each shared object should eventually include:

```yaml
id:
title:
type:
status:
version:
owner:
created_at:
updated_at:
source_path:
tags:
related:
```

---

# 5. Domain Governance Rules

1. A domain owns its own terminology, files, specifications, and workflows.
2. Shared objects must be documented in the shared kernel.
3. Significant cross-domain changes require an RFC.
4. Accepted architecture changes require an ADR.
5. No domain may silently redefine another domain's responsibilities.
6. AI agents must operate within declared domain boundaries.

---

# 6. Repository Mapping

```text
governance/      → Governance
research/        → Research
docs/            → Knowledge + Operations
specs/           → Engineering + Domain Specs
books/           → Authoring
publishing/      → Publishing
automation/      → Automation
prompts/         → AI Agents
integrations/    → Integrations
cli/             → SDK / CLI
templates/       → Shared Kernel + Knowledge
diagrams/        → Authoring + Publishing
```

---

# 7. Acceptance Criteria

This architecture is accepted when:

- Every major responsibility has a clear owning domain.
- Cross-domain interactions are event-based or contract-based.
- Shared objects are identified.
- Repository structure maps clearly to domains.
- Future specs can be assigned to one primary domain.
