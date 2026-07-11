import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const TOOL_IDS = [
  "tool/consultant.review_decision",
  "tool/consultant.research",
  "tool/consultant.challenge_answer",
  "tool/consultant.compare_options"
] as const;

describe("consultant MCP tool authority routing", () => {
  it("Rust MCP server exposes four consultant tools via rmcp tool_router", () => {
    const rustLib = readFileSync(
      path.join(repoRoot, "crates/consultant-mcp-server/src/lib.rs"),
      "utf8"
    );
    expect(rustLib).toContain("tool_router");
    expect(rustLib).toContain("consult_tool");
    for (const toolId of TOOL_IDS) {
      expect(rustLib).toContain(toolId.replace("tool/", ""));
    }
  });

  it("migration ledger marks all four consultant tools as rust_impl (rej-010)", () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-migration-ledger.json"), "utf8")
    ) as {
      capabilities: Array<{ id: string; state: string }>;
    };

    for (const toolId of TOOL_IDS) {
      const tool = ledger.capabilities.find((cap) => cap.id === toolId);
      expect(tool?.state).toBe("rust_impl");
    }
  });

  it("tool authority gate script exists and defers authority_rust", () => {
    const script = readFileSync(
      path.join(repoRoot, "scripts/check-no-ts-tools-backend.sh"),
      "utf8"
    );
    expect(script).toContain("rust_impl");
    expect(script).toContain("rej-010");
    expect(script).toContain("consultant-core");
  });
});
