import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("TS stdio adapter deletion matrix (tick036 admission)", () => {
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
    expect(ledger.summary.ts_deleted).toBe(7);
    expect(ledger.summary.ts_only).toBe(0);
    expect(ledger.summary.completion_progress).toBe(1.0);
  });

  it("ledger records transport/stdio-rust-rmcp as ts_deleted (tick036 admission)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string; proof?: { status: string } }>;
      summary: {
        rust_impl: number;
        authority_rust: number;
        parity_proven: number;
        authority_progress: number;
        ts_deleted: number;
        completion_progress: number;
      };
    };
    const admittedProof = new Set(["missing", "differential_green", "canary_green", "caught_up"]);
    const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
    expect(stdioRust?.state).toBe("ts_deleted");
    expect(admittedProof.has(stdioRust?.proof?.status ?? "")).toBe(true);
    expect(ledger.summary.rust_impl).toBe(0);
    expect(ledger.summary.authority_rust).toBe(0);
    expect(ledger.summary.parity_proven).toBe(0);
    expect(ledger.summary.ts_deleted).toBe(7);
    expect(ledger.summary.completion_progress).toBe(1.0);
    expect(ledger.summary.authority_progress).toBe(1.0);
  });

  it("ledger records all four consultant tools as ts_deleted (tick036 admission)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
      summary: { ts_deleted: number };
    };
    for (const toolId of [
      "tool/consultant.review_decision",
      "tool/consultant.research",
      "tool/consultant.challenge_answer",
      "tool/consultant.compare_options",
    ]) {
      const tool = ledger.capabilities.find((cap) => cap.id === toolId);
      expect(tool?.state).toBe("ts_deleted");
    }
    expect(ledger.summary.ts_deleted).toBe(7);
  });
});