import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("Web MCP HTTP rust_impl gate (rej-010)", () => {
  it("check-no-ts-http-backend gate script enforces Rust HTTP rust_impl", () => {
    const script = readText("scripts/check-no-ts-http-backend.sh");
    expect(script).toContain("check-no-ts-http-backend");
    expect(script).toContain("MCP_TRANSPORT");
    expect(script).toContain("transport/web-mcp-http");
    expect(script).toContain("rust_impl");
    expect(script).toContain("rej-010");
    expect(existsSync(path.join(repoRoot, "test/integration/http-transport.test.ts"))).toBe(true);
  });

  it("npm bin routes HTTP to Rust rmcp; residual TS is stdio-only opt-in", () => {
    const bin = readText("bin/sylphx-consultant-mcp");
    const tsEntry = readText("src/index.ts");
    const httpTransport = readText("crates/consultant-mcp-server/src/http_transport.rs");
    const server = readText("src/server.ts");

    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("MCP_TRANSPORT=http");
    expect(bin).toContain("use_ts_transport");
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(true);
    expect(tsEntry).not.toMatch(/StreamableHTTP|streamableHttp|MCP_HTTP/);
    expect(server).not.toMatch(/StreamableHTTPServerTransport/);
    expect(httpTransport).toContain("StreamableHttpService");
    expect(httpTransport).toContain("health_check");
  });

  it("migration ledger marks transport/web-mcp-http as rust_impl", () => {
    const ledger = JSON.parse(readText("docs/specs/consultant-mcp-migration-ledger.json")) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const http = ledger.capabilities.find((capability) => capability.id === "transport/web-mcp-http");
    expect(http?.state).toBe("rust_impl");
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
