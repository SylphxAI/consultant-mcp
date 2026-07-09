pub mod http_transport;
pub mod tools;

use consultant_core::{
    load_config, model_client_for_config, run_consultation, ConsultationKind, ConsultationRequest,
};
use rmcp::{
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};
use serde_json::Value;
use std::sync::Arc;

pub const SERVER_NAME: &str = "sylphx-consultant-mcp";
pub const SERVER_VERSION: &str = "0.1.1";
pub const SERVER_INSTRUCTIONS: &str = "Sylphx Consultant MCP (Rust rmcp transport). Typed review, research, challenge, and compare tools backed by a shared deliberation engine.";

#[derive(Clone)]
pub struct ConsultantMcp {
    pub tool_router: ToolRouter<Self>,
    model_client: Arc<dyn consultant_core::ModelClient>,
    config: consultant_core::ConsultantConfig,
}

impl Default for ConsultantMcp {
    fn default() -> Self {
        Self::new()
    }
}

impl ConsultantMcp {
    pub fn new() -> Self {
        let config = load_config();
        Self {
            tool_router: Self::tool_router(),
            model_client: model_client_for_config(&config),
            config,
        }
    }

    async fn consult_tool(
        &self,
        kind: ConsultationKind,
        args: Value,
    ) -> Result<CallToolResult, ErrorData> {
        let request = ConsultationRequest::from_value(kind, args).map_err(|error| {
            ErrorData::invalid_params(error, None)
        })?;
        let result = run_consultation(request, Arc::clone(&self.model_client), &self.config)
            .await;
        let structured = serde_json::to_value(result).map_err(|error| {
            ErrorData::internal_error(error.to_string(), None)
        })?;
        Ok(CallToolResult::structured(structured))
    }
}

#[tool_router]
impl ConsultantMcp {
    #[tool(
        name = "consultant.review_decision",
        description = "Review an ADR, architecture decision, or high-stakes design with a model panel and judge synthesis."
    )]
    async fn consultant_review_decision(
        &self,
        Parameters(args): Parameters<Value>,
    ) -> Result<CallToolResult, ErrorData> {
        self.consult_tool(ConsultationKind::ReviewDecision, args)
            .await
    }

    #[tool(
        name = "consultant.research",
        description = "Synthesize research for a question with explicit scope, freshness, citations, and evidence gaps."
    )]
    async fn consultant_research(
        &self,
        Parameters(args): Parameters<Value>,
    ) -> Result<CallToolResult, ErrorData> {
        self.consult_tool(ConsultationKind::Research, args).await
    }

    #[tool(
        name = "consultant.challenge_answer",
        description = "Red-team or skeptically review a proposed answer before an agent ships it."
    )]
    async fn consultant_challenge_answer(
        &self,
        Parameters(args): Parameters<Value>,
    ) -> Result<CallToolResult, ErrorData> {
        self.consult_tool(ConsultationKind::ChallengeAnswer, args)
            .await
    }

    #[tool(
        name = "consultant.compare_options",
        description = "Compare two or more options against criteria and synthesize a recommendation."
    )]
    async fn consultant_compare_options(
        &self,
        Parameters(args): Parameters<Value>,
    ) -> Result<CallToolResult, ErrorData> {
        self.consult_tool(ConsultationKind::CompareOptions, args)
            .await
    }
}

#[tool_handler]
impl ServerHandler for ConsultantMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: rmcp::model::ProtocolVersion::default(),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: SERVER_NAME.into(),
                title: None,
                version: SERVER_VERSION.into(),
                description: Some(
                    "Rust-native MCP server for consultant-mcp (modelcontextprotocol/rust-sdk rmcp)"
                        .into(),
                ),
                icons: None,
                website_url: Some("https://github.com/SylphxAI/consultant-mcp".into()),
            },
            instructions: Some(SERVER_INSTRUCTIONS.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::ConsultantMcp;

    #[test]
    fn exposes_four_consultant_tools() {
        let tools = ConsultantMcp::new().tool_router.list_all();
        let names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.contains(&"consultant.review_decision".to_string()));
        assert!(names.contains(&"consultant.research".to_string()));
        assert!(names.contains(&"consultant.challenge_answer".to_string()));
        assert!(names.contains(&"consultant.compare_options".to_string()));
    }

    #[test]
    fn rust_http_transport_module_is_wired_for_web_mcp() {
        let src_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
        let main_rs = fs::read_to_string(src_dir.join("main.rs")).expect("read main.rs");
        let http_rs = fs::read_to_string(src_dir.join("http_transport.rs")).expect("read http_transport.rs");
        assert!(main_rs.contains("http_transport::serve_http"));
        assert!(http_rs.contains("StreamableHttpService"));
        assert!(http_rs.contains("/mcp/health"));
    }
}