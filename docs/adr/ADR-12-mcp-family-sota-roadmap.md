# ADR-12: Adopt Consultant MCP Family SOTA Roadmap

Date: 2026-07-09
Status: Accepted
Slug: mcp-family-sota-roadmap

## Context

Consultant MCP is the structured deliberation and review engine in the SylphxAI
MCP family. It needs a repo-local roadmap that keeps the package focused on
typed consultation tools, provider policy, budget controls, privacy, redaction,
judge synthesis, evidence gaps, and beta package verification.

## Decision

Adopt `docs/roadmap/sota-family-roadmap.md` as the local roadmap for Consultant
MCP's family role.

Consultant MCP owns the local/beta MCP package boundary. A hosted Consultant
Service would require a separate ADR and should not be smuggled into this
package.

## Consequences

- Evidence from Architecture Reader, CodeRAG, Reader MCPs, and Filesystem MCP
  can feed Consultant MCP as input.
- The target MCP runtime is Rust using `modelcontextprotocol/rust-sdk` / `rmcp`.
- Rust owns deterministic policy, redaction, hashing, ledger, replay primitives,
  request validation, and serving.
- Provider integrations remain replaceable modules behind the Rust policy
  boundary.
- Hosted persistence, queues, admin workflows, and billing remain outside this
  package unless a future ADR changes the boundary.

## Verification

- Roadmap added at `docs/roadmap/sota-family-roadmap.md`.
- README and PROJECT link to the roadmap.
- Docs-only validation: `git diff --check`.
