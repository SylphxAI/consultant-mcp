import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("TS stdio adapter residual matrix (rej-010 dual-path)", () => {
  it("npm bin prefers Rust rmcp and retains TS opt-in residual", () => {
    const bin = readFileSync(path.join(repoRoot, "bin/sylphx-consultant-mcp"), "utf8");
    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("resolve_transport");
    expect(bin).toContain("use_ts_transport");
    expect(bin).toContain("dist/server.js");
  });

  it("TS stdio adapter sources remain until proven cutover", () => {
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(true);
  });

  it("HTTP integration harness exists for web-mcp-http rust_impl proof", () => {
    const integration = readFileSync(
      path.join(repoRoot, "test/integration/http-transport.test.ts"),
      "utf8"
    );
    expect(integration).toContain("MCP Server HTTP Transport Integration");
    expect(integration).toContain("golden mock parity over HTTP");
    expect(integration).toContain("parityMatrix");
  });

  it("ledger records web-mcp-http as rust_impl (not authority_rust)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const http = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
    expect(http?.state).toBe("rust_impl");
  });

  it("ledger records stdio-rust-rmcp as rust_impl (rej-010)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
    expect(stdioRust?.state).toBe("rust_impl");
  });

  it("deletion gate script exists for future ts_deleted cutover", () => {
    const script = readFileSync(
      path.join(repoRoot, "scripts/check-ts-adapter-deletion-ready.sh"),
      "utf8"
    );
    expect(script).toContain('require_ledger_state "transport/stdio-ts-adapter" "ts_deleted"');
    expect(script).toContain("src/server.ts must be deleted");
  });

  it("ledger records stdio-ts-adapter as ts_only residual (not ts_deleted)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
      summary: { ts_deleted: number; ts_only: number; completion_progress: number };
    };
    const tsAdapter = ledger.capabilities.find((cap) => cap.id === "transport/stdio-ts-adapter");
    expect(tsAdapter?.state).toBe("ts_only");
    expect(ledger.summary.ts_deleted).toBe(0);
    expect(ledger.summary.ts_only).toBe(1);
    expect(ledger.summary.completion_progress).toBe(0);
  });
});
