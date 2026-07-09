use crate::types::{ConsultationRequest, ConsultantConfig, PrivacyClass};
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: Option<String>,
    pub privacy_class: PrivacyClass,
    pub redacted_request: ConsultationRequest,
    pub redaction_applied: bool,
    pub estimated_cost_usd: f64,
    pub budget_status: String,
    pub request_hash: String,
}

struct RedactionResult {
    value: Value,
    changed: bool,
}

fn redact_value(value: Value) -> RedactionResult {
    match value {
        Value::String(mut text) => {
            let patterns: &[(&str, &str)] = &[
                (r"sk-[A-Za-z0-9_-]{16,}", "[REDACTED_OPENAI_STYLE_KEY]"),
                (r"sk-or-[A-Za-z0-9_-]{16,}", "[REDACTED_OPENROUTER_KEY]"),
                (r"ghp_[A-Za-z0-9_]{20,}", "[REDACTED_GITHUB_TOKEN]"),
                (r"github_pat_[A-Za-z0-9_]{20,}", "[REDACTED_GITHUB_PAT]"),
                (r"AKIA[0-9A-Z]{16}", "[REDACTED_AWS_ACCESS_KEY]"),
                (
                    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
                    "[REDACTED_PRIVATE_KEY]",
                ),
                (
                    r"(?i)(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+",
                    "$1=[REDACTED_SECRET_VALUE]",
                ),
            ];

            let original = text.clone();
            for (pattern, replacement) in patterns {
                let re = regex::Regex::new(pattern).expect("valid redaction regex");
                text = re.replace_all(&text, *replacement).to_string();
            }

            RedactionResult {
                changed: text != original,
                value: Value::String(text),
            }
        }
        Value::Array(items) => {
            let mut changed = false;
            let mapped = items
                .into_iter()
                .map(|item| {
                    let result = redact_value(item);
                    changed |= result.changed;
                    result.value
                })
                .collect();
            RedactionResult {
                changed,
                value: Value::Array(mapped),
            }
        }
        Value::Object(map) => {
            let mut changed = false;
            let mut next = serde_json::Map::new();
            for (key, item) in map {
                let result = redact_value(item);
                changed |= result.changed;
                next.insert(key, result.value);
            }
            RedactionResult {
                changed,
                value: Value::Object(next),
            }
        }
        other => RedactionResult {
            changed: false,
            value: other,
        },
    }
}

fn stable_json(value: &Value) -> String {
    match value {
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(stable_json).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|key| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(key).expect("serialize key"),
                        stable_json(&map[key])
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        other => serde_json::to_string(other).expect("serialize scalar"),
    }
}

pub fn hash_request(request: &ConsultationRequest) -> String {
    let value = serde_json::to_value(request).expect("serialize request");
    let digest = Sha256::digest(stable_json(&value).as_bytes());
    format!("{:x}", digest)[..24].to_string()
}

pub fn apply_policy(request: &ConsultationRequest, config: &ConsultantConfig) -> PolicyDecision {
    let privacy_class = request.base().privacy_class;
    let serialized = serde_json::to_value(request).expect("serialize request");
    let redacted = redact_value(serialized);
    let redacted_request: ConsultationRequest =
        serde_json::from_value(redacted.value).expect("deserialize redacted request");

    let model_count = std::cmp::max(1, config.panel_models.len()) + 1;
    let estimated_cost_usd = ((model_count as f64) * 0.25 * 100.0).round() / 100.0;
    let max_usd = request
        .base()
        .budget
        .as_ref()
        .and_then(|budget| budget.max_usd)
        .unwrap_or(config.default_max_usd);
    let require_approval_over_usd = request
        .base()
        .budget
        .as_ref()
        .and_then(|budget| budget.require_approval_over_usd);

    let request_hash = hash_request(&redacted_request);

    if privacy_class == PrivacyClass::Confidential
        && !config.allow_confidential_external
        && !config.mock
    {
        return PolicyDecision {
            allowed: false,
            reason: Some("confidential_external_provider_blocked".to_string()),
            privacy_class,
            redacted_request,
            redaction_applied: redacted.changed,
            estimated_cost_usd,
            budget_status: "blocked".to_string(),
            request_hash,
        };
    }

    if estimated_cost_usd > max_usd {
        return PolicyDecision {
            allowed: false,
            reason: Some("estimated_cost_exceeds_max_usd".to_string()),
            privacy_class,
            redacted_request,
            redaction_applied: redacted.changed,
            estimated_cost_usd,
            budget_status: "blocked".to_string(),
            request_hash,
        };
    }

    if let Some(threshold) = require_approval_over_usd {
        if estimated_cost_usd > threshold {
            return PolicyDecision {
                allowed: false,
                reason: Some("estimated_cost_requires_approval".to_string()),
                privacy_class,
                redacted_request,
                redaction_applied: redacted.changed,
                estimated_cost_usd,
                budget_status: "requires_approval".to_string(),
                request_hash,
            };
        }
    }

    PolicyDecision {
        allowed: true,
        reason: None,
        privacy_class,
        redacted_request,
        redaction_applied: redacted.changed,
        estimated_cost_usd,
        budget_status: "ok".to_string(),
        request_hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ConsultationRequestBase, ReviewDecisionRequest};

    #[test]
    fn redacts_secret_like_values() {
        let request = ConsultationRequest::ReviewDecision(ReviewDecisionRequest {
            base: ConsultationRequestBase {
                title: None,
                context: "Use api_key=dummy_secret_value before calling provider".to_string(),
                constraints: None,
                privacy_class: PrivacyClass::Internal,
                budget: None,
                output_mode: "concise".to_string(),
                current_evidence: None,
            },
            decision: "test".to_string(),
        });

        let config = ConsultantConfig {
            provider_name: "mock".to_string(),
            panel_models: vec!["mock-a".to_string()],
            judge_model: "mock-judge".to_string(),
            timeout_ms: 1_000,
            max_output_tokens: 1_000,
            default_max_usd: 10.0,
            allow_confidential_external: false,
            mock: true,
        };

        let decision = apply_policy(&request, &config);
        assert!(decision.redaction_applied);
    }
}