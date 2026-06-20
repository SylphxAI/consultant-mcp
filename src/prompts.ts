import type { ConsultationRequest, ConsultationKind } from "./types.js";

const RUBRIC = `
Evaluate like a senior production architect. Prefer evidence over plausibility.
Check correctness, security, privacy, cost, observability, rollback, migration risk,
SSOT boundaries, typed contracts, and long-term maintainability. Call out uncertainty.
Do not reveal hidden chain-of-thought; return concise reasoned findings.
`;

export function panelPrompt(request: ConsultationRequest): string {
  return `${RUBRIC}\n\nYou are one independent panel reviewer. Review this ${request.kind} request.\nReturn: verdict, top risks, blind spots, evidence gaps, and concrete recommendations.\n\nREQUEST JSON:\n${JSON.stringify(request, null, 2)}`;
}

export function judgePrompt(kind: ConsultationKind, request: ConsultationRequest, panelOutputs: string[]): string {
  return `${RUBRIC}\n\nYou are the judge synthesizer for a Sylphx Consultant MCP ${kind} consultation.\nCompare the panel outputs. Identify consensus, disagreements, blind spots, evidence gaps, and final recommendation.\nReturn JSON only matching this shape:\n{\n  "verdict": "strong_accept|accept_with_changes|needs_more_evidence|reject",\n  "confidence": 0.0,\n  "executiveSummary": "...",\n  "consensus": ["..."],\n  "disagreements": ["..."],\n  "blindSpots": ["..."],\n  "recommendedChanges": [{"priority":"must|should|could","change":"...","rationale":"..."}],\n  "evidenceGaps": ["..."],\n  "followUpQuestions": ["..."],\n  "citations": [{"title":"...","url":"...","quote":"..."}]\n}\n\nORIGINAL REQUEST:\n${JSON.stringify(request, null, 2)}\n\nPANEL OUTPUTS:\n${panelOutputs.map((output, index) => `--- PANEL ${index + 1} ---\n${output}`).join("\n\n")}`;
}
