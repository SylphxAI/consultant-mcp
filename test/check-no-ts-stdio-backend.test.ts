import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("MCP stdio Rust authority gate (ts_deleted admission)", () => {
  it("check-no-ts-stdio-backend gate script enforces sole Rust rmcp stdio", () => {
    const script = readText("scripts/check-no-ts-stdio-backend.sh");
    expect(script).toContain("check-no-ts-stdio-backend");
    expect(script).toContain("resolve_rust_bin");
    expect(script).toContain("stdio_transport.rs");
    expect(script).toContain("stdio_transport::serve_stdio");
    expect(script).toContain("transport/stdio-rust-rmcp");
    expect(script).toContain("ts_deleted");
    expect(script).toContain("use_ts_transport");
    expect(existsSync(path.join(repoRoot, "test/parity.test.ts"))).toBe(true);
  });

  it("npm bin defaults stdio to Rust rmcp without TS opt-in", () => {
    const bin = readText("bin/sylphx-consultant-mcp");
    const rustMain = readText("crates/consultant-mcp-server/src/main.rs");
    const tsEntry = readText("src/index.ts");

    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("resolve_transport");
    expect(bin).toContain('printf \'%s\\n\' "stdio"');
    expect(bin).not.toContain("use_ts_transport");
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);
    expect(rustMain).toContain("stdio_transport::serve_stdio");
    expect(
      existsSync(path.join(repoRoot, "crates/consultant-mcp-server/src/stdio_transport.rs"))
    ).toBe(true);
    expect(tsEntry).not.toMatch(/StdioServerTransport|McpServer/);
  });

  it("migration ledger marks stdio-rust-rmcp and adapter ts_deleted", () => {
    const ledger = JSON.parse(readText("docs/specs/consultant-mcp-migration-ledger.json")) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const stdioRust = ledger.capabilities.find((c) => c.id === "transport/stdio-rust-rmcp");
    const tsAdapter = ledger.capabilities.find((c) => c.id === "transport/stdio-ts-adapter");
    expect(stdioRust?.state).toBe("ts_deleted");
    expect(tsAdapter?.state).toBe("ts_deleted");
  });

  it("parity harness proves four-tool golden mock baseline", () => {
    const parity = readText("test/parity.test.ts");
    expect(parity).toContain("parity golden fixtures");
    expect(parity).toContain("consultant.review_decision");
    expect(parity).toContain("consultant.research");
    expect(parity).toContain("consultant.challenge_answer");
    expect(parity).toContain("consultant.compare_options");
  });
});