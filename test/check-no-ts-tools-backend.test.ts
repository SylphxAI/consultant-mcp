import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const TOOL_IDS = [
  "tool/consultant.review_decision",
  "tool/consultant.research",
  "tool/consultant.challenge_answer",
  "tool/consultant.compare_options"
] as const;

describe("Consultant MCP tool Rust authority gate", () => {
  it("check-no-ts-tools-backend gate script exists and enforces Rust tool authority", () => {
    const script = readText("scripts/check-no-ts-tools-backend.sh");

    expect(script).toContain("check-no-ts-tools-backend");
    expect(script).toContain("run_consultation");
    expect(script).toContain("consult_tool");
    expect(script).toContain("tool/consultant.review_decision");
    expect(script).toContain("tool/consultant.compare_options");
    expect(script).toContain("authority_rust");
    expect(script).toContain("rust_impl");
    expect(script).toContain("transport/stdio-rust-rmcp");
    expect(existsSync(path.join(repoRoot, "test/integration/http-transport.test.ts"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "test/parity.test.ts"))).toBe(true);
  });

  it("Rust rmcp server registers four tools through consultant-core", () => {
    const rustLib = readText("crates/consultant-mcp-server/src/lib.rs");
    const rustTools = readText("crates/consultant-mcp-server/src/tools.rs");
    const rustCore = readText("crates/consultant-core/src/engine.rs");
    const bin = readText("bin/sylphx-consultant-mcp");

    expect(rustLib).toContain("consultant.review_decision");
    expect(rustLib).toContain("consultant.research");
    expect(rustLib).toContain("consultant.challenge_answer");
    expect(rustLib).toContain("consultant.compare_options");
    expect(rustLib).toContain("run_consultation");
    expect(rustTools).toContain("TOOL_REVIEW_DECISION");
    expect(rustTools).toContain("TOOL_COMPARE_OPTIONS");
    expect(rustCore).toContain("pub async fn run_consultation");
    expect(bin).toContain("resolve_rust_bin");
    expect(bin).not.toMatch(/exec node/i);
  });

  it("TS package surface does not retain MCP tool server handlers", () => {
    const tsEntry = readText("src/index.ts");

    expect(tsEntry).not.toMatch(/StdioServerTransport|McpServer|registerTool/);
    expect(existsSync(path.join(repoRoot, "src/server.ts"))).toBe(false);
  });

  it("migration ledger marks all four consultant tools as authority_rust", () => {
    const ledger = JSON.parse(
      readText("docs/specs/consultant-mcp-migration-ledger.json")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };

    for (const toolId of TOOL_IDS) {
      const tool = ledger.capabilities.find((capability) => capability.id === toolId);
      expect(tool?.state).toBe("authority_rust");
    }
  });

  it("parity harnesses prove four-tool golden mock baseline for tool authority", () => {
    const parity = readText("test/parity.test.ts");
    const integration = readText("test/integration/http-transport.test.ts");
    const rustCore = readText("crates/consultant-core/src/lib.rs");

    expect(parity).toContain("parity golden fixtures");
    expect(integration).toContain("parityMatrix");
    expect(rustCore).toContain("parity");
    for (const toolId of TOOL_IDS) {
      const toolName = toolId.replace("tool/", "");
      expect(parity).toContain(toolName);
      expect(integration).toContain(toolName);
    }
  });
});