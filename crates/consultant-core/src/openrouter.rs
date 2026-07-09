use crate::types::{ModelClient, ModelCompleteInput, ModelCompleteOutput};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::time::{Duration, Instant};

pub struct OpenRouterCompatibleClient {
    api_key: Option<String>,
    base_url: String,
    referer: String,
    title: String,
    http: Client,
}

impl OpenRouterCompatibleClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            base_url: std::env::var("OPENROUTER_BASE_URL")
                .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string()),
            referer: std::env::var("OPENROUTER_HTTP_REFERER")
                .unwrap_or_else(|_| "https://sylphx.ai".to_string()),
            title: std::env::var("OPENROUTER_X_TITLE")
                .unwrap_or_else(|_| "Sylphx Consultant MCP".to_string()),
            http: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .expect("build reqwest client"),
        }
    }
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    model: Option<String>,
    choices: Option<Vec<ChatChoice>>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: Option<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[async_trait]
impl ModelClient for OpenRouterCompatibleClient {
    async fn complete(&self, input: ModelCompleteInput) -> Result<ModelCompleteOutput, String> {
        let api_key = self
            .api_key
            .as_deref()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                "OPENROUTER_API_KEY is required unless CONSULTANT_MOCK=true".to_string()
            })?;

        let started = Instant::now();
        let timeout_ms = input.timeout_ms.unwrap_or(120_000);
        let response = self
            .http
            .post(format!("{}/chat/completions", self.base_url))
            .timeout(Duration::from_millis(timeout_ms))
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", &self.referer)
            .header("X-Title", &self.title)
            .json(&serde_json::json!({
                "model": input.model,
                "messages": input.messages.iter().map(|message| serde_json::json!({
                    "role": message.role,
                    "content": message.content,
                })).collect::<Vec<_>>(),
                "max_tokens": input.max_tokens.unwrap_or(2000),
                "temperature": input.temperature.unwrap_or(0.2),
            }))
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "OpenRouter request failed {status}: {}",
                body.chars().take(1000).collect::<String>()
            ));
        }

        let payload: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|error| error.to_string())?;

        Ok(ModelCompleteOutput {
            model: payload
                .model
                .unwrap_or_else(|| input.model.clone()),
            content: payload
                .choices
                .and_then(|choices| choices.into_iter().next())
                .and_then(|choice| choice.message)
                .and_then(|message| message.content)
                .unwrap_or_default(),
            latency_ms: started.elapsed().as_millis() as i64,
        })
    }
}