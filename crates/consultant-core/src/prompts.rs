use crate::types::{ConsultationKind, ConsultationRequest};

const RUBRIC: &str = r"
Evaluate like a senior production architect. Prefer evidence over plausibility.
Check correctness, security, privacy, cost, observability, rollback, migration risk,
SSOT boundaries, typed contracts, and long-term maintainability. Call out uncertainty.
Do not reveal hidden chain-of-thought; return concise reasoned findings.
";

pub fn panel_prompt(request: &ConsultationRequest) -> String {
    let kind = match request.kind() {
        ConsultationKind::ReviewDecision => "review_decision",
        ConsultationKind::Research => "research",
        ConsultationKind::ChallengeAnswer => "challenge_answer",
        ConsultationKind::CompareOptions => "compare_options",
    };
    let payload =
        serde_json::to_string_pretty(request).expect("serialize consultation request");
    format!(
        "{RUBRIC}\n\nYou are one independent panel reviewer. Review this {kind} request.\nReturn: verdict, top risks, blind spots, evidence gaps, and concrete recommendations.\n\nREQUEST JSON:\n{payload}"
    )
}

pub fn judge_prompt(
    kind: ConsultationKind,
    request: &ConsultationRequest,
    panel_outputs: &[String],
) -> String {
    let kind_label = match kind {
        ConsultationKind::ReviewDecision => "review_decision",
        ConsultationKind::Research => "research",
        ConsultationKind::ChallengeAnswer => "challenge_answer",
        ConsultationKind::CompareOptions => "compare_options",
    };
    let payload =
        serde_json::to_string_pretty(request).expect("serialize consultation request");
    let panel = panel_outputs
        .iter()
        .enumerate()
        .map(|(index, output)| format!("--- PANEL {} ---\n{output}", index + 1))
        .collect::<Vec<_>>()
        .join("\n\n");

    format!(
        "{RUBRIC}\n\nYou are the judge synthesizer for a Sylphx Consultant MCP {kind_label} consultation.\nCompare the panel outputs. Identify consensus, disagreements, blind spots, evidence gaps, and final recommendation.\nReturn JSON only matching this shape:\n{{\n  \"verdict\": \"strong_accept|accept_with_changes|needs_more_evidence|reject\",\n  \"confidence\": 0.0,\n  \"executiveSummary\": \"...\",\n  \"consensus\": [\"...\"],\n  \"disagreements\": [\"...\"],\n  \"blindSpots\": [\"...\"],\n  \"recommendedChanges\": [{{\"priority\":\"must|should|could\",\"change\":\"...\",\"rationale\":\"...\"}}],\n  \"evidenceGaps\": [\"...\"],\n  \"followUpQuestions\": [\"...\"],\n  \"citations\": [{{\"title\":\"...\",\"url\":\"...\",\"quote\":\"...\"}}]\n}}\n\nORIGINAL REQUEST:\n{payload}\n\nPANEL OUTPUTS:\n{panel}"
    )
}