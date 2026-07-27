# ADR-005 — Local Derived Read Model

## Status

Accepted

## Context

RTB Publishing needs a coherent interface without introducing a database or web
application as a competing source of truth.

## Decision

Use the existing Node runtime to serve a dependency-light local application.
A versioned workspace manifest registers projects. The indexer derives JSON
summaries from canonical manifests, roadmap files, research records, and agent
artifacts. The UI never writes canonical content directly; jobs invoke existing
CLI workflows through a fixed allowlist.

## Consequences

- The first platform slice remains portable, inspectable, and easy to remove.
- No database migration, account system, or cloud service is required.
- Repository-contained projects are supported by the committed registry.
  ADR-006 permits explicit external roots through an ignored, read-only local
  overlay; arbitrary external execution remains deferred.
- A later framework or hosted architecture requires fresh evidence and an ADR.
- Pilot progress is another derived read model: only validated session records
  contribute, while job history remains a separate operational source.
