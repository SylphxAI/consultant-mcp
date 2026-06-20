import type { ConsultantConfig } from "./types.js";

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(",").map((item: string) => item.trim()).filter(Boolean);
}

export function loadConfig(): ConsultantConfig {
  return {
    providerName: process.env.CONSULTANT_PROVIDER ?? "openrouter-compatible",
    panelModels: listEnv("CONSULTANT_PANEL_MODELS", [
      "openai/gpt-4.1",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro"
    ]),
    judgeModel: process.env.CONSULTANT_JUDGE_MODEL ?? "openrouter/fusion",
    timeoutMs: numberEnv("CONSULTANT_TIMEOUT_MS", 120_000),
    maxOutputTokens: numberEnv("CONSULTANT_MAX_OUTPUT_TOKENS", 2_000),
    defaultMaxUsd: numberEnv("CONSULTANT_DEFAULT_MAX_USD", 2),
    allowConfidentialExternal: boolEnv("CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL", false),
    mock: boolEnv("CONSULTANT_MOCK", false)
  };
}
