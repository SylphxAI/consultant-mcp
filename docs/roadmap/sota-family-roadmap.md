# SOTA Family Roadmap

Status: adoption plan  
Owner: Consultant MCP  
Scope: repo-local future plan and its role in the SylphxAI MCP family

## Family Role

Consultant MCP is the structured deliberation and review engine for the MCP
family. It lets agents ask for decision review, research synthesis, answer
challenge, and option comparison through typed tools, panel routing, budget
policy, redaction, and judge synthesis.

It is not a generic chat wrapper. Its job is to make high-stakes reasoning
auditable: what was asked, what was redacted, which models responded, what they
disagreed about, what evidence was missing, and what recommendation survived.

## Family Fit

| Project | Relationship |
| --- | --- |
| Architecture Reader MCP | Supplies architecture evidence for design review, migration review, and impact decisions. |
| CodeRAG | Supplies code evidence and context packs for implementation review and retrieval strategy review. |
| Reader MCPs | Supply document, image, and video evidence for research and challenge workflows. |
| Filesystem MCP | Supplies operation evidence and write ledgers for risky local changes. |
| Smart Reader MCP | Normalizes unknown file evidence before Consultant MCP evaluates the claims. |

## SOTA End State

Consultant MCP should become the agent-native review board: typed, budget-aware,
privacy-aware, provider-agnostic, eval-gated, and strict about separating
evidence, assumptions, disagreements, confidence, and recommendations.

## Runtime Direction

TypeScript can remain the fastest provider-integration and MCP-schema surface.
Rust is appropriate for deterministic policy, redaction primitives, request
hashing, cache keys, local ledger storage, replay tooling, and cost accounting
when those paths need stronger safety or performance.

WASM may be useful for sandboxed scoring or policy plugins, but provider fan-out
and judge synthesis stay explicit host behavior.

## Roadmap

### Phase 0: Beta Contract Hardening

- Freeze the four typed tool surfaces:
  `consultant.review_decision`, `consultant.research`,
  `consultant.challenge_answer`, and `consultant.compare_options`.
- Add minimal and rich JSON examples for each tool.
- Add strict output validation and degraded-mode responses for malformed model
  output.
- Document provider, budget, timeout, redaction, and confidentiality policy.

### Phase 1: Policy And Ledger Core

- Add deterministic request hashing and redaction trace.
- Add local consultation ledger format for replay and audit.
- Add provider failure taxonomy and retry policy.
- Evaluate Rust primitives for policy, hashing, redaction, ledger, and replay.

### Phase 2: Evaluation Harness

- Add fixture consultations for architecture review, research synthesis, answer
  challenge, and option comparison.
- Add judge consistency and JSON validity checks.
- Add rubric scoring for evidence gaps, disagreement capture, and final
  recommendation quality.

### Phase 3: Family Integrations

- Accept evidence bundles from Architecture Reader, CodeRAG, Reader MCPs, and
  Filesystem MCP operation logs.
- Add task-aware routing profiles for design review, incident review, package
  release review, and risky edit review.
- Add cost and latency optimizer with explicit quality fallback.

### Phase 4: Hosted Boundary Decision

- Keep this MCP package local and beta-compatible until a separate hosted
  service ADR defines persistence, queues, admin controls, tenant policy, and
  billing.
- If a hosted service is created, keep the MCP package as a client and local
  policy boundary rather than absorbing service ownership.

## Star And Adoption Strategy

The public promise is "make agents challenge themselves before they ship."
Star growth comes from high-signal examples, strict JSON outputs, clear privacy
controls, and visible evidence-gap reporting rather than generic model fan-out.

## Validation Gates

- All tool outputs validate against schema.
- Failed panel calls do not hide degraded confidence.
- Provider trace includes model, latency, cost when available, and policy route.
- Redaction is tested with sensitive fixtures.
- Eval fixtures prevent regressions in disagreement and evidence-gap reporting.
