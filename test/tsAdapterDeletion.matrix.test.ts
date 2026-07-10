import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("TS stdio adapter deletion matrix", () => {
  it("npm bin routes exclusively to Rust rmcp", () => {
    const bin = readFileSync(path.join(repoRoot, "bin/sylphx-consultant-mcp"), "utf8");
    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("resolve_transport");
    expect(bin).not.toContain("use_ts_transport");
    expect(bin).not.toContain('CONSULTANT_MCP_TRANSPORT:-}" == "ts"');
    expect(bin).not.toContain("dist/server.js");
  });

  it("TS stdio adapter sources are deleted", () => {
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "dist/server.js"))).toBe(false);
  });

  it("HTTP integration harness exists for web-mcp-http authority proof", () => {
    const integration = readFileSync(
      path.join(repoRoot, "test/integration/http-transport.test.ts"),
      "utf8"
    );
    expect(integration).toContain("MCP Server HTTP Transport Integration");
    expect(integration).toContain("golden mock parity over HTTP");
    expect(integration).toContain("parityMatrix");
    expect(integration).toContain("X-API-Key");
  });

  it("ledger records web-mcp-http as authority_rust", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const http = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
    expect(http?.state).toBe("authority_rust");
  });

  it("ledger records stdio-rust-rmcp as rust_impl (S5 rej-010)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
    expect(stdioRust?.state).toBe("rust_impl");
  });

  it("deletion gate script enforces ts_deleted ledger state", () => {
    const script = readFileSync(
      path.join(repoRoot, "scripts/check-ts-adapter-deletion-ready.sh"),
      "utf8"
    );
    expect(script).toContain('require_ledger_state "transport/stdio-ts-adapter" "ts_deleted"');
    expect(script).toContain("src/server.ts must be deleted");
    expect(script).toContain("use_ts_transport");
  });

  it("ledger records stdio-ts-adapter as ts_deleted", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
      summary: { ts_deleted: number; ts_only: number; completion_progress: number };
    };
    const tsAdapter = ledger.capabilities.find((cap) => cap.id === "transport/stdio-ts-adapter");
    expect(tsAdapter?.state).toBe("ts_deleted");
    expect(ledger.summary.ts_deleted).toBe(1);
    expect(ledger.summary.ts_only).toBe(0);
    expect(ledger.summary.completion_progress).toBeCloseTo(1 / 7, 4);
  });
});