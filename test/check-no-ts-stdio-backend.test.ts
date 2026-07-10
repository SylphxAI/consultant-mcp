import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("MCP stdio Rust impl gate (S5 rej-010)", () => {
  it("check-no-ts-stdio-backend gate script exists and enforces rust_impl stdio", () => {
    const script = readText("scripts/check-no-ts-stdio-backend.sh");

    expect(script).toContain("check-no-ts-stdio-backend");
    expect(script).toContain("resolve_rust_bin");
    expect(script).toContain("stdio_transport.rs");
    expect(script).toContain("stdio_transport::serve_stdio");
    expect(script).toContain("transport/stdio-rust-rmcp");
    expect(script).toContain("rust_impl");
    expect(script).toContain("transport/stdio-ts-adapter");
    expect(script).toContain("ts_deleted");
    expect(existsSync(path.join(repoRoot, "test/parity.test.ts"))).toBe(true);
  });

  it("npm bin routes default stdio to Rust rmcp without TS stdio adapter", () => {
    const bin = readText("bin/sylphx-consultant-mcp");
    const rustMain = readText("crates/consultant-mcp-server/src/main.rs");
    const tsEntry = readText("src/index.ts");

    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("resolve_transport");
    expect(bin).toContain('printf \'%s\\n\' "stdio"');
    expect(bin).not.toContain("use_ts_transport");
    expect(bin).not.toMatch(/exec node/i);
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "dist/server.js"))).toBe(false);
    expect(rustMain).toContain("stdio_transport::serve_stdio");
    expect(existsSync(path.join(repoRoot, "crates/consultant-mcp-server/src/stdio_transport.rs"))).toBe(true);
    expect(tsEntry).not.toMatch(/StdioServerTransport|McpServer/);
  });

  it("migration ledger marks transport/stdio-rust-rmcp as rust_impl (authority_rust deferred)", () => {
    const ledger = JSON.parse(
      readText("docs/specs/consultant-mcp-migration-ledger.json")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
      slices: Record<string, { status: string }>;
    };

    const stdioRust = ledger.capabilities.find(
      (capability) => capability.id === "transport/stdio-rust-rmcp"
    );
    const tsAdapter = ledger.capabilities.find(
      (capability) => capability.id === "transport/stdio-ts-adapter"
    );
    expect(stdioRust?.state).toBe("rust_impl");
    expect(tsAdapter?.state).toBe("ts_deleted");
    expect(ledger.slices.S5?.status).toBe("in_progress");
  });

  it("parity harness proves four-tool golden mock baseline for stdio rust_impl", () => {
    const parity = readText("test/parity.test.ts");

    expect(parity).toContain("parity golden fixtures");
    expect(parity).toContain("consultant.review_decision");
    expect(parity).toContain("consultant.research");
    expect(parity).toContain("consultant.challenge_answer");
    expect(parity).toContain("consultant.compare_options");
  });
});