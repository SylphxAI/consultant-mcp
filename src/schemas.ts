import * as z from "zod/v4";
import type { ChallengeAnswerRequest, CompareOptionsRequest, ResearchRequest, ReviewDecisionRequest } from "./types.js";

export const evidenceRefSchema = z.object({
  type: z.enum(["doc", "repo", "runtime", "benchmark", "user_requirement", "source"]),
  ref: z.string().optional(),
  summary: z.string().min(1)
});

export const commonInputShape = {
  title: z.string().optional(),
  context: z.string().min(1).describe("Relevant context. Keep minimal; do not include secrets."),
  constraints: z.array(z.string()).optional(),
  privacyClass: z.enum(["public", "internal", "confidential"]).default("internal"),
  budget: z.object({
    maxUsd: z.number().positive().optional(),
    maxLatencyMs: z.number().int().positive().optional(),
    requireApprovalOverUsd: z.number().positive().optional()
  }).optional(),
  outputMode: z.enum(["concise", "full_report"]).default("concise"),
  currentEvidence: z.array(evidenceRefSchema).optional()
};

export const reviewDecisionInputShape = {
  ...commonInputShape,
  decision: z.string().min(1),
  options: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional()
  })).optional(),
  reviewFocus: z.array(z.enum([
    "correctness",
    "security",
    "scalability",
    "maintainability",
    "cost",
    "industry_best_practice",
    "blind_spots"
  ])).optional()
};

export const researchInputShape = {
  ...commonInputShape,
  question: z.string().min(1),
  scope: z.string().optional(),
  mustInclude: z.array(z.string()).optional(),
  mustAvoid: z.array(z.string()).optional(),
  freshness: z.enum(["timeless", "recent", "latest"]).default("recent"),
  citationRequired: z.boolean().default(true)
};

export const challengeAnswerInputShape = {
  ...commonInputShape,
  task: z.string().min(1),
  proposedAnswer: z.string().min(1),
  knownFacts: z.array(z.string()).optional(),
  challengeMode: z.enum(["red_team", "skeptical_reviewer", "production_readiness"]).default("skeptical_reviewer")
};

export const compareOptionsInputShape = {
  ...commonInputShape,
  problem: z.string().min(1),
  options: z.array(z.object({ name: z.string().min(1), description: z.string().min(1) })).min(2),
  decisionCriteria: z.array(z.object({ name: z.string().min(1), weight: z.number().positive() })).optional()
};

export const consultationResultShape = {
  consultationId: z.string(),
  kind: z.enum(["review_decision", "research", "challenge_answer", "compare_options"]),
  status: z.enum(["completed", "blocked", "failed"]),
  verdict: z.enum(["strong_accept", "accept_with_changes", "needs_more_evidence", "reject"]),
  confidence: z.number().min(0).max(1),
  executiveSummary: z.string(),
  consensus: z.array(z.string()),
  disagreements: z.array(z.string()),
  blindSpots: z.array(z.string()),
  recommendedChanges: z.array(z.object({
    priority: z.enum(["must", "should", "could"]),
    change: z.string(),
    rationale: z.string()
  })),
  evidenceGaps: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  citations: z.array(z.object({ title: z.string(), url: z.string().optional(), quote: z.string().optional() })),
  panel: z.array(z.object({
    model: z.string(),
    role: z.enum(["panelist", "judge"]),
    ok: z.boolean(),
    content: z.string(),
    latencyMs: z.number(),
    error: z.string().optional()
  })),
  policy: z.object({
    privacyClass: z.enum(["public", "internal", "confidential"]),
    redactionApplied: z.boolean(),
    budgetStatus: z.enum(["ok", "requires_approval", "blocked"]),
    estimatedCostUsd: z.number()
  }),
  providerTrace: z.object({
    provider: z.string(),
    models: z.array(z.string()),
    judgeModel: z.string(),
    latencyMs: z.number()
  })
};

export function asReviewDecisionRequest(input: z.infer<z.ZodObject<typeof reviewDecisionInputShape>>): ReviewDecisionRequest {
  return { kind: "review_decision", ...input };
}

export function asResearchRequest(input: z.infer<z.ZodObject<typeof researchInputShape>>): ResearchRequest {
  return { kind: "research", ...input };
}

export function asChallengeAnswerRequest(input: z.infer<z.ZodObject<typeof challengeAnswerInputShape>>): ChallengeAnswerRequest {
  return { kind: "challenge_answer", ...input };
}

export function asCompareOptionsRequest(input: z.infer<z.ZodObject<typeof compareOptionsInputShape>>): CompareOptionsRequest {
  return { kind: "compare_options", ...input };
}
