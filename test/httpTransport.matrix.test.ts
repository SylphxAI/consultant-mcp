import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("web MCP HTTP transport routing", () => {
  it("bin wrapper routes MCP_TRANSPORT=http to Rust rmcp server", () => {
    const bin = readFileSync(path.join(repoRoot, "bin/sylphx-consultant-mcp"), "utf8");
    expect(bin).toContain("resolve_transport");
    expect(bin).toContain("MCP_TRANSPORT=http");
    expect(bin).toContain("CONSULTANT_MCP_TRANSPORT=http");
  });

  it("Rust MCP server exposes streamable HTTP transport module", () => {
    const httpTransport = readFileSync(
      path.join(repoRoot, "crates/consultant-mcp-server/src/http_transport.rs"),
      "utf8"
    );
    const mainRs = readFileSync(
      path.join(repoRoot, "crates/consultant-mcp-server/src/main.rs"),
      "utf8"
    );
    expect(httpTransport).toContain("StreamableHttpService");
    expect(httpTransport).toContain("health_check");
    expect(mainRs).toContain("http_transport::serve_http");
  });

  it("migration ledger marks transport/web-mcp-http as authority_rust", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const http = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
    expect(http?.state).toBe("authority_rust");
  });

  it("HTTP authority gate script exists", () => {
    const script = readFileSync(path.join(repoRoot, "scripts/check-no-ts-http-backend.sh"), "utf8");
    expect(script).toContain("authority_rust");
    expect(script).toContain("StreamableHttpService");
  });
});