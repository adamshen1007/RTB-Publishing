# M5A.1 Internal Pilot Protocol

## Evidence Boundary

No pilot session is claimed at implementation time. Create a record only after
performing the task. Remove secrets, private customer data, and raw canonical
content before committing a record.

## Recommended Threshold

- Three real registered projects
- Ten sessions across at least two weeks
- Setup, registration, inspection, workflow, and recovery tasks represented
- Setup under 10 minutes and registration under two minutes
- Dashboard and CLI state agree in every recorded comparison
- No unresolved high-severity security or accessibility finding

## Recording a Session

Copy `pilots/templates/session.yaml` to `pilots/sessions/PILOT-NNN.yaml`, perform
one task, and record only observed facts. `completed` means the intended outcome
was reached; it does not imply satisfaction.

## Decision Rule

Hosted M5B remains a no-go until the threshold is met and an RFC documents the
observed need. Requests are not evidence until they are tied to a real session.

Check progress without converting job history into pilot evidence:

```bash
pnpm rtb-publishing platform pilot check
pnpm rtb-publishing platform pilot status
```

The automated status can confirm record count, represented project IDs, elapsed
date span, and task coverage. It cannot decide whether projects are genuinely
active or whether security, accessibility, and hosted-product need are clear;
those remain manual review gates.
