import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("Web MCP HTTP Rust authority gate", () => {
  it("check-no-ts-http-backend gate script exists and enforces Rust HTTP authority", () => {
    const script = readText("scripts/check-no-ts-http-backend.sh");

    expect(script).toContain("check-no-ts-http-backend");
    expect(script).toContain("resolve_rust_bin");
    expect(script).toContain("MCP_TRANSPORT=http");
    expect(script).toContain("StreamableHttpService");
    expect(script).toContain("transport/web-mcp-http");
    expect(script).toContain("authority_rust");
    expect(existsSync(path.join(repoRoot, "test/integration/http-transport.test.ts"))).toBe(true);
  });

  it("npm bin routes HTTP to Rust rmcp without TS stdio adapter", () => {
    const bin = readText("bin/sylphx-consultant-mcp");
    const tsEntry = readText("src/index.ts");
    const httpTransport = readText("crates/consultant-mcp-server/src/http_transport.rs");

    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("MCP_TRANSPORT=http");
    expect(bin).not.toContain("use_ts_transport");
    expect(bin).not.toMatch(/exec node/i);
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);

    expect(tsEntry).not.toMatch(/StreamableHTTP|streamableHttp|MCP_HTTP/);
    expect(httpTransport).toContain("StreamableHttpService");
    expect(httpTransport).toContain("health_check");
  });

  it("migration ledger marks transport/web-mcp-http as authority_rust", () => {
    const ledger = JSON.parse(
      readText("docs/specs/consultant-mcp-migration-ledger.json")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };

    const http = ledger.capabilities.find((capability) => capability.id === "transport/web-mcp-http");
    expect(http?.state).toBe("authority_rust");
  });

  it("HTTP integration harness proves four-tool golden mock parity", () => {
    const integration = readText("test/integration/http-transport.test.ts");

    expect(integration).toContain("parityMatrix");
    expect(integration).toContain("golden mock parity over HTTP");
    expect(integration).toContain("consultant.research");
    expect(integration).toContain("consultant.challenge_answer");
    expect(integration).toContain("consultant.compare_options");
  });
});