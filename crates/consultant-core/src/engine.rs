use crate::policy::apply_policy;
use crate::prompts::{judge_prompt, panel_prompt};
use crate::types::{
    Citation, ConsultationRequest, ConsultationResult, ConsultantConfig, ModelClient,
    ModelCompleteInput, ModelMessage, PanelModelResult, PolicyTrace, ProviderTrace,
    RecommendedChange, Verdict,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct JudgeJson {
    verdict: Option<Verdict>,
    confidence: Option<f64>,
    #[serde(rename = "executiveSummary")]
    executive_summary: Option<String>,
    consensus: Option<Vec<String>>,
    disagreements: Option<Vec<String>>,
    #[serde(rename = "blindSpots")]
    blind_spots: Option<Vec<String>>,
    #[serde(rename = "recommendedChanges")]
    recommended_changes: Option<Vec<RecommendedChangeJson>>,
    #[serde(rename = "evidenceGaps")]
    evidence_gaps: Option<Vec<String>>,
    #[serde(rename = "followUpQuestions")]
    follow_up_questions: Option<Vec<String>>,
    citations: Option<Vec<CitationJson>>,
}

#[derive(Debug, Deserialize)]
struct RecommendedChangeJson {
    priority: Option<String>,
    change: Option<String>,
    rationale: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CitationJson {
    title: Option<String>,
    url: Option<String>,
    quote: Option<String>,
}

struct JudgedFields {
    verdict: Verdict,
    confidence: f64,
    executive_summary: String,
    consensus: Vec<String>,
    disagreements: Vec<String>,
    blind_spots: Vec<String>,
    recommended_changes: Vec<RecommendedChange>,
    evidence_gaps: Vec<String>,
    follow_up_questions: Vec<String>,
    citations: Vec<Citation>,
}

fn extract_json(text: &str) -> Result<JudgeJson, String> {
    let trimmed = text.trim();
    let fenced = trimmed
        .split("```")
        .nth(1)
        .map(|chunk| chunk.trim_start_matches("json").trim());
    let candidate = fenced.unwrap_or(trimmed);
    if let Ok(value) = serde_json::from_str::<JudgeJson>(candidate) {
        return Ok(value);
    }

    let start = candidate.find('{');
    let end = candidate.rfind('}');
    match (start, end) {
        (Some(start), Some(end)) if end > start => {
            serde_json::from_str(&candidate[start..=end]).map_err(|_| "judge_output_not_json".to_string())
        }
        _ => Err("judge_output_not_json".to_string()),
    }
}

fn sanitize_judge(json: JudgeJson) -> JudgedFields {
    JudgedFields {
        verdict: json.verdict.unwrap_or(Verdict::NeedsMoreEvidence),
        confidence: json
            .confidence
            .map(|value| value.clamp(0.0, 1.0))
            .unwrap_or(0.5),
        executive_summary: json
            .executive_summary
            .unwrap_or_else(|| "Judge returned no executive summary.".to_string()),
        consensus: json.consensus.unwrap_or_default(),
        disagreements: json.disagreements.unwrap_or_default(),
        blind_spots: json.blind_spots.unwrap_or_default(),
        recommended_changes: json
            .recommended_changes
            .unwrap_or_default()
            .into_iter()
            .map(|item| RecommendedChange {
                priority: item.priority.unwrap_or_else(|| "should".to_string()),
                change: item.change.unwrap_or_else(|| "Unspecified change".to_string()),
                rationale: item.rationale.unwrap_or_else(|| "No rationale supplied".to_string()),
            })
            .collect(),
        evidence_gaps: json.evidence_gaps.unwrap_or_default(),
        follow_up_questions: json.follow_up_questions.unwrap_or_default(),
        citations: json
            .citations
            .unwrap_or_default()
            .into_iter()
            .map(|item| Citation {
                title: item.title.unwrap_or_else(|| "Untitled source".to_string()),
                url: item.url,
                quote: item.quote,
            })
            .collect(),
    }
}

async fn call_panel(
    model_client: Arc<dyn ModelClient>,
    model: &str,
    request: &ConsultationRequest,
    config: &ConsultantConfig,
) -> PanelModelResult {
    let started = std::time::Instant::now();
    let response = model_client
        .complete(ModelCompleteInput {
            model: model.to_string(),
            messages: vec![
                ModelMessage {
                    role: "system".to_string(),
                    content: "You are an independent expert reviewer in a model panel.".to_string(),
                },
                ModelMessage {
                    role: "user".to_string(),
                    content: panel_prompt(request),
                },
            ],
            max_tokens: Some(config.max_output_tokens),
            temperature: Some(0.2),
            timeout_ms: Some(config.timeout_ms),
        })
        .await;

    match response {
        Ok(output) => PanelModelResult {
            model: output.model,
            role: "panelist".to_string(),
            ok: true,
            content: output.content,
            latency_ms: output.latency_ms,
            error: None,
        },
        Err(error) => PanelModelResult {
            model: model.to_string(),
            role: "panelist".to_string(),
            ok: false,
            content: String::new(),
            latency_ms: started.elapsed().as_millis() as i64,
            error: Some(error),
        },
    }
}

pub async fn run_consultation(
    request: ConsultationRequest,
    model_client: Arc<dyn ModelClient>,
    config: &ConsultantConfig,
) -> ConsultationResult {
    let started = std::time::Instant::now();
    let policy = apply_policy(&request, config);
    let consultation_id = format!(
        "consult_{}_{}",
        policy.request_hash,
        &Uuid::new_v4().simple().to_string()[..8]
    );

    if !policy.allowed {
        return ConsultationResult {
            consultation_id,
            kind: request.kind(),
            status: "blocked".to_string(),
            verdict: Verdict::NeedsMoreEvidence,
            confidence: 0.0,
            executive_summary: format!(
                "Consultation blocked by policy: {}",
                policy.reason.clone().unwrap_or_else(|| "policy_blocked".to_string())
            ),
            consensus: vec![],
            disagreements: vec![],
            blind_spots: vec![],
            recommended_changes: vec![],
            evidence_gaps: vec![policy
                .reason
                .clone()
                .unwrap_or_else(|| "policy_blocked".to_string())],
            follow_up_questions: vec![
                "Adjust privacy/budget policy or request approval before retrying.".to_string(),
            ],
            citations: vec![],
            panel: vec![],
            policy: PolicyTrace {
                privacy_class: policy.privacy_class,
                redaction_applied: policy.redaction_applied,
                budget_status: policy.budget_status,
                estimated_cost_usd: policy.estimated_cost_usd,
            },
            provider_trace: ProviderTrace {
                provider: config.provider_name.clone(),
                models: vec![],
                judge_model: config.judge_model.clone(),
                latency_ms: started.elapsed().as_millis() as i64,
            },
        };
    }

    let mut panel = Vec::new();
    for model in &config.panel_models {
        panel.push(
            call_panel(
                Arc::clone(&model_client),
                model,
                &policy.redacted_request,
                config,
            )
            .await,
        );
    }

    let successful: Vec<&PanelModelResult> = panel
        .iter()
        .filter(|item| item.ok && !item.content.trim().is_empty())
        .collect();

    if successful.is_empty() {
        return ConsultationResult {
            consultation_id,
            kind: request.kind(),
            status: "failed".to_string(),
            verdict: Verdict::NeedsMoreEvidence,
            confidence: 0.0,
            executive_summary:
                "All panel model calls failed; no judge synthesis was attempted.".to_string(),
            consensus: vec![],
            disagreements: vec![],
            blind_spots: vec![],
            recommended_changes: vec![],
            evidence_gaps: panel
                .iter()
                .map(|item| item.error.clone().unwrap_or_else(|| format!("{} failed", item.model)))
                .collect(),
            follow_up_questions: vec![
                "Check provider credentials, model allowlist, and network access.".to_string(),
            ],
            citations: vec![],
            panel,
            policy: PolicyTrace {
                privacy_class: policy.privacy_class,
                redaction_applied: policy.redaction_applied,
                budget_status: policy.budget_status,
                estimated_cost_usd: policy.estimated_cost_usd,
            },
            provider_trace: ProviderTrace {
                provider: config.provider_name.clone(),
                models: config.panel_models.clone(),
                judge_model: config.judge_model.clone(),
                latency_ms: started.elapsed().as_millis() as i64,
            },
        };
    }

    let judge_started = std::time::Instant::now();
    let judge_result = model_client
        .complete(ModelCompleteInput {
            model: config.judge_model.clone(),
            messages: vec![
                ModelMessage {
                    role: "system".to_string(),
                    content:
                        "You are a strict JSON-only judge synthesizer for a model consultation panel."
                            .to_string(),
                },
                ModelMessage {
                    role: "user".to_string(),
                    content: judge_prompt(
                        request.kind(),
                        &policy.redacted_request,
                        &successful
                            .iter()
                            .map(|item| item.content.clone())
                            .collect::<Vec<_>>(),
                    ),
                },
            ],
            max_tokens: Some(config.max_output_tokens),
            temperature: Some(0.1),
            timeout_ms: Some(config.timeout_ms),
        })
        .await;

    let (judge_panel_result, judged) = match judge_result {
        Ok(output) => {
            let judge_panel = PanelModelResult {
                model: output.model,
                role: "judge".to_string(),
                ok: true,
                content: output.content.clone(),
                latency_ms: output.latency_ms,
                error: None,
            };
            match extract_json(&output.content) {
                Ok(json) => (judge_panel, sanitize_judge(json)),
                Err(_) => (
                    judge_panel,
                    sanitize_judge(JudgeJson {
                        verdict: Some(Verdict::NeedsMoreEvidence),
                        confidence: Some(0.45),
                        executive_summary: Some(
                            "Judge synthesis failed; returning panel-only fallback.".to_string(),
                        ),
                        consensus: Some(
                            successful
                                .iter()
                                .take(3)
                                .map(|item| item.content.chars().take(300).collect::<String>())
                                .collect(),
                        ),
                        disagreements: None,
                        blind_spots: None,
                        recommended_changes: None,
                        evidence_gaps: Some(vec!["judge_failed".to_string()]),
                        follow_up_questions: Some(vec![
                            "Retry judge synthesis or inspect panel outputs manually.".to_string(),
                        ]),
                        citations: None,
                    }),
                ),
            }
        }
        Err(error) => {
            let judge_panel = PanelModelResult {
                model: config.judge_model.clone(),
                role: "judge".to_string(),
                ok: false,
                content: String::new(),
                latency_ms: judge_started.elapsed().as_millis() as i64,
                error: Some(error.clone()),
            };
            (
                judge_panel,
                sanitize_judge(JudgeJson {
                    verdict: Some(Verdict::NeedsMoreEvidence),
                    confidence: Some(0.45),
                    executive_summary: Some(
                        "Judge synthesis failed; returning panel-only fallback.".to_string(),
                    ),
                    consensus: Some(
                        successful
                            .iter()
                            .take(3)
                            .map(|item| item.content.chars().take(300).collect::<String>())
                            .collect(),
                    ),
                    disagreements: None,
                    blind_spots: None,
                    recommended_changes: None,
                    evidence_gaps: Some(vec![error]),
                    follow_up_questions: Some(vec![
                        "Retry judge synthesis or inspect panel outputs manually.".to_string(),
                    ]),
                    citations: None,
                }),
            )
        }
    };

    panel.push(judge_panel_result);

    ConsultationResult {
        consultation_id,
        kind: request.kind(),
        status: "completed".to_string(),
        verdict: judged.verdict,
        confidence: judged.confidence,
        executive_summary: judged.executive_summary,
        consensus: judged.consensus,
        disagreements: judged.disagreements,
        blind_spots: judged.blind_spots,
        recommended_changes: judged.recommended_changes,
        evidence_gaps: judged.evidence_gaps,
        follow_up_questions: judged.follow_up_questions,
        citations: judged.citations,
        panel,
        policy: PolicyTrace {
            privacy_class: policy.privacy_class,
            redaction_applied: policy.redaction_applied,
            budget_status: policy.budget_status,
            estimated_cost_usd: policy.estimated_cost_usd,
        },
        provider_trace: ProviderTrace {
            provider: config.provider_name.clone(),
            models: config.panel_models.clone(),
            judge_model: config.judge_model.clone(),
            latency_ms: started.elapsed().as_millis() as i64,
        },
    }
}