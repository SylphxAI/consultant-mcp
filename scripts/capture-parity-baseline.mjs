#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runConsultation } from "../dist/engine.js";
import { hashRequest } from "../dist/policy.js";
import { MockModelClient } from "../dist/providers/openrouter.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parityDir = path.join(repoRoot, "test/fixtures/parity");
const goldenDir = path.join(repoRoot, "test/fixtures/golden");

function normalizeResult(result) {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

function expectedWithRequestHash(expected, request) {
  return {
    ...expected,
    consultationId: `consult_${hashRequest(request)}_NORMALIZED`
  };
}

const parityRequests = JSON.parse(readFileSync(path.join(parityDir, "requests.json"), "utf8"));
const parityConfig = JSON.parse(readFileSync(path.join(parityDir, "config.json"), "utf8"));

const captureMatrix = [
  { requestKey: "review_decision", fixture: "review_decision_mock.json" },
  { requestKey: "research", fixture: "research_mock.json" },
  { requestKey: "challenge_answer", fixture: "challenge_answer_mock.json" },
  { requestKey: "compare_options", fixture: "compare_options_mock.json" }
];

mkdirSync(goldenDir, { recursive: true });

for (const { requestKey, fixture } of captureMatrix) {
  const request = parityRequests[requestKey];
  const result = expectedWithRequestHash(
    normalizeResult(await runConsultation(request, new MockModelClient(), parityConfig)),
    request
  );
  const fixturePath = path.join(goldenDir, fixture);
  writeFileSync(fixturePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`[capture-parity-baseline] wrote ${fixturePath}`);
}