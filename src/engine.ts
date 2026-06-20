import crypto from "node:crypto";
import type { ConsultationRequest, ConsultationResult, ConsultantConfig, ModelClient, PanelModelResult, Verdict } from "./types.js";
import { applyPolicy } from "./policy.js";
import { judgePrompt, panelPrompt } from "./prompts.js";

interface JudgeJson {
  verdict?: Verdict;
  confidence?: number;
  executiveSummary?: string;
  consensus?: string[];
  disagreements?: string[];
  blindSpots?: string[];
  recommendedChanges?: Array<{ priority?: "must" | "should" | "could"; change?: string; rationale?: string }>;
  evidenceGaps?: string[];
  followUpQuestions?: string[];
  citations?: Array<{ title?: string; url?: string; quote?: string }>;
}

function extractJson(text: string): JudgeJson {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as JudgeJson;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1)) as JudgeJson;
    throw new Error("judge_output_not_json");
  }
}

function sanitizeJudge(json: JudgeJson): Omit<ConsultationResult, "consultationId" | "kind" | "status" | "panel" | "policy" | "providerTrace"> {
  return {
    verdict: json.verdict ?? "needs_more_evidence",
    confidence: typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : 0.5,
    executiveSummary: json.executiveSummary ?? "Judge returned no executive summary.",
    consensus: json.consensus ?? [],
    disagreements: json.disagreements ?? [],
    blindSpots: json.blindSpots ?? [],
    recommendedChanges: (json.recommendedChanges ?? []).map((item) => ({
      priority: item.priority ?? "should",
      change: item.change ?? "Unspecified change",
      rationale: item.rationale ?? "No rationale supplied"
    })),
    evidenceGaps: json.evidenceGaps ?? [],
    followUpQuestions: json.followUpQuestions ?? [],
    citations: (json.citations ?? []).map((item) => ({
      title: item.title ?? "Untitled source",
      url: item.url,
      quote: item.quote
    }))
  };
}

async function callPanel(modelClient: ModelClient, model: string, request: ConsultationRequest, config: ConsultantConfig): Promise<PanelModelResult> {
  const started = Date.now();
  try {
    const response = await modelClient.complete({
      model,
      messages: [
        { role: "system", content: "You are an independent expert reviewer in a model panel." },
        { role: "user", content: panelPrompt(request) }
      ],
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      temperature: 0.2
    });
    return { model: response.model, role: "panelist", ok: true, content: response.content, latencyMs: response.latencyMs };
  } catch (error) {
    return { model, role: "panelist", ok: false, content: "", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runConsultation(request: ConsultationRequest, modelClient: ModelClient, config: ConsultantConfig): Promise<ConsultationResult> {
  const started = Date.now();
  const policy = applyPolicy(request, config);
  const consultationId = `consult_${policy.requestHash}_${crypto.randomUUID().slice(0, 8)}`;

  if (!policy.allowed) {
    return {
      consultationId,
      kind: request.kind,
      status: "blocked",
      verdict: "needs_more_evidence",
      confidence: 0,
      executiveSummary: `Consultation blocked by policy: ${policy.reason}`,
      consensus: [],
      disagreements: [],
      blindSpots: [],
      recommendedChanges: [],
      evidenceGaps: [policy.reason ?? "policy_blocked"],
      followUpQuestions: ["Adjust privacy/budget policy or request approval before retrying."],
      citations: [],
      panel: [],
      policy: {
        privacyClass: policy.privacyClass,
        redactionApplied: policy.redactionApplied,
        budgetStatus: policy.budgetStatus,
        estimatedCostUsd: policy.estimatedCostUsd
      },
      providerTrace: { provider: config.providerName, models: [], judgeModel: config.judgeModel, latencyMs: Date.now() - started }
    };
  }

  const panel = await Promise.all(config.panelModels.map((model) => callPanel(modelClient, model, policy.redactedRequest, config)));
  const successful = panel.filter((item) => item.ok && item.content.trim());

  if (successful.length === 0) {
    return {
      consultationId,
      kind: request.kind,
      status: "failed",
      verdict: "needs_more_evidence",
      confidence: 0,
      executiveSummary: "All panel model calls failed; no judge synthesis was attempted.",
      consensus: [],
      disagreements: [],
      blindSpots: [],
      recommendedChanges: [],
      evidenceGaps: panel.map((item) => item.error ?? `${item.model} failed`),
      followUpQuestions: ["Check provider credentials, model allowlist, and network access."],
      citations: [],
      panel,
      policy: {
        privacyClass: policy.privacyClass,
        redactionApplied: policy.redactionApplied,
        budgetStatus: policy.budgetStatus,
        estimatedCostUsd: policy.estimatedCostUsd
      },
      providerTrace: { provider: config.providerName, models: config.panelModels, judgeModel: config.judgeModel, latencyMs: Date.now() - started }
    };
  }

  const judgeStarted = Date.now();
  let judgePanelResult: PanelModelResult;
  let judged: ReturnType<typeof sanitizeJudge>;
  try {
    const judge = await modelClient.complete({
      model: config.judgeModel,
      messages: [
        { role: "system", content: "You are a strict JSON-only judge synthesizer for a model consultation panel." },
        { role: "user", content: judgePrompt(request.kind, policy.redactedRequest, successful.map((item) => item.content)) }
      ],
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      temperature: 0.1
    });
    judgePanelResult = { model: judge.model, role: "judge", ok: true, content: judge.content, latencyMs: judge.latencyMs };
    judged = sanitizeJudge(extractJson(judge.content));
  } catch (error) {
    judgePanelResult = { model: config.judgeModel, role: "judge", ok: false, content: "", latencyMs: Date.now() - judgeStarted, error: error instanceof Error ? error.message : String(error) };
    judged = sanitizeJudge({
      verdict: "needs_more_evidence",
      confidence: 0.45,
      executiveSummary: "Judge synthesis failed; returning panel-only fallback.",
      consensus: successful.slice(0, 3).map((item) => item.content.slice(0, 300)),
      evidenceGaps: [judgePanelResult.error ?? "judge_failed"],
      followUpQuestions: ["Retry judge synthesis or inspect panel outputs manually."]
    });
  }

  return {
    consultationId,
    kind: request.kind,
    status: "completed",
    ...judged,
    panel: [...panel, judgePanelResult],
    policy: {
      privacyClass: policy.privacyClass,
      redactionApplied: policy.redactionApplied,
      budgetStatus: policy.budgetStatus,
      estimatedCostUsd: policy.estimatedCostUsd
    },
    providerTrace: {
      provider: config.providerName,
      models: config.panelModels,
      judgeModel: config.judgeModel,
      latencyMs: Date.now() - started
    }
  };
}
