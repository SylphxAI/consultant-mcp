use consultant_mcp_server::{ConsultantMcp, SERVER_VERSION};
use rmcp::ServiceExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("doctor") {
        eprintln!(
            "consultant-mcp Rust MCP server {SERVER_VERSION} ({})",
            consultant_core::ENGINE_NAME
        );
        return Ok(());
    }

    let service = ConsultantMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}