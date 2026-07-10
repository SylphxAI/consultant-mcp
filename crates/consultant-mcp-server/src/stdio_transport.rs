//! Default MCP stdio transport for consultant-mcp (rmcp).
//!
//! S5 bounded slice: Rust rmcp stdio is the default transport when HTTP is not
//! selected via `MCP_TRANSPORT` / `CONSULTANT_MCP_TRANSPORT`.

use crate::ConsultantMcp;
use rmcp::ServiceExt;

/// Serve the consultant MCP server over rmcp stdio (default transport).
pub async fn serve_stdio() -> anyhow::Result<()> {
    let service = ConsultantMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn stdio_transport_uses_rmcp_stdio_surface() {
        let src_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
        let stdio_rs =
            fs::read_to_string(src_dir.join("stdio_transport.rs")).expect("read stdio_transport.rs");
        let main_rs = fs::read_to_string(src_dir.join("main.rs")).expect("read main.rs");

        assert!(stdio_rs.contains("transport::stdio"));
        assert!(stdio_rs.contains("serve_stdio"));
        assert!(main_rs.contains("stdio_transport::serve_stdio"));
    }
}