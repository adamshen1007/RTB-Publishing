# RTB Publishing Capability Architecture

**Milestone:** M0 — Strategy and Governance  
**Status:** Draft

## Purpose

This document defines the business and platform capabilities RTB Publishing must provide. While the Domain Architecture explains ownership, the Capability Architecture explains value delivery.

---

# 1. Capability Map

```text
RTB Publishing Capabilities

├── Founder Knowledge Management
├── Research & Evidence Synthesis
├── Decision Governance
├── Engineering Kit Generation
├── Book & Playbook Authoring
├── Multi-format Publishing
├── AI Agent Orchestration
├── Tool & MCP Integration
├── Quality Assurance
├── Release Management
├── Continuous Improvement
└── Project Creation SDK
```

---

# 2. Capability Groups

## 2.1 Founder Knowledge Management

Purpose:

Capture, organize, link, and reuse founder knowledge across projects.

Includes:

- Obsidian-compatible Markdown vault
- prompt library
- templates
- lessons learned
- reusable frameworks
- company playbooks

Owning domain:

- Knowledge

Supporting domains:

- Research
- AI Agents
- Automation

---

## 2.2 Research & Evidence Synthesis

Purpose:

Turn external information into verified, reusable knowledge.

Includes:

- public source discovery
- source summaries
- citation tracking
- quarterly YC updates
- trend reviews
- competitor research

Owning domain:

- Research

Supporting domains:

- Knowledge
- AI Agents
- Quality

---

## 2.3 Decision Governance

Purpose:

Ensure significant decisions are deliberate, documented, and traceable.

Includes:

- Constitution
- RFCs
- ADRs
- policy changes
- decision logs
- governance reviews

Owning domain:

- Governance

Supporting domains:

- Engineering
- AI Agents
- Automation

---

## 2.4 Engineering Kit Generation

Purpose:

Generate reusable project foundations for new startups, products, books, and internal systems.

Includes:

- PRDs
- specs
- milestones
- acceptance criteria
- verification plans
- Codex prompts
- repository structures

Owning domain:

- Engineering

Supporting domains:

- Governance
- Knowledge
- AI Agents
- SDK / CLI

---

## 2.5 Book & Playbook Authoring

Purpose:

Create professional-quality books, chapters, worksheets, playbooks, and internal handbooks.

Includes:

- outlines
- chapters
- callout boxes
- diagrams
- worksheets
- checklists
- editorial review

Owning domain:

- Authoring

Supporting domains:

- Research
- Knowledge
- Publishing
- Quality

---

## 2.6 Multi-format Publishing

Purpose:

Convert canonical Markdown into polished outputs.

Includes:

- Notion pages
- PDFs
- EPUBs
- DOCX files
- GitBook/website pages
- versioned release bundles

Owning domain:

- Publishing

Supporting domains:

- Automation
- Integrations
- Quality

---

## 2.7 AI Agent Orchestration

Purpose:

Coordinate specialized AI agents through documented, auditable workflows.

Includes:

- Research Agent
- Outline Agent
- Writing Agent
- Diagram Agent
- Citation Agent
- Editor Agent
- Spec Agent
- Codex Agent
- QA Agent
- Publisher Agent
- Release Agent
- Retrospective Agent

Owning domain:

- AI Agents

Supporting domains:

- Governance
- Automation
- Integrations

---

## 2.8 Tool & MCP Integration

Purpose:

Connect RTB Publishing to external systems while keeping Git + Markdown canonical.

Includes:

- GitHub MCP
- Notion MCP
- Figma MCP
- Google Drive MCP
- Gmail MCP
- Google Calendar MCP
- filesystem MCP
- future research/search MCPs

Owning domain:

- Integrations

Supporting domains:

- Publishing
- Automation
- AI Agents

---

## 2.9 Quality Assurance

Purpose:

Validate content, diagrams, links, citations, style, and release readiness.

Includes:

- Markdown linting
- link checking
- citation review
- diagram rendering
- spell/style checks
- release readiness checks
- human review gates

Owning domain:

- Quality / Automation

Supporting domains:

- Governance
- Publishing
- Authoring
- Research

---

## 2.10 Release Management

Purpose:

Package, version, and publish RTB Publishing outputs.

Includes:

- versioning
- changelogs
- release notes
- generated artifacts
- quarterly edition management
- retrospective workflow

Owning domain:

- Automation

Supporting domains:

- Publishing
- Governance
- Quality

---

## 2.11 Continuous Improvement

Purpose:

Turn completed work into better future workflows.

Includes:

- retrospectives
- prompt improvement
- template improvement
- process updates
- knowledge updates
- cross-project learning

Owning domain:

- Knowledge

Supporting domains:

- Governance
- AI Agents
- Automation

---

## 2.12 Project Creation SDK

Purpose:

Make RTB Publishing executable through reusable commands.

Future commands:

```bash
rtb-publishing create project
rtb-publishing create book
rtb-publishing generate engineering-kit
rtb-publishing publish notion
rtb-publishing export pdf
rtb-publishing validate
rtb-publishing release
```

Owning domain:

- SDK / CLI

Supporting domains:

- Engineering
- Publishing
- Automation
- Integrations

---

# 3. Capability-to-Domain Matrix

| Capability | Primary Domain | Supporting Domains |
|---|---|---|
| Founder Knowledge Management | Knowledge | Research, AI Agents, Automation |
| Research & Evidence Synthesis | Research | Knowledge, AI Agents, Quality |
| Decision Governance | Governance | Engineering, Automation |
| Engineering Kit Generation | Engineering | Knowledge, AI Agents, SDK / CLI |
| Book & Playbook Authoring | Authoring | Research, Knowledge, Quality |
| Multi-format Publishing | Publishing | Automation, Integrations, Quality |
| AI Agent Orchestration | AI Agents | Governance, Automation, Integrations |
| Tool & MCP Integration | Integrations | Publishing, Automation, AI Agents |
| Quality Assurance | Automation / Quality | Governance, Authoring, Research |
| Release Management | Automation | Publishing, Governance, Quality |
| Continuous Improvement | Knowledge | Governance, AI Agents, Automation |
| Project Creation SDK | SDK / CLI | Engineering, Publishing, Automation |

---

# 4. MVP Capability Set

The minimum useful RTB Publishing Core should include:

1. Decision Governance
2. Founder Knowledge Management
3. Book & Playbook Authoring
4. Multi-format Publishing
5. Quality Assurance
6. Engineering Kit Generation

These capabilities support the immediate goal: producing the Founder Library and reusable startup engineering kits.

---

# 5. Future Capability Set

Later capabilities include:

- Research automation
- AI agent orchestration
- full MCP integration
- project creation SDK
- commercial workspace
- template marketplace
- team collaboration layer

---

# 6. Capability Governance Rules

1. Every new feature must map to a capability.
2. Every capability must have a primary owning domain.
3. New capabilities require an RFC.
4. Capabilities that become core platform commitments require an ADR.
5. Capabilities must have measurable value.
6. Automation should only be added after the manual workflow is clear.

---

# 7. Acceptance Criteria

This architecture is accepted when:

- Core capabilities are identified.
- Each capability has an owning domain.
- MVP capabilities are separated from future capabilities.
- Capability expansion rules are defined.
- Future implementation milestones can be mapped to capabilities.
