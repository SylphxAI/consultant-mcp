import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("consultant-mcp differential harness (rej-010)", () => {
  it("ships fail-closed differential entrypoint and oracle artifacts", () => {
    expect(existsSync(path.join(repoRoot, "scripts/run-consultant-mcp-differential.sh"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "scripts/differential/consultant-mcp-oracle.ts"))).toBe(
      true
    );
    expect(
      existsSync(path.join(repoRoot, "scripts/differential/fixtures/consultant-mcp-corpus.json"))
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "crates/consultant-core/tests/consultant_mcp_differential.rs"))
    ).toBe(true);

    const harness = readFileSync(
      path.join(repoRoot, "scripts/run-consultant-mcp-differential.sh"),
      "utf8"
    );
    expect(harness).toContain("consultant-mcp-differential");
    expect(harness).toContain("consultant-mcp-oracle.ts");
    expect(harness).toContain("consultant_mcp_differential_matches_ts_oracle");
    expect(harness).toContain("differential_green");
    expect(harness).toContain("check-no-ts-stdio-backend.sh");
  });

  it("parity slice manifest binds stdio transport and four-tool domains", () => {
    const slice = JSON.parse(
      readFileSync(path.join(repoRoot, "docs/specs/consultant-mcp-parity-slice.json"), "utf8")
    ) as {
      slice: string;
      differentialHarness: string;
      domains: Array<{ id: string; differentialTest: boolean }>;
    };

    expect(slice.slice).toContain("transport.stdio");
    expect(slice.differentialHarness).toBe("scripts/run-consultant-mcp-differential.sh");
    expect(slice.domains.some((domain) => domain.id === "transport/stdio-rust-rmcp")).toBe(true);
    expect(slice.domains.some((domain) => domain.id === "tool/consultant.review_decision")).toBe(
      true
    );
  });

  it("corpus includes stdioProbe live transport cases for S5", () => {
    const corpus = JSON.parse(
      readFileSync(
        path.join(repoRoot, "scripts/differential/fixtures/consultant-mcp-corpus.json"),
        "utf8"
      )
    ) as {
      stdioProbeCases?: Array<{ id: string; kind: string }>;
    };

    expect(corpus.stdioProbeCases?.length).toBeGreaterThan(0);
    expect(corpus.stdioProbeCases?.some((probe) => probe.kind === "initialize")).toBe(true);
    expect(corpus.stdioProbeCases?.some((probe) => probe.kind === "toolsList")).toBe(true);
    expect(corpus.stdioProbeCases?.some((probe) => probe.kind === "toolCall")).toBe(true);
    const toolCallProbes =
      corpus.stdioProbeCases?.filter((probe) => probe.kind === "toolCall") ?? [];
    expect(toolCallProbes.length).toBeGreaterThanOrEqual(4);
  });

  it("corpus includes httpProbe live transport cases for S4 HTTP", () => {
    const corpus = JSON.parse(
      readFileSync(
        path.join(repoRoot, "scripts/differential/fixtures/consultant-mcp-corpus.json"),
        "utf8"
      )
    ) as {
      httpProbeCases?: Array<{ id: string; kind: string }>;
    };

    expect(corpus.httpProbeCases?.length).toBeGreaterThan(0);
    expect(corpus.httpProbeCases?.some((probe) => probe.kind === "health")).toBe(true);
    expect(corpus.httpProbeCases?.some((probe) => probe.kind === "initialize")).toBe(true);
    expect(corpus.httpProbeCases?.some((probe) => probe.kind === "toolsList")).toBe(true);
    expect(corpus.httpProbeCases?.some((probe) => probe.kind === "toolCall")).toBe(true);
  });
});