import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runConsultation } from "../src/engine.js";
import { MockModelClient } from "../src/providers/openrouter.js";
import type { ConsultationResult, ConsultantConfig, ReviewDecisionRequest } from "../src/types.js";

const fixturePath = path.join(
  import.meta.dirname,
  "fixtures/golden/review_decision_mock.json"
);

function normalizeResult(result: ConsultationResult): ConsultationResult {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

const request: ReviewDecisionRequest = {
  kind: "review_decision",
  decision: "Expose typed Consultant MCP tools backed by a shared deliberation engine.",
  context: "Agents need high-quality design review without leaking secrets or spending unbounded budget.",
  privacyClass: "internal",
  constraints: ["Beta 0.x", "MCP compatible", "typed output"]
};

const config: ConsultantConfig = {
  providerName: "mock",
  panelModels: ["mock-a", "mock-b"],
  judgeModel: "mock-judge",
  timeoutMs: 1_000,
  maxOutputTokens: 1_000,
  defaultMaxUsd: 10,
  allowConfidentialExternal: false,
  mock: true
};

describe("parity golden fixtures", () => {
  it("TS mock review_decision matches captured golden baseline", async () => {
    const expected = JSON.parse(readFileSync(fixturePath, "utf8"));
    const actual = normalizeResult(
      await runConsultation(request, new MockModelClient(), config)
    );
    expect(actual).toEqual(expected);
  });
});