#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { runConsultation } from "./engine.js";
import { MockModelClient, OpenRouterCompatibleClient } from "./providers/openrouter.js";
import {
  asChallengeAnswerRequest,
  asCompareOptionsRequest,
  asResearchRequest,
  asReviewDecisionRequest,
  challengeAnswerInputShape,
  compareOptionsInputShape,
  consultationResultShape,
  researchInputShape,
  reviewDecisionInputShape
} from "./schemas.js";
import type { ConsultationRequest, ConsultationResult, ModelClient } from "./types.js";

const config = loadConfig();
const modelClient: ModelClient = config.mock
  ? new MockModelClient()
  : new OpenRouterCompatibleClient(process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_FUSION_API_KEY);

export const server = new McpServer({
  name: "sylphx-consultant-mcp",
  version: "0.1.0-beta.0"
});

function textResult(result: ConsultationResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result as unknown as Record<string, unknown>
  };
}

async function consult(request: ConsultationRequest) {
  return textResult(await runConsultation(request, modelClient, config));
}

server.registerTool(
  "consultant.review_decision",
  {
    title: "Consultant Review Decision",
    description: "Review an ADR, architecture decision, or high-stakes design with a model panel and judge synthesis.",
    inputSchema: reviewDecisionInputShape,
    outputSchema: consultationResultShape
  },
  async (input) => consult(asReviewDecisionRequest(input))
);

server.registerTool(
  "consultant.research",
  {
    title: "Consultant Research",
    description: "Synthesize research for a question with explicit scope, freshness, citations, and evidence gaps.",
    inputSchema: researchInputShape,
    outputSchema: consultationResultShape
  },
  async (input) => consult(asResearchRequest(input))
);

server.registerTool(
  "consultant.challenge_answer",
  {
    title: "Consultant Challenge Answer",
    description: "Red-team or skeptically review a proposed answer before an agent ships it.",
    inputSchema: challengeAnswerInputShape,
    outputSchema: consultationResultShape
  },
  async (input) => consult(asChallengeAnswerRequest(input))
);

server.registerTool(
  "consultant.compare_options",
  {
    title: "Consultant Compare Options",
    description: "Compare two or more options against criteria and synthesize a recommendation.",
    inputSchema: compareOptionsInputShape,
    outputSchema: consultationResultShape
  },
  async (input) => consult(asCompareOptionsRequest(input))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("sylphx-consultant-mcp 0.1.0-beta.0 running on stdio");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
