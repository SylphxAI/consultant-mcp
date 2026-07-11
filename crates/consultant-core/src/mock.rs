use crate::types::{ModelClient, ModelCompleteInput, ModelCompleteOutput};
use async_trait::async_trait;

pub struct MockModelClient;

#[async_trait]
impl ModelClient for MockModelClient {
    async fn complete(&self, input: ModelCompleteInput) -> Result<ModelCompleteOutput, String> {
        let last = input
            .messages
            .last()
            .map(|message| message.content.as_str())
            .unwrap_or("");

        if last.contains("Return JSON only") {
            return Ok(ModelCompleteOutput {
                model: input.model,
                latency_ms: 1,
                content: r#"{"verdict":"accept_with_changes","confidence":0.78,"executiveSummary":"Mock judge: design is viable for beta if policy, schemas, and observability stay explicit.","consensus":["Use typed intent tools","Keep a shared fan-out/judge engine","Treat external providers as adapters"],"disagreements":["How many tools to expose after beta should be usage-driven"],"blindSpots":["Persistent ledger is intentionally deferred from in-package beta"],"recommendedChanges":[{"priority":"must","change":"Keep privacy and budget gates before provider calls","rationale":"Prevents uncontrolled data/cost exposure"}],"evidenceGaps":["Run against real providers in staging"],"followUpQuestions":["Which repository and npm registry should own the package?"],"citations":[]}"#.to_string(),
            });
        }

        let model = input.model.clone();
        Ok(ModelCompleteOutput {
            model,
            latency_ms: 1,
            content: format!(
                "Mock panel for {}: typed Consultant MCP is appropriate; enforce budget/privacy and synthesize with a judge.",
                input.model
            ),
        })
    }
}