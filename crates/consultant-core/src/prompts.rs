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

#[cfg(test)]
mod pure_residual_tests {
    use super::*;
    use crate::types::{ConsultationRequest, ConsultationRequestBase, PrivacyClass, ReviewDecisionRequest};

    fn sample() -> ConsultationRequest {
        ConsultationRequest::ReviewDecision(ReviewDecisionRequest {
            base: ConsultationRequestBase {
                title: Some("t".into()),
                context: "c".into(),
                constraints: None,
                privacy_class: PrivacyClass::Internal,
                budget: None,
                output_mode: "concise".into(),
                current_evidence: None,
            },
            decision: "ship".into(),
        })
    }

    #[test]
    fn panel_and_judge_prompts_include_kind_and_json() {
        let req = sample();
        let panel = panel_prompt(&req);
        assert!(panel.contains("review_decision"));
        assert!(panel.contains("REQUEST JSON:"));
        assert!(panel.contains("ship"));
        let judge = judge_prompt(ConsultationKind::ReviewDecision, &req, &["panel-a".into(), "panel-b".into()]);
        assert!(judge.contains("PANEL 1"));
        assert!(judge.contains("PANEL 2"));
        assert!(judge.contains("panel-a"));
        assert!(judge.contains("Return JSON only"));
        assert!(judge.contains("strong_accept"));
    }

    #[test]
    fn panel_prompt_labels_research_challenge_compare() {
        use crate::types::{
            ChallengeAnswerRequest, CompareOption, CompareOptionsRequest, ResearchRequest,
        };
        let base = ConsultationRequestBase {
            title: None,
            context: "c".into(),
            constraints: None,
            privacy_class: PrivacyClass::Internal,
            budget: None,
            output_mode: "concise".into(),
            current_evidence: None,
        };
        let research = ConsultationRequest::Research(ResearchRequest {
            base: base.clone(),
            question: "why?".into(),
            scope: Some("api".into()),
        });
        let p = panel_prompt(&research);
        assert!(p.contains("research"));
        assert!(p.contains("why?"));
        let judge = judge_prompt(ConsultationKind::Research, &research, &["x".into()]);
        assert!(judge.contains("research"));
        assert!(judge.contains("PANEL 1"));

        let challenge = ConsultationRequest::ChallengeAnswer(ChallengeAnswerRequest {
            base: base.clone(),
            task: "task".into(),
            proposed_answer: "ans".into(),
        });
        assert!(panel_prompt(&challenge).contains("challenge_answer"));
        assert!(panel_prompt(&challenge).contains("ans"));

        let compare = ConsultationRequest::CompareOptions(CompareOptionsRequest {
            base,
            problem: "p".into(),
            options: vec![CompareOption {
                name: "A".into(),
                description: "da".into(),
            }],
        });
        assert!(panel_prompt(&compare).contains("compare_options"));
        assert!(panel_prompt(&compare).contains("\"A\"") || panel_prompt(&compare).contains("A"));
    }


    #[test]
    fn bw7_judge_prompt_empty_panel_and_rubric() {
        let req = sample();
        let judge = judge_prompt(ConsultationKind::ReviewDecision, &req, &[]);
        assert!(judge.contains("ORIGINAL REQUEST:"));
        assert!(judge.contains("PANEL OUTPUTS:"));
        assert!(judge.contains("senior production architect") || judge.contains("Evaluate like"));
        assert!(judge.contains("review_decision"));
        // empty panel still has section header but no PANEL N
        assert!(!judge.contains("PANEL 1"));
    }

    #[test]
    fn bw7_panel_prompt_contains_rubric_and_request_json() {
        let req = sample();
        let panel = panel_prompt(&req);
        assert!(panel.contains("REQUEST JSON:"));
        assert!(panel.contains("independent panel reviewer"));
        assert!(panel.contains("review_decision"));
        assert!(panel.contains("\"decision\"") || panel.contains("ship"));
    }


    #[test]
    fn bw8_judge_prompt_includes_verdict_enum_tokens() {
        let req = sample();
        let judge = judge_prompt(ConsultationKind::ReviewDecision, &req, &["p1".into()]);
        for token in ["strong_accept", "accept_with_changes", "reject", "needs_more_evidence"] {
            assert!(judge.contains(token), "missing {token} in {judge}");
        }
        assert!(judge.contains("PANEL 1"));
        assert!(judge.contains("p1"));
    }

    #[test]
    fn bw8_panel_prompt_research_scope_and_compare_option_json() {
        use crate::types::{
            CompareOption, CompareOptionsRequest, ResearchRequest,
        };
        let base = ConsultationRequestBase {
            title: Some("t".into()),
            context: "c".into(),
            constraints: Some(vec!["no net".into()]),
            privacy_class: PrivacyClass::Internal,
            budget: None,
            output_mode: "detailed".into(),
            current_evidence: None,
        };
        let research = ConsultationRequest::Research(ResearchRequest {
            base: base.clone(),
            question: "q?".into(),
            scope: Some("billing".into()),
        });
        let p = panel_prompt(&research);
        assert!(p.contains("billing"));
        assert!(p.contains("q?"));
        let compare = ConsultationRequest::CompareOptions(CompareOptionsRequest {
            base,
            problem: "which".into(),
            options: vec![
                CompareOption { name: "A".into(), description: "da".into() },
                CompareOption { name: "B".into(), description: "db".into() },
            ],
        });
        let p = panel_prompt(&compare);
        assert!(p.contains("compare_options"));
        assert!(p.contains("which"));
        assert!(p.contains("A") && p.contains("B"));
    }




    #[test]
    fn bulk_panel_prompt_includes_context() {
        use crate::types::{
            ConsultationRequest, ConsultationRequestBase, PrivacyClass, ReviewDecisionRequest,
        };
        let base = ConsultationRequestBase {
            title: Some("t".into()),
            context: "legacy ts migration".into(),
            constraints: None,
            privacy_class: PrivacyClass::Internal,
            budget: None,
            output_mode: "detailed".into(),
            current_evidence: None,
        };
        let req = ConsultationRequest::ReviewDecision(ReviewDecisionRequest {
            base,
            decision: "ship it".into(),
        });
        let prompt = panel_prompt(&req);
        assert!(prompt.contains("legacy ts migration"), "{prompt}");
        assert!(prompt.contains("ship it") || prompt.to_lowercase().contains("review"), "{prompt}");
    }
}
