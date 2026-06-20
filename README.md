# Sylphx Consultant MCP

`@sylphx/consultant-mcp` is a **Beta 0.x** Model Context Protocol server that gives autonomous agents a typed, audited path to ask a higher-grade consultant panel for:

- ADR / architecture / design review
- research synthesis
- red-team challenge of a proposed answer
- option comparison and trade-off analysis

The beta design intentionally exposes **four thin typed MCP tools** backed by **one shared deliberation engine**. The tool split is an agent-facing product contract; the fan-out, policy, redaction, and judge synthesis are shared implementation.

## Status

Version: `0.1.0-beta.0`

This is a production-shaped beta, not a final hosted service. It includes:

- MCP stdio server
- OpenRouter-compatible provider adapter
- mock provider for local tests
- panel fan-out
- judge synthesis
- privacy/budget policy gate
- secret-like redaction
- structured output schemas
- tests and dry-run package verification

Deferred intentionally:

- persistent ledger database
- async queue API
- web UI/admin dashboard
- semantic cache
- organization-level approval workflow

Those belong in the future hosted Consultant Service, not in the first MCP package.

## Tools

### `consultant.review_decision`

Use for ADRs, architecture choices, production design reviews, public contracts, migrations, security decisions, and expensive irreversible choices.

### `consultant.research`

Use for research synthesis where the answer needs freshness, source quality, contradictions, and evidence gaps.

### `consultant.challenge_answer`

Use when an agent already has a proposed answer and wants skeptical review before sending or shipping.

### `consultant.compare_options`

Use to compare two or more options against criteria and produce a recommendation.

## Configuration

```bash
export OPENROUTER_API_KEY="..." # or OPENROUTER_FUSION_API_KEY
export CONSULTANT_PANEL_MODELS="openai/gpt-4.1,anthropic/claude-sonnet-4,google/gemini-2.5-pro"
export CONSULTANT_JUDGE_MODEL="openrouter/fusion"
export CONSULTANT_DEFAULT_MAX_USD="2"
export CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL="false"
```

For local deterministic testing:

```bash
export CONSULTANT_MOCK=true
```

## Run

```bash
npm install
npm run build
CONSULTANT_MOCK=true node dist/server.js
```

MCP clients should launch the binary over stdio:

```json
{
  "mcpServers": {
    "sylphx-consultant": {
      "command": "sylphx-consultant-mcp",
      "env": {
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "CONSULTANT_DEFAULT_MAX_USD": "2"
      }
    }
  }
}
```

## Safety model

1. Every request declares or defaults `privacyClass`.
2. `confidential` is blocked from external providers unless explicitly allowed.
3. Secret-like strings are redacted before model calls.
4. Estimated cost is checked against request and service budget.
5. Outputs are structured for downstream agent parsing.
6. Provider adapters are replaceable; OpenRouter Fusion is an option, not the core dependency.

## Design principle

> Prompting is an implementation detail. MCP tools are product contracts for agents, policy, cost control, caching, observability, and evaluation.
