# RTB Publishing Engine Interaction and Orchestration Specification

**Milestone:** M0 — Strategy and Governance  
**Status:** Draft

## Purpose

This specification defines how RTB Publishing Core engines collaborate.

Previous milestones defined:

- Domains — ownership boundaries
- Capabilities — value delivered
- Engines — implementation boundaries

This document defines the orchestration model between engines so RTB Publishing can operate as a coherent platform rather than a collection of disconnected modules.

---

# 1. Core Orchestration Principle

RTB Publishing engines should communicate through explicit contracts, events, and shared objects.

Engines should avoid hidden dependencies, direct file mutation across domains, or implicit behavior.

The default interaction pattern is:

```text
Engine emits event
  ↓
Orchestrator routes event
  ↓
Receiving engine validates input
  ↓
Receiving engine produces output
  ↓
Quality Engine validates
  ↓
Automation Engine records result
```

---

# 2. Interaction Types

RTB Publishing supports three interaction types.

## 2.1 Event-Based Interaction

Used when one engine completes work and another engine may react.

Example:

```text
Research Engine emits ResearchCompleted
Knowledge Engine receives ResearchCompleted
Knowledge Engine emits KnowledgeUpdated
```

Use for:

- publishing workflows
- quarterly updates
- release flows
- research ingestion
- validation results

## 2.2 Request/Response Interaction

Used when one engine explicitly needs a result from another.

Example:

```text
Publishing Engine requests DiagramRenderCheck from Quality Engine
Quality Engine returns ValidationReport
```

Use for:

- validation
- export generation
- metadata lookup
- artifact retrieval

## 2.3 Human Approval Interaction

Used for strategic or high-impact actions.

Example:

```text
AI Agent Engine proposes ArchitectureChange
Governance Engine requires HumanApproval
ADR is created before implementation
```

Use for:

- architecture changes
- source-of-truth changes
- major MCP adoption
- release approval
- public claims with reputational risk

---

# 3. Engine Dependency Rules

## 3.1 Allowed Direction

Engines may depend on:

- Shared Kernel
- Governance policies
- Explicit engine contracts
- Published events
- Versioned specifications

Engines must not depend on:

- another engine's private implementation
- undocumented file conventions
- unapproved external services
- unsourced AI-generated facts

---

# 4. Engine Interaction Matrix

| Source Engine | May Interact With | Primary Interaction |
|---|---|---|
| Governance | All engines | Policy, approval, ADR/RFC |
| Knowledge | Research, Authoring, Engineering, AI Agents | Events, shared objects |
| Research | Knowledge, Authoring, Quality | Research events, citation packs |
| Engineering | Governance, AI Agents, Automation, SDK/CLI | Specs, milestones, prompts |
| Authoring | Research, Knowledge, Publishing, Quality | Manuscript workflow |
| Publishing | Authoring, Quality, Automation, Integrations | Export workflow |
| Automation | All engines | CI/CD, scheduled jobs, release jobs |
| AI Agents | All engines through contracts | Agent tasks and handoffs |
| Integrations | Publishing, Automation, AI Agents | MCP adapters |
| Quality | All engines | Validation reports |
| SDK/CLI | Engineering, Publishing, Automation | Local commands |

---

# 5. Standard Event Schema

Every event should follow this schema.

```yaml
event_id:
event_type:
source_engine:
target_engine:
object_type:
object_id:
status:
version:
timestamp:
actor:
payload:
related_events:
requires_approval:
```

## Required Fields

- `event_id`
- `event_type`
- `source_engine`
- `object_type`
- `object_id`
- `timestamp`
- `status`

---

# 6. Standard Event Types

## Governance Events

- RFCSubmitted
- RFCAccepted
- RFCRejected
- ADRProposed
- ADRAccepted
- PolicyUpdated
- HumanApprovalRequired
- HumanApprovalGranted

## Knowledge Events

- KnowledgeNoteCreated
- KnowledgeUpdated
- TemplateUpdated
- PromptUpdated
- LessonLearnedCaptured

## Research Events

- ResearchStarted
- ResearchCompleted
- SourceReviewed
- CitationPackCreated
- QuarterlyUpdatePrepared

## Engineering Events

- PRDGenerated
- SpecificationGenerated
- MilestoneCreated
- EngineeringKitGenerated
- AcceptanceCriteriaDefined

## Authoring Events

- BookCreated
- ChapterDrafted
- ManuscriptReady
- WorksheetCreated
- DiagramRequested

## Publishing Events

- NotionSyncRequested
- NotionSyncCompleted
- PDFExportRequested
- EPUBExportRequested
- DOCXExportRequested
- PublicationReady

## Automation Events

- ValidationStarted
- ValidationPassed
- ValidationFailed
- BuildStarted
- BuildCompleted
- ReleaseJobStarted
- ReleasePublished

## AI Agent Events

- AgentTaskRequested
- AgentTaskStarted
- AgentTaskCompleted
- AgentTaskFailed
- AgentHandoffCreated

## Integration Events

- MCPConnectionRequested
- MCPConnectionSucceeded
- MCPConnectionFailed
- ExternalSyncCompleted

## Quality Events

- QualityCheckRequested
- QualityCheckPassed
- QualityCheckFailed
- CitationCheckFailed
- DiagramRenderFailed

---

# 7. Workflow: Research to Knowledge

```text
ResearchStarted
  ↓
SourceReviewed
  ↓
ResearchCompleted
  ↓
CitationPackCreated
  ↓
KnowledgeUpdated
```

Acceptance criteria:

- Sources are documented.
- Claims are separated from synthesis.
- Citation pack is attached.
- Knowledge note is versioned.

---

# 8. Workflow: Chapter Authoring to Publishing

```text
ChapterDrafted
  ↓
QualityCheckRequested
  ↓
QualityCheckPassed
  ↓
ManuscriptReady
  ↓
NotionSyncRequested
  ↓
NotionSyncCompleted
  ↓
PDFExportRequested
  ↓
PublicationReady
```

Acceptance criteria:

- Chapter meets chapter spec.
- Diagrams render.
- Sources are included where needed.
- Notion sync does not become source of truth.
- Export artifacts are generated from Markdown.

---

# 9. Workflow: Engineering Kit Generation

```text
PRDGenerated
  ↓
SpecificationGenerated
  ↓
MilestoneCreated
  ↓
AcceptanceCriteriaDefined
  ↓
EngineeringKitGenerated
  ↓
ValidationPassed
```

Acceptance criteria:

- PRD exists.
- Specs map to capabilities.
- Milestones are scoped.
- Acceptance criteria are measurable.
- AI prompts are included where needed.

---

# 10. Workflow: Architecture Change

```text
RFCSubmitted
  ↓
HumanApprovalRequired
  ↓
RFCAccepted
  ↓
ADRProposed
  ↓
ADRAccepted
  ↓
SpecificationUpdated
```

Acceptance criteria:

- RFC explains motivation, proposal, alternatives, risks.
- Human approval is recorded.
- ADR documents accepted decision.
- Specs are updated.
- Changelog is updated.

---

# 11. Failure Handling

Every engine interaction must define failure handling.

## Failure Categories

- Validation failure
- Missing source
- Broken link
- Diagram render failure
- MCP failure
- Permission failure
- Human approval missing
- Conflicting source-of-truth state

## Failure Rules

1. Failures must produce a report.
2. Failures must not silently mutate canonical source files.
3. MCP failure must not destroy Markdown source.
4. AI-generated output that fails validation must return to review.
5. Human approval failures must block release.

---

# 12. State Model

Common states:

```text
Draft
In Review
Approved
Implemented
Validated
Published
Deprecated
Archived
```

Object-specific states may extend this list but should not contradict it.

---

# 13. Orchestrator Responsibilities

The future Orchestrator should:

- route events
- track workflow state
- enforce engine contracts
- request quality checks
- require human approval where needed
- maintain event history
- expose status to CLI or dashboards

The Orchestrator should not:

- own canonical content
- bypass governance
- rewrite source without traceability
- make strategic decisions independently

---

# 14. Human Approval Gates

Human approval is required for:

- Constitution changes
- architecture decisions
- new core engine adoption
- source-of-truth changes
- public release approval
- strategic positioning changes
- unsupported or sensitive claims
- commercial product commitments

---

# 15. Minimal Implementation Recommendation

M1 — Publishing Foundation should implement only the simplest orchestration
pattern:

```text
Markdown file change
  ↓
Quality checks
  ↓
Publishing export
  ↓
Release artifact
```

Do not build a complex orchestration runtime until manual workflows are validated.

---

# 16. Acceptance Criteria

This specification is accepted when:

- Engine communication patterns are defined.
- Standard event schema is documented.
- Core event types are listed.
- Key workflows are documented.
- Failure handling is defined.
- Human approval gates are clear.
- M1 implementation can proceed without ambiguous engine interactions.

---

# 17. Decision

RTB Publishing should proceed with an event-first orchestration model, while keeping the first implementation lightweight and file-based.

The initial implementation should rely on Git, Markdown, CI checks, and scripts before introducing a full event runtime.
