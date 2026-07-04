# ADR 0001: Consultant MCP Beta Tool Surface

- Status: Accepted for `0.1.0-beta.0`
- Date: 2026-06-19
- Owners: Sylphx agents / Consultant MCP maintainers

## Context

Sylphx agents need a reliable way to ask higher-grade models or model panels for critical review, research synthesis, and answer challenge. The initial debate was whether to expose one generic `consult(mode=...)` tool or multiple purpose-specific tools.

A Fusion review was run and stored in `.review/fusion-design-review.json`. Its recommendation was explicit: expose four named tools for beta, not a single generic mode tool, while sharing one internal deliberation engine.

## Decision

Expose exactly four MCP tools in beta:

1. `consultant.review_decision`
2. `consultant.research`
3. `consultant.challenge_answer`
4. `consultant.compare_options`

All four tools call the same internal pipeline:

```text
validate typed input
  -> privacy/budget/redaction policy
  -> panel fan-out
  -> judge synthesis
  -> structured result
```

OpenRouter Fusion is supported as a judge/provider route, but the core architecture owns the fan-out/judge orchestration. Fusion is an adapter option, not the product boundary.

## Why not one generic tool?

A generic `consult(mode=...)` tool hides important intent from the MCP host and makes schemas weak:

- `review_decision` needs decisions, options, focus areas, and evidence.
- `research` needs question, scope, freshness, and citation requirements.
- `challenge_answer` needs a proposed answer and challenge mode.
- `compare_options` needs at least two options and decision criteria.

For autonomous agents, tool names are routing signals. Separate tools make policy, evaluation, caching, observability, and downstream parsing cleaner.

## Consequences

Positive:

- Stronger typed contracts
- Easier policy enforcement per intent
- Better future cache keys and eval metrics
- Less prompt improvisation by agents
- Cleaner documentation and training signal

Trade-offs:

- Four visible tools instead of one
- Shared output schema may be broader than each exact use case
- Future additions require ADR / usage evidence

## Beta scope

Included:

- TypeScript MCP stdio server
- Four typed tools
- Shared engine
- OpenRouter-compatible provider
- Mock provider for tests
- Secret-like redaction
- Confidential data block by default
- Budget gate
- Structured output

Deferred:

- Hosted API / persistent ledger
- Async job queue
- Approval workflow
- Semantic cache
- UI/admin dashboard
- Provider quality feedback loop

## Acceptance criteria

- `npm run typecheck` passes
- `npm test` passes
- `npm run build` passes
- `npm pack --dry-run` includes dist/docs/ADR/report
- Confidential external request blocks by default
- Mock mode can run without provider credentials
