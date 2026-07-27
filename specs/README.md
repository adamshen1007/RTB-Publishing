# Specification Index

This directory contains the canonical implementation contracts for RTB Publishing.
Numbered publishing-platform specifications use a stable three-digit prefix so
references do not change when new specifications are added.

## Number Registry

| Number | Topic | Status |
| --- | --- | --- |
| 000 | Master specification | Defined |
| 001 | Repository folder structure | Defined |
| 002 | Markdown | Defined |
| 003 | Book | Defined |
| 004 | Chapter | Defined |
| 005 | Diagram | Defined |
| 006 | Publishing pipeline | Defined |
| 007 | Output profiles and metadata | Defined |
| 008 | Citations | Defined |
| 009 | Notion synchronization | Defined |
| 010 | Research workflow | Defined |
| 011 | Knowledge model | Reserved for M2 or later |
| 012 | Automation | Reserved for M1 or later |
| 013 | AI agent behavior | Defined |
| 014 | Integrations | Reserved for M4 or later |
| 015 | Release and versioning | Defined |
| 016 | Quality gates | Defined |
| 017 | Engineering kit generator | Defined |
| 018 | Local founder workspace | Defined |

The gaps are intentional reservations, not missing files. A reserved file is
created only when its milestone begins and its contract is ready for review.
Reserved topics may be changed by an RFC before implementation starts, but
accepted numbers must not be silently reused for a different topic.

## Supporting Specifications

- [`engines/`](engines/) defines the responsibilities and boundaries of the
  RTB Publishing engines.
- [`orchestration/`](orchestration/) defines interaction patterns, approval
  gates, and the lightweight initial workflow.
