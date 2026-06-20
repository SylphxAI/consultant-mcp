# Consultant MCP Beta 0.x Report

Package: `@sylphx/consultant-mcp`  
Version: `0.1.0-beta.0`  
Status: publishable beta artifact

## Executive summary

This beta implements a typed Model Context Protocol (MCP) server that lets agents consult a higher-grade deliberation panel for high-stakes reasoning work. It exposes four purpose-built tools backed by one shared engine:

1. `consultant.review_decision` — ADR / architecture / decision review
2. `consultant.research` — scoped research synthesis
3. `consultant.challenge_answer` — skeptical review of a proposed answer
4. `consultant.compare_options` — option comparison and recommendation

The package is intentionally production-shaped but small: TypeScript, MCP stdio, OpenRouter-compatible provider adapter, deterministic mock provider, policy gates, redaction, structured output, tests, ADR, and documentation.

## Why this shape

The initial design question was whether to expose one generic `consult(mode=...)` tool or several typed tools. A Fusion/SOTA design review was run and stored at `.review/fusion-design-review.json`; its recommendation was to use four named tools while keeping orchestration shared internally.

The accepted architecture treats tool names as stable agent-facing contracts, while provider prompting and model selection remain replaceable implementation details. This keeps validation, privacy policy, budgets, observability, caching keys, and future evaluation clear.

## Architecture

```text
MCP client / Sylphx agent
  -> one of four typed tools
  -> zod input validation
  -> policy gate: privacy, budget, redaction
  -> panel fan-out through ModelClient adapter
  -> judge synthesis
  -> structured ConsultationResult
```

### Components

- `src/server.ts` registers the four MCP tools.
- `src/schemas.ts` owns tool input/output schemas.
- `src/engine.ts` owns fan-out, judge synthesis, failure fallback, and result assembly.
- `src/policy.ts` owns secret-like redaction, privacy blocking, cost estimate, and request hashing.
- `src/providers/openrouter.ts` owns the OpenRouter-compatible adapter and mock model client.
- `src/prompts.ts` owns panel and judge prompt templates.
- `src/types.ts` owns the shared TypeScript contract.

## Security and policy

Beta defaults are intentionally conservative:

- `privacyClass` defaults to `internal`.
- `confidential` requests are blocked from external providers unless `CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL=true`.
- Secret-like patterns are redacted before provider calls.
- A request-level or service-level max USD budget can block expensive consultations.
- Output is structured for downstream parsing rather than freeform hidden state.

## Provider strategy

OpenRouter Fusion is supported as a judge/provider route, not as the product boundary. The core capability is Sylphx-owned fan-out and judge orchestration through a `ModelClient` interface.

Environment variables:

- `OPENROUTER_API_KEY` or `OPENROUTER_FUSION_API_KEY`
- `OPENROUTER_BASE_URL` (optional)
- `CONSULTANT_PANEL_MODELS`
- `CONSULTANT_JUDGE_MODEL` (defaults to `openrouter/fusion`)
- `CONSULTANT_DEFAULT_MAX_USD`
- `CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL`
- `CONSULTANT_MOCK=true` for local deterministic operation

## Beta validation

Required validation commands:

```bash
npm run typecheck
npm test
npm run build
npm run pack:beta
npm pack
```

At completion of this report, the package is expected to produce a tarball named like:

```text
sylphx-consultant-mcp-0.1.0-beta.0.tgz
```

## Deferred beyond beta

The following are deliberately not in `0.1.0-beta.0`:

- persistent consultation ledger database
- hosted HTTP API
- async queue / job status API
- semantic cache
- human approval workflow
- org admin UI
- provider scorecards / feedback loop

These should be added in a hosted Consultant Service or later package versions after real usage data.

## Publish status

A publishable npm package artifact is produced locally. Actual registry publishing requires a confirmed npm registry/scope and publish credential/authority.
