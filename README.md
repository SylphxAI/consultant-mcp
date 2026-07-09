<div align="center">

# Consultant MCP

### Your agent chose the architecture. **Did anyone else weigh in?**

Beta MCP server that gives autonomous agents a typed, audited path to a **consultant panel** —
four thin tools, one shared deliberation engine, judge synthesis, and remote models via OpenRouter.

[![npm version](https://img.shields.io/npm/v/@sylphx/consultant-mcp?style=flat-square)](https://www.npmjs.com/package/@sylphx/consultant-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

**Beta 0.x** · **4 typed MCP tools** · **Panel fan-out + judge** · **Privacy & budget gates** · **OpenRouter-ready**

[⭐ Star this repo](https://github.com/SylphxAI/consultant-mcp) if irreversible agent decisions should get a second opinion before they ship.
· [Quick start](#quick-start) · [See it work](#see-it-work) · [Why not one big prompt?](#why-not-one-big-prompt)

</div>

---

## The problem

Agents make irreversible calls every day — architecture, migrations, security boundaries, public
contracts. A single host model can sound confident, cite plausible trade-offs, and still miss
the blind spot that costs you a quarter.

Most teams either **skip review** (ship and pray) or **paste a giant prompt** (no policy, no
budget cap, no structured verdict, no audit trail).

**Consultant MCP is built for the moment your agent needs a governed second opinion before an
irreversible decision lands in production.**

## Why not one big prompt?

| Typical agent review | Consultant MCP |
| --- | --- |
| One model, one pass | Panel fan-out across configured models + judge synthesis |
| "Sounds good" prose | Structured verdict, confidence, consensus, disagreements, blind spots |
| Secrets in context | Privacy classes, confidential blocking, secret-like redaction |
| Unbounded spend | Per-request and service budget gates |
| Ad-hoc tool sprawl | **4** stable MCP product contracts over one deliberation engine |

## See it work

**Install once. Mock locally. Call a typed tool.**

```bash
claude mcp add consultant -- env CONSULTANT_MOCK=true sylphx-consultant-mcp
```

Challenge a proposed answer before the agent ships it:

```json
{
  "task": "Ship the new auth middleware this sprint",
  "proposedAnswer": "Use JWT in localStorage; refresh tokens rotate client-side.",
  "context": "B2B SaaS, browser + mobile clients, SOC2 in scope.",
  "challengeMode": "production_readiness",
  "privacyClass": "internal"
}
```

`consultant.challenge_answer` fans out to the panel, redacts secret-like strings, enforces
budget policy, and returns a judge-synthesized result:

```json
{
  "status": "completed",
  "verdict": "accept_with_changes",
  "confidence": 0.82,
  "executiveSummary": "JWT-in-localStorage is a known XSS surface; move tokens to httpOnly cookies and document refresh rotation.",
  "blindSpots": ["No mention of CSRF strategy for cookie-based auth"],
  "recommendedChanges": [
    { "priority": "must", "change": "Store access tokens in httpOnly, Secure, SameSite cookies" }
  ]
}
```

Abbreviated shape — full schema in [docs/usage.md](docs/usage.md).

## Why agents use it

| Need | What you get |
| --- | --- |
| Review an irreversible decision | `consultant.review_decision` — ADR, architecture, migration, security |
| Synthesize scoped research | `consultant.research` — freshness, citations, evidence gaps |
| Red-team a draft answer | `consultant.challenge_answer` — skeptical / red-team / production-readiness modes |
| Compare options | `consultant.compare_options` — weighted criteria + recommendation |
| Stay inside policy | Privacy classes, confidential external blocking, budget caps |
| Test without spend | `CONSULTANT_MOCK=true` deterministic local panel |

## Quick Start

### Claude Code

```bash
claude mcp add consultant -- sylphx-consultant-mcp
```

Set `OPENROUTER_API_KEY` (or `OPENROUTER_FUSION_API_KEY`) in the server environment.

### Claude Desktop / any MCP host

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

### Local development (mock panel)

```bash
npm ci && npm run build
CONSULTANT_MOCK=true sylphx-consultant-mcp
```

## MCP Tool Surface

| Tool | Use it when the agent needs to... |
| --- | --- |
| `consultant.review_decision` | Review an ADR, architecture choice, migration, or other high-stakes design |
| `consultant.research` | Synthesize research with scope, freshness, citations, and evidence gaps |
| `consultant.challenge_answer` | Red-team a proposed answer before sending or shipping |
| `consultant.compare_options` | Compare two or more options and get a structured recommendation |

All four tools share one deliberation engine — panel fan-out, policy gate, redaction, and judge
synthesis. See [docs/architecture.md](docs/architecture.md).

## Configuration

```bash
export OPENROUTER_API_KEY="..." # or OPENROUTER_FUSION_API_KEY
export CONSULTANT_PANEL_MODELS="openai/gpt-4.1,anthropic/claude-sonnet-4,google/gemini-2.5-pro"
export CONSULTANT_JUDGE_MODEL="openrouter/fusion"
export CONSULTANT_DEFAULT_MAX_USD="2"
export CONSULTANT_ALLOW_CONFIDENTIAL_EXTERNAL="false"
export CONSULTANT_MOCK=true  # local deterministic tests
```

## Safety model

1. Every request declares or defaults `privacyClass`.
2. `confidential` is blocked from external providers unless explicitly allowed.
3. Secret-like strings are redacted before model calls.
4. Estimated cost is checked against request and service budget.
5. Outputs are structured for downstream agent parsing.

## Status

Release channel: **Beta 0.x** (`@sylphx/consultant-mcp` v0.1.1). Production-shaped package —
stdio MCP server, OpenRouter adapter, mock provider, tests, and dry-run package verification.

Deferred to a future hosted Consultant Service: persistent ledger DB, async queue API, web UI,
semantic cache, org-level approval workflow.

## Development

```bash
git clone https://github.com/SylphxAI/consultant-mcp.git
cd consultant-mcp
npm ci
npm run verify
```

## Support

- [Issues](https://github.com/SylphxAI/consultant-mcp/issues)
- [npm package](https://www.npmjs.com/package/@sylphx/consultant-mcp)

## Help this reach more builders

If your agent has ever committed to an irreversible decision without a real second opinion, this
project is for you.

**[⭐ Star the repo](https://github.com/SylphxAI/consultant-mcp)** — it helps more agent builders
find governed consultation before high-stakes choices ship.

### Discovery (in progress)

| Channel | Status |
| --- | --- |
| [Glama MCP directory](https://glama.ai/mcp/servers) | Not listed yet |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/) | Not listed yet |
| [mcp.so submit](https://mcp.so/submit) | Not listed yet — directory submission |
| [mcpservers.org submit](https://mcpservers.org/submit) | Not listed yet — free web-form submission |

Know another MCP directory? [Open an issue](https://github.com/SylphxAI/consultant-mcp/issues/new) with the link.

## License

MIT © [SylphxAI](https://github.com/SylphxAI)