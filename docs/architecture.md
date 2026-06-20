# Consultant MCP Architecture

## Boundary

`@sylphx/consultant-mcp` is an MCP stdio server. It does not own durable workflow state; it answers consultation calls synchronously and returns structured results to the invoking MCP host/agent.

## Tool surface

The beta exposes four named tools because each intent has a different required input contract:

- `consultant.review_decision`: decision, options, review focus, evidence
- `consultant.research`: question, scope, freshness, citation requirement
- `consultant.challenge_answer`: proposed answer, task, known facts, challenge mode
- `consultant.compare_options`: problem, at least two options, weighted criteria

All tools share a common result schema so agents can consistently inspect `verdict`, `confidence`, `recommendedChanges`, `evidenceGaps`, `panel`, `policy`, and `providerTrace`.

## Runtime pipeline

1. MCP host calls a typed tool.
2. Zod validates tool input.
3. Policy redacts secret-like data, estimates budget, and blocks disallowed privacy/cost cases.
4. The engine fans out to configured panel models.
5. The engine calls a judge model to synthesize panel outputs.
6. If judge synthesis fails, the engine returns a panel-only fallback.
7. The MCP tool returns both text content and structured content.

## Provider abstraction

The `ModelClient` interface is intentionally small:

```ts
complete({ model, messages, maxTokens, temperature, timeoutMs }): Promise<{ model, content, latencyMs }>
```

This lets Sylphx replace OpenRouter with first-party providers, internal gateways, model ensembles, or test doubles without changing MCP contracts.

## Observability

Every result includes:

- `consultationId`: request hash plus random suffix
- `panel`: per-model success/failure, role, content, latency, optional error
- `policy`: privacy class, redaction flag, budget status, estimated cost
- `providerTrace`: provider name, panel models, judge model, total latency

Beta keeps observability in-band. A future hosted service should persist these records into an append-only ledger.
