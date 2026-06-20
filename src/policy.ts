import crypto from "node:crypto";
import type { ConsultationRequest, ConsultantConfig, PrivacyClass } from "./types.js";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_STYLE_KEY]"],
  [/sk-or-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENROUTER_KEY]"],
  [/ghp_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_PAT]"],
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_ACCESS_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/(password|passwd|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED_SECRET_VALUE]"]
];

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  privacyClass: PrivacyClass;
  redactedRequest: ConsultationRequest;
  redactionApplied: boolean;
  estimatedCostUsd: number;
  budgetStatus: "ok" | "requires_approval" | "blocked";
  requestHash: string;
}

function redactValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    let output = value;
    for (const [pattern, replacement] of SECRET_PATTERNS) output = output.replace(pattern, replacement);
    return { value: output, changed: output !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = redactValue(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: items, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const result = redactValue(item);
      changed ||= result.changed;
      return [key, result.value] as const;
    });
    return { value: Object.fromEntries(entries), changed };
  }
  return { value, changed: false };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + stableJson(obj[key])).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function applyPolicy(request: ConsultationRequest, config: ConsultantConfig): PolicyDecision {
  const privacyClass = request.privacyClass ?? "internal";
  const redacted = redactValue(request);
  const redactedRequest = redacted.value as ConsultationRequest;
  const modelCount = Math.max(1, config.panelModels.length) + 1;
  const estimatedCostUsd = Math.round(modelCount * 0.25 * 100) / 100;
  const maxUsd = request.budget?.maxUsd ?? config.defaultMaxUsd;
  const requireApprovalOverUsd = request.budget?.requireApprovalOverUsd;

  if (privacyClass === "confidential" && !config.allowConfidentialExternal && !config.mock) {
    return {
      allowed: false,
      reason: "confidential_external_provider_blocked",
      privacyClass,
      redactedRequest,
      redactionApplied: redacted.changed,
      estimatedCostUsd,
      budgetStatus: "blocked",
      requestHash: hashRequest(redactedRequest)
    };
  }

  if (estimatedCostUsd > maxUsd) {
    return {
      allowed: false,
      reason: "estimated_cost_exceeds_max_usd",
      privacyClass,
      redactedRequest,
      redactionApplied: redacted.changed,
      estimatedCostUsd,
      budgetStatus: "blocked",
      requestHash: hashRequest(redactedRequest)
    };
  }

  if (requireApprovalOverUsd !== undefined && estimatedCostUsd > requireApprovalOverUsd) {
    return {
      allowed: false,
      reason: "estimated_cost_requires_approval",
      privacyClass,
      redactedRequest,
      redactionApplied: redacted.changed,
      estimatedCostUsd,
      budgetStatus: "requires_approval",
      requestHash: hashRequest(redactedRequest)
    };
  }

  return {
    allowed: true,
    privacyClass,
    redactedRequest,
    redactionApplied: redacted.changed,
    estimatedCostUsd,
    budgetStatus: "ok",
    requestHash: hashRequest(redactedRequest)
  };
}

export function hashRequest(request: ConsultationRequest): string {
  return crypto.createHash("sha256").update(stableJson(request)).digest("hex").slice(0, 24);
}
