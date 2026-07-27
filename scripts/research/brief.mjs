import { sourceIdsForClaim } from "./model.mjs";
import { RESEARCH_MARKER } from "./constants.mjs";

function citations(claim, data) {
  const ids = sourceIdsForClaim(claim, data);
  return ids.length ? ids.map((id) => `[${id}]`).join(" ") : "No external source";
}

function claimLine(claim, data) {
  return `- **${claim.classification}; ${claim.confidence} confidence:** ${claim.statement} ${citations(claim, data)}`;
}

export function renderResearchBrief(data) {
  const accepted = data.claims.filter((claim) => claim.status === "accepted");
  const findings = accepted.filter((claim) => claim.classification !== "assumption");
  const synthesis = findings.filter((claim) => claim.classification === "synthesis");
  const assumptions = data.claims.filter((claim) => claim.classification === "assumption" && claim.status !== "rejected");
  const contradictionPairs = new Set();
  for (const claim of data.claims) {
    for (const other of claim.contradicts) contradictionPairs.add([claim.id, other].sort().join("|"));
  }
  const limitations = [...new Set(accepted.flatMap((claim) => claim.limitations))];

  const lines = [
    RESEARCH_MARKER,
    "",
    `# ${data.topic.topic.title}`,
    "",
    "## Research Question",
    "",
    `> ${data.topic.topic.question}`,
    "",
    "## Review Status",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Owner | ${data.topic.topic.owner} |`,
    `| Status | ${data.topic.research.status} |`,
    `| Evidence reviewed as of | ${data.topic.research.asOf} |`,
    `| Sources | ${data.sources.length} |`,
    `| Accepted claims | ${accepted.length} |`,
    "",
    "## Executive Synthesis",
    "",
    ...(synthesis.length ? synthesis.map((claim) => claimLine(claim, data)) : ["No accepted synthesis has been recorded."]),
    "",
    "## Method",
    "",
    "RTB Publishing validated structured source, evidence, and claim records. Source advice is labeled separately from synthesis and assumptions. This brief does not treat practitioner guidance as controlled experimental evidence.",
    "",
    "## Findings",
    "",
    ...(findings.length ? findings.map((claim) => claimLine(claim, data)) : ["No accepted findings have been recorded."]),
    "",
    "## Conflicting Evidence",
    ""
  ];

  if (contradictionPairs.size === 0) lines.push("No explicit claim conflicts are recorded.");
  else {
    for (const pair of [...contradictionPairs].sort()) {
      const [left, right] = pair.split("|").map((id) => data.claims.find((claim) => claim.id === id));
      lines.push(`- **${left.id} versus ${right.id}:** ${left.statement} / ${right.statement}`);
    }
  }

  lines.push("", "## Limitations", "");
  lines.push(...(limitations.length ? limitations.map((item) => `- ${item}`) : ["- No limitations have been recorded."]));
  lines.push("", "## Open Assumptions", "");
  lines.push(...(assumptions.length ? assumptions.map((claim) => `- **${claim.id}:** ${claim.statement}`) : ["- No open assumptions are recorded."]));
  lines.push("", "## Source Freshness", "", "| Source | Accessed | Age at review | Status |", "|---|---|---:|---|");
  for (const source of data.sources) {
    const stale = data.staleSources.find((item) => item.id === source.id);
    const age = Math.floor((Date.parse(`${data.topic.research.asOf}T00:00:00Z`) - Date.parse(`${source.accessed}T00:00:00Z`)) / 86400000);
    lines.push(`| ${source.id} | ${source.accessed} | ${age} days | ${stale ? "Stale" : "Current"} |`);
  }
  lines.push("", "## Sources", "");
  for (const source of data.sources) {
    lines.push(`- **${source.id}:** ${source.author}. “${source.title}.” ${source.publisher}, ${source.published}. [Source](${source.url}). Accessed ${source.accessed}.`);
  }
  lines.push("", "## Human Approval Gate", "", data.topic.research.status === "approved"
    ? `Approved by the recorded owner, ${data.topic.topic.owner}.`
    : `Pending approval by ${data.topic.topic.owner}.`, "");
  return lines.join("\n");
}
