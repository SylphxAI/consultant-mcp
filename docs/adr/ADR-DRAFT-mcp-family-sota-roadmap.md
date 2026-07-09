# ADR Draft: Adopt Consultant MCP Family SOTA Roadmap

Date: 2026-07-09  
Status: Draft, blocked from remote PR because the repository is archived  
Slug: mcp-family-sota-roadmap

## Context

Consultant MCP is the structured deliberation and review engine in the SylphxAI
MCP family. It needs a repo-local roadmap that keeps the package focused on
typed consultation tools, provider policy, budget controls, privacy, redaction,
judge synthesis, evidence gaps, and beta package verification.

## Decision

Adopt `docs/roadmap/sota-family-roadmap.md` as the local roadmap for Consultant
MCP's family role once the repository is writable again.

Consultant MCP owns the local/beta MCP package boundary. A hosted Consultant
Service would require a separate ADR and should not be smuggled into this
package.

## Consequences

- Evidence from Architecture Reader, CodeRAG, Reader MCPs, and Filesystem MCP
  can feed Consultant MCP as input.
- TypeScript remains appropriate for provider integration and schema velocity.
- Rust may own deterministic policy, redaction, hashing, ledger, and replay
  primitives when needed.
- Hosted persistence, queues, admin workflows, and billing remain outside this
  package unless a future ADR changes the boundary.

## Verification

- Roadmap added locally at `docs/roadmap/sota-family-roadmap.md`.
- README and PROJECT link to the roadmap locally.
- Remote push is blocked because GitHub reports the repository is archived.
