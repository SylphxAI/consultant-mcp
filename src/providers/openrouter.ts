import type { ModelClient } from "../types.js";

export class OpenRouterCompatibleClient implements ModelClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    private readonly referer = process.env.OPENROUTER_HTTP_REFERER ?? "https://sylphx.ai",
    private readonly title = process.env.OPENROUTER_X_TITLE ?? "Sylphx Consultant MCP"
  ) {}

  async complete(input: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{ model: string; content: string; latencyMs: number }> {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required unless CONSULTANT_MOCK=true");
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 120_000);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.referer,
          "X-Title": this.title
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          max_tokens: input.maxTokens ?? 2000,
          temperature: input.temperature ?? 0.2
        })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter request failed ${response.status}: ${body.slice(0, 1000)}`);
      }
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
      return {
        model: json.model ?? input.model,
        content: json.choices?.[0]?.message?.content ?? "",
        latencyMs: Date.now() - started
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MockModelClient implements ModelClient {
  async complete(input: { model: string; messages: Array<{ role: "system" | "user" | "assistant"; content: string }> }): Promise<{ model: string; content: string; latencyMs: number }> {
    const last = input.messages.at(-1)?.content ?? "";
    if (last.includes("Return JSON only")) {
      return {
        model: input.model,
        latencyMs: 1,
        content: JSON.stringify({
          verdict: "accept_with_changes",
          confidence: 0.78,
          executiveSummary: "Mock judge: design is viable for beta if policy, schemas, and observability stay explicit.",
          consensus: ["Use typed intent tools", "Keep a shared fan-out/judge engine", "Treat external providers as adapters"],
          disagreements: ["How many tools to expose after beta should be usage-driven"],
          blindSpots: ["Persistent ledger is intentionally deferred from in-package beta"],
          recommendedChanges: [{ priority: "must", change: "Keep privacy and budget gates before provider calls", rationale: "Prevents uncontrolled data/cost exposure" }],
          evidenceGaps: ["Run against real providers in staging"],
          followUpQuestions: ["Which repository and npm registry should own the package?"],
          citations: []
        })
      };
    }
    return {
      model: input.model,
      latencyMs: 1,
      content: `Mock panel for ${input.model}: typed Consultant MCP is appropriate; enforce budget/privacy and synthesize with a judge.`
    };
  }
}
