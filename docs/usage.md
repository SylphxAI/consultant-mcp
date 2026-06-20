# Consultant MCP Usage

## Install from a local beta tarball

```bash
npm install -g ./sylphx-consultant-mcp-0.1.0-beta.0.tgz
```

## Run in mock mode

```bash
CONSULTANT_MOCK=true sylphx-consultant-mcp
```

Mock mode does not require provider credentials and is suitable for MCP wiring tests.

## Run with OpenRouter-compatible provider

```bash
export OPENROUTER_API_KEY="..."
export CONSULTANT_PANEL_MODELS="openai/gpt-4.1,anthropic/claude-sonnet-4,google/gemini-2.5-pro"
export CONSULTANT_JUDGE_MODEL="openrouter/fusion"
sylphx-consultant-mcp
```

`OPENROUTER_FUSION_API_KEY` is also accepted as a fallback key name.

## MCP client config example

```json
{
  "mcpServers": {
    "sylphx-consultant": {
      "command": "sylphx-consultant-mcp",
      "env": {
        "CONSULTANT_MOCK": "true"
      }
    }
  }
}
```

## Choosing the right tool

Use `consultant.review_decision` when the agent has an ADR, architecture decision, migration plan, or high-risk product decision.

Use `consultant.research` when the agent needs a scoped answer with evidence gaps and citations.

Use `consultant.challenge_answer` when the agent already drafted an answer and wants a red-team review before sending.

Use `consultant.compare_options` when the agent must choose among multiple options.

## Privacy notes

Do not send secrets. The beta redacts common secret-like strings as a defensive layer, but callers should still pass minimal context. Mark sensitive input `privacyClass: "confidential"`; external provider calls are blocked by default for confidential requests.
