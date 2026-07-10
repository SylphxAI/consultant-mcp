import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runConsultation } from "../src/engine.js";
import { hashRequest } from "../src/policy.js";
import { MockModelClient } from "../src/providers/openrouter.js";
import type { ConsultationRequest, ConsultationResult, ConsultantConfig } from "../src/types.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const goldenDir = path.join(fixturesDir, "golden");
const parityDir = path.join(fixturesDir, "parity");

const parityRequests = JSON.parse(
  readFileSync(path.join(parityDir, "requests.json"), "utf8")
) as Record<string, ConsultationRequest>;

const parityConfig = JSON.parse(
  readFileSync(path.join(parityDir, "config.json"), "utf8")
) as ConsultantConfig;

const parityMatrix = [
  { tool: "consultant.review_decision", requestKey: "review_decision", fixture: "review_decision_mock.json" },
  { tool: "consultant.research", requestKey: "research", fixture: "research_mock.json" },
  { tool: "consultant.challenge_answer", requestKey: "challenge_answer", fixture: "challenge_answer_mock.json" },
  { tool: "consultant.compare_options", requestKey: "compare_options", fixture: "compare_options_mock.json" }
] as const;

function normalizeResult(result: ConsultationResult): ConsultationResult {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

function expectedWithRequestHash(
  expected: ConsultationResult,
  request: ConsultationRequest
): ConsultationResult {
  return {
    ...expected,
    consultationId: `consult_${hashRequest(request)}_NORMALIZED`
  };
}

describe("parity golden fixtures", () => {
  for (const { tool, requestKey, fixture } of parityMatrix) {
    it(`TS mock ${tool} matches captured golden baseline`, async () => {
      const request = parityRequests[requestKey];
      const expected = expectedWithRequestHash(
        JSON.parse(readFileSync(path.join(goldenDir, fixture), "utf8")) as ConsultationResult,
        request
      );
      const actual = normalizeResult(
        await runConsultation(request, new MockModelClient(), parityConfig)
      );
      expect(actual).toEqual(expected);
    });
  }
});