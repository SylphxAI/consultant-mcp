pub mod config;
pub mod engine;
pub mod mock;
pub mod openrouter;
pub mod policy;
pub mod prompts;
pub mod types;

pub use config::load_config;
pub use engine::run_consultation;
pub use mock::MockModelClient;
pub use openrouter::OpenRouterCompatibleClient;
pub use types::{
    ConsultationKind, ConsultationRequest, ConsultationResult, ConsultantConfig, ENGINE_NAME,
    ENGINE_VERSION, ModelClient,
};

use std::sync::Arc;

pub fn model_client_for_config(config: &ConsultantConfig) -> Arc<dyn ModelClient> {
    if config.mock {
        Arc::new(MockModelClient)
    } else {
        let api_key = std::env::var("OPENROUTER_API_KEY")
            .ok()
            .or_else(|| std::env::var("OPENROUTER_FUSION_API_KEY").ok());
        Arc::new(OpenRouterCompatibleClient::new(api_key))
    }
}

#[cfg(test)]
mod parity {
    use super::*;
    use crate::types::{ConsultationRequestBase, PrivacyClass, ReviewDecisionRequest};
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
    }

    fn normalize_result(mut value: Value) -> Value {
        if let Some(id) = value.get("consultationId").and_then(Value::as_str) {
            let normalized = id
                .rsplit_once('_')
                .map(|(prefix, _)| format!("{prefix}_NORMALIZED"))
                .unwrap_or_else(|| id.to_string());
            value["consultationId"] = Value::String(normalized);
        }

        if let Some(trace) = value.get_mut("providerTrace").and_then(Value::as_object_mut) {
            trace.insert("latencyMs".to_string(), Value::Number(0.into()));
        }

        if let Some(panel) = value.get_mut("panel").and_then(Value::as_array_mut) {
            for entry in panel {
                if let Some(obj) = entry.as_object_mut() {
                    obj.insert("latencyMs".to_string(), Value::Number(0.into()));
                }
            }
        }

        value
    }

    #[tokio::test]
    async fn review_decision_mock_matches_golden_fixture() {
        let fixture_path = repo_root().join("test/fixtures/golden/review_decision_mock.json");
        let fixture = fs::read_to_string(&fixture_path)
            .unwrap_or_else(|error| panic!("read {}: {error}", fixture_path.display()));
        let expected: Value = serde_json::from_str(&fixture).expect("parse golden fixture");

        let request = ConsultationRequest::ReviewDecision(ReviewDecisionRequest {
            base: ConsultationRequestBase {
                title: None,
                context: "Agents need high-quality design review without leaking secrets or spending unbounded budget.".to_string(),
                constraints: Some(vec![
                    "Beta 0.x".to_string(),
                    "MCP compatible".to_string(),
                    "typed output".to_string(),
                ]),
                privacy_class: PrivacyClass::Internal,
                budget: None,
                output_mode: "concise".to_string(),
                current_evidence: None,
            },
            decision: "Expose typed Consultant MCP tools backed by a shared deliberation engine."
                .to_string(),
        });

        let config = ConsultantConfig {
            provider_name: "mock".to_string(),
            panel_models: vec!["mock-a".to_string(), "mock-b".to_string()],
            judge_model: "mock-judge".to_string(),
            timeout_ms: 1_000,
            max_output_tokens: 1_000,
            default_max_usd: 10.0,
            allow_confidential_external: false,
            mock: true,
        };

        let client = model_client_for_config(&config);
        let actual = run_consultation(request, client, &config).await;
        let actual_value = normalize_result(
            serde_json::to_value(actual).expect("serialize rust consultation result"),
        );

        assert_eq!(actual_value, expected);
    }
}