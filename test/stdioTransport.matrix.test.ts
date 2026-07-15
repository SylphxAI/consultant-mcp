import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("MCP stdio transport routing (ts_deleted)", () => {
  it("bin wrapper routes exclusively to Rust rmcp stdio server", () => {
    const bin = readFileSync(path.join(repoRoot, "bin/sylphx-consultant-mcp"), "utf8");
    expect(bin).toContain("resolve_rust_bin");
    expect(bin).toContain("resolve_transport");
    expect(bin).toContain('printf \'%s\\n\' "stdio"');
    expect(bin).not.toContain("use_ts_transport");
    expect(bin).not.toContain("dist/server.js");
  });

  it("Rust MCP server exposes rmcp stdio transport module", () => {
    const mainRs = readFileSync(
      path.join(repoRoot, "crates/consultant-mcp-server/src/main.rs"),
      "utf8"
    );
    const stdioRs = readFileSync(
      path.join(repoRoot, "crates/consultant-mcp-server/src/stdio_transport.rs"),
      "utf8"
    );
    expect(mainRs).toContain("stdio_transport::serve_stdio");
    expect(mainRs).toContain("http_transport::transport_from_env");
    expect(stdioRs).toContain("transport::stdio");
  });

  it("migration ledger marks transport/stdio-rust-rmcp as ts_deleted", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };
    const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
    expect(stdioRust?.state).toBe("ts_deleted");
  });

  it("stdio ts_deleted gate script exists", () => {
    const script = readFileSync(
      path.join(repoRoot, "scripts/check-no-ts-stdio-backend.sh"),
      "utf8"
    );
    expect(script).toContain("ts_deleted");
    expect(script).toContain("stdio_transport.rs");
    expect(script).toContain("stdio_transport::serve_stdio");
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);
  });
});