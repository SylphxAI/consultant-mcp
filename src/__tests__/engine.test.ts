import { describe, expect, it } from "vitest";
import { runConsultation } from "../engine.js";
import { MockModelClient } from "../providers/openrouter.js";
import type { ConsultantConfig, ReviewDecisionRequest } from "../types.js";

const baseConfig: ConsultantConfig = {
  providerName: "mock",
  panelModels: ["mock-a", "mock-b"],
  judgeModel: "mock-judge",
  timeoutMs: 1_000,
  maxOutputTokens: 1_000,
  defaultMaxUsd: 10,
  allowConfidentialExternal: false,
  mock: true
};

const request: ReviewDecisionRequest = {
  kind: "review_decision",
  decision: "Expose typed Consultant MCP tools backed by a shared deliberation engine.",
  context: "Agents need high-quality design review without leaking secrets or spending unbounded budget.",
  privacyClass: "internal",
  constraints: ["Beta 0.x", "MCP compatible", "typed output"]
};

describe("runConsultation", () => {
  it("fans out to panel models and synthesizes a structured judge result", async () => {
    const result = await runConsultation(request, new MockModelClient(), baseConfig);

    expect(result.status).toBe("completed");
    expect(result.kind).toBe("review_decision");
    expect(result.verdict).toBe("accept_with_changes");
    expect(result.panel).toHaveLength(3);
    expect(result.policy.budgetStatus).toBe("ok");
    expect(result.consensus).toContain("Use typed intent tools");
  });

  it("blocks confidential requests unless explicitly allowed", async () => {
    const result = await runConsultation(
      { ...request, privacyClass: "confidential" },
      new MockModelClient(),
      { ...baseConfig, mock: false, allowConfidentialExternal: false }
    );

    expect(result.status).toBe("blocked");
    expect(result.policy.budgetStatus).toBe("blocked");
    expect(result.evidenceGaps).toContain("confidential_external_provider_blocked");
  });

  it("redacts secret-like values before model calls", async () => {
    const result = await runConsultation(
      { ...request, context: "Use api_key=dummy_secret_value before calling provider" },
      new MockModelClient(),
      baseConfig
    );

    expect(result.policy.redactionApplied).toBe(true);
  });
});
