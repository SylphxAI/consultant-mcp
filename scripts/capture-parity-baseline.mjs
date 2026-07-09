#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runConsultation } from "../dist/engine.js";
import { MockModelClient } from "../dist/providers/openrouter.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeResult(result) {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

const request = {
  kind: "review_decision",
  decision: "Expose typed Consultant MCP tools backed by a shared deliberation engine.",
  context: "Agents need high-quality design review without leaking secrets or spending unbounded budget.",
  privacyClass: "internal",
  constraints: ["Beta 0.x", "MCP compatible", "typed output"]
};

const config = {
  providerName: "mock",
  panelModels: ["mock-a", "mock-b"],
  judgeModel: "mock-judge",
  timeoutMs: 1_000,
  maxOutputTokens: 1_000,
  defaultMaxUsd: 10,
  allowConfidentialExternal: false,
  mock: true
};

const result = normalizeResult(await runConsultation(request, new MockModelClient(), config));
const fixtureDir = path.join(repoRoot, "test/fixtures/golden");
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = path.join(fixtureDir, "review_decision_mock.json");
writeFileSync(fixturePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`[capture-parity-baseline] wrote ${fixturePath}`);