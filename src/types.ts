export type ConsultationKind =
  | "review_decision"
  | "research"
  | "challenge_answer"
  | "compare_options";

export type PrivacyClass = "public" | "internal" | "confidential";

export type Verdict =
  | "strong_accept"
  | "accept_with_changes"
  | "needs_more_evidence"
  | "reject";

export interface BudgetPolicy {
  maxUsd?: number;
  maxLatencyMs?: number;
  requireApprovalOverUsd?: number;
}

export interface EvidenceRef {
  type: "doc" | "repo" | "runtime" | "benchmark" | "user_requirement" | "source";
  ref?: string;
  summary: string;
}

export interface ConsultationRequestBase {
  title?: string;
  context: string;
  constraints?: string[];
  privacyClass?: PrivacyClass;
  budget?: BudgetPolicy;
  outputMode?: "concise" | "full_report";
  currentEvidence?: EvidenceRef[];
}

export interface ReviewDecisionRequest extends ConsultationRequestBase {
  kind: "review_decision";
  decision: string;
  options?: Array<{ name: string; description?: string; pros?: string[]; cons?: string[] }>;
  reviewFocus?: Array<
    | "correctness"
    | "security"
    | "scalability"
    | "maintainability"
    | "cost"
    | "industry_best_practice"
    | "blind_spots"
  >;
}

export interface ResearchRequest extends ConsultationRequestBase {
  kind: "research";
  question: string;
  scope?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
  freshness?: "timeless" | "recent" | "latest";
  citationRequired?: boolean;
}

export interface ChallengeAnswerRequest extends ConsultationRequestBase {
  kind: "challenge_answer";
  task: string;
  proposedAnswer: string;
  knownFacts?: string[];
  challengeMode?: "red_team" | "skeptical_reviewer" | "production_readiness";
}

export interface CompareOptionsRequest extends ConsultationRequestBase {
  kind: "compare_options";
  problem: string;
  options: Array<{ name: string; description: string }>;
  decisionCriteria?: Array<{ name: string; weight: number }>;
}

export type ConsultationRequest =
  | ReviewDecisionRequest
  | ResearchRequest
  | ChallengeAnswerRequest
  | CompareOptionsRequest;

export interface PanelModelResult {
  model: string;
  role: "panelist" | "judge";
  ok: boolean;
  content: string;
  latencyMs: number;
  error?: string;
}

export interface ConsultationResult {
  consultationId: string;
  kind: ConsultationKind;
  status: "completed" | "blocked" | "failed";
  verdict: Verdict;
  confidence: number;
  executiveSummary: string;
  consensus: string[];
  disagreements: string[];
  blindSpots: string[];
  recommendedChanges: Array<{ priority: "must" | "should" | "could"; change: string; rationale: string }>;
  evidenceGaps: string[];
  followUpQuestions: string[];
  citations: Array<{ title: string; url?: string; quote?: string }>;
  panel: PanelModelResult[];
  policy: {
    privacyClass: PrivacyClass;
    redactionApplied: boolean;
    budgetStatus: "ok" | "requires_approval" | "blocked";
    estimatedCostUsd: number;
  };
  providerTrace: {
    provider: string;
    models: string[];
    judgeModel: string;
    latencyMs: number;
  };
}

export interface ModelClient {
  complete(input: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{ model: string; content: string; latencyMs: number }>;
}

export interface ConsultantConfig {
  providerName: string;
  panelModels: string[];
  judgeModel: string;
  timeoutMs: number;
  maxOutputTokens: number;
  defaultMaxUsd: number;
  allowConfidentialExternal: boolean;
  mock: boolean;
}
