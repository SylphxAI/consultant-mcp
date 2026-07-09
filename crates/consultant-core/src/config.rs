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
    ConsultantConfig {
        provider_name: std::env::var("CONSULTANT_PROVIDER")
            .unwrap_or_else(|_| "openrouter-compatible".to_string()),
        panel_models: list_env(
            "CONSULTANT_PANEL_MODELS",
            &[
                "openai/gpt-4.1",
                "anthropic/claude-sonnet-4",
                "google/gemini-2.5-pro",
            ],
        ),
        judge_model: std::env::var("CONSULTANT_JUDGE_MODEL")
            .unwrap_or_else(|_| "openrouter/fusion".to_string()),
        timeout_ms: number_env("CONSULTANT_TIMEOUT_MS", 120_000.0) as u64,
        max_output_tokens: number_env("CONSULTANT_MAX_OUTPUT_TOKENS", 2_000.0) as u32,
        default_max_usd: number_env("CONSULTANT_DEFAULT_MAX_USD", 2.0),
        allow_confidential_external: bool_env("CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL", false),
        mock: bool_env("CONSULTANT_MOCK", false),
    }
}