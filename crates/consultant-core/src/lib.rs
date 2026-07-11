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
    use crate::policy::hash_request;
    use serde_json::Value;
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;

    struct ParityCase {
        tool: &'static str,
        request_key: &'static str,
        fixture: &'static str,
    }

    const PARITY_MATRIX: &[ParityCase] = &[
        ParityCase {
            tool: "consultant.review_decision",
            request_key: "review_decision",
            fixture: "review_decision_mock.json",
        },
        ParityCase {
            tool: "consultant.research",
            request_key: "research",
            fixture: "research_mock.json",
        },
        ParityCase {
            tool: "consultant.challenge_answer",
            request_key: "challenge_answer",
            fixture: "challenge_answer_mock.json",
        },
        ParityCase {
            tool: "consultant.compare_options",
            request_key: "compare_options",
            fixture: "compare_options_mock.json",
        },
    ];

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    fn load_parity_requests() -> BTreeMap<String, Value> {
        let requests_path = repo_root().join("test/fixtures/parity/requests.json");
        let requests = fs::read_to_string(&requests_path)
            .unwrap_or_else(|error| panic!("read {}: {error}", requests_path.display()));
        serde_json::from_str(&requests).expect("parse parity requests")
    }

    fn parity_config() -> ConsultantConfig {
        ConsultantConfig {
            provider_name: "mock".to_string(),
            panel_models: vec!["mock-a".to_string(), "mock-b".to_string()],
            judge_model: "mock-judge".to_string(),
            timeout_ms: 1_000,
            max_output_tokens: 1_000,
            default_max_usd: 10.0,
            allow_confidential_external: false,
            mock: true,
        }
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

    fn expected_with_request_hash(mut expected: Value, request: &ConsultationRequest) -> Value {
        let hash = hash_request(request);
        expected["consultationId"] = Value::String(format!("consult_{hash}_NORMALIZED"));
        expected
    }

    async fn assert_mock_matches_golden(case: &ParityCase) {
        let requests = load_parity_requests();
        let request_value = requests
            .get(case.request_key)
            .unwrap_or_else(|| panic!("missing parity request {}", case.request_key))
            .clone();
        let kind = match case.request_key {
            "review_decision" => ConsultationKind::ReviewDecision,
            "research" => ConsultationKind::Research,
            "challenge_answer" => ConsultationKind::ChallengeAnswer,
            "compare_options" => ConsultationKind::CompareOptions,
            other => panic!("unknown parity request key {other}"),
        };
        let request = ConsultationRequest::from_value(kind, request_value)
            .expect("deserialize parity request");

        let fixture_path = repo_root()
            .join("test/fixtures/golden")
            .join(case.fixture);
        let fixture = fs::read_to_string(&fixture_path)
            .unwrap_or_else(|error| panic!("read {}: {error}", fixture_path.display()));
        let expected = expected_with_request_hash(
            serde_json::from_str(&fixture).expect("parse golden fixture"),
            &request,
        );

        let config = parity_config();
        let client = model_client_for_config(&config);
        let actual = run_consultation(request, client, &config).await;
        let actual_value = normalize_result(
            serde_json::to_value(actual).expect("serialize rust consultation result"),
        );

        assert_eq!(
            actual_value, expected,
            "rust mock {} should match {}",
            case.tool, case.fixture
        );
    }

    #[tokio::test]
    async fn review_decision_mock_matches_golden_fixture() {
        assert_mock_matches_golden(&PARITY_MATRIX[0]).await;
    }

    #[tokio::test]
    async fn research_mock_matches_golden_fixture() {
        assert_mock_matches_golden(&PARITY_MATRIX[1]).await;
    }

    #[tokio::test]
    async fn challenge_answer_mock_matches_golden_fixture() {
        assert_mock_matches_golden(&PARITY_MATRIX[2]).await;
    }

    #[tokio::test]
    async fn compare_options_mock_matches_golden_fixture() {
        assert_mock_matches_golden(&PARITY_MATRIX[3]).await;
    }
}