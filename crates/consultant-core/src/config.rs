use crate::types::ConsultantConfig;

fn bool_env(name: &str, fallback: bool) -> bool {
    match std::env::var(name) {
        Ok(value) if !value.is_empty() => {
            matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on")
        }
        _ => fallback,
    }
}

fn number_env(name: &str, fallback: f64) -> f64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(fallback)
}

fn list_env(name: &str, fallback: &[&str]) -> Vec<String> {
    match std::env::var(name) {
        Ok(value) if !value.is_empty() => value
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        _ => fallback.iter().map(|item| (*item).to_string()).collect(),
    }
}

pub fn load_config() -> ConsultantConfig {
    let mock = bool_env("CONSULTANT_MOCK", false);

    // Golden parity fixtures (test/fixtures/golden/*_mock.json) assume mock panel/judge.
    // When mock mode is on and panel/judge env is unset, default to the mock corpus models.
    let (default_provider, default_panel, default_judge) = if mock {
        (
            "mock",
            &["mock-a", "mock-b"][..],
            "mock-judge",
        )
    } else {
        (
            "openrouter-compatible",
            &[
                "openai/gpt-4.1",
                "anthropic/claude-sonnet-4",
                "google/gemini-2.5-pro",
            ][..],
            "openrouter/fusion",
        )
    };

    ConsultantConfig {
        provider_name: std::env::var("CONSULTANT_PROVIDER")
            .unwrap_or_else(|_| default_provider.to_string()),
        panel_models: list_env("CONSULTANT_PANEL_MODELS", default_panel),
        judge_model: std::env::var("CONSULTANT_JUDGE_MODEL")
            .unwrap_or_else(|_| default_judge.to_string()),
        timeout_ms: number_env("CONSULTANT_TIMEOUT_MS", if mock { 1_000.0 } else { 120_000.0 }) as u64,
        max_output_tokens: number_env(
            "CONSULTANT_MAX_OUTPUT_TOKENS",
            if mock { 1_000.0 } else { 2_000.0 },
        ) as u32,
        default_max_usd: number_env("CONSULTANT_DEFAULT_MAX_USD", if mock { 10.0 } else { 2.0 }),
        allow_confidential_external: bool_env("CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL", false),
        mock,
    }
}
