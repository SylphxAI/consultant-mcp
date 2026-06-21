# Sylphx Consultant MCP

`SylphxAI/consultant-mcp` provides the beta `@sylphx/consultant-mcp`
package: a typed Model Context Protocol server for autonomous agents to request
consultant review, research synthesis, answer challenge, and option comparison.

## Lifecycle

- State: `active`
- Layer: `tooling`
- Machine manifest: [`.doctrine/project.json`](./.doctrine/project.json)

## Goals

- Provide the `sylphx-consultant-mcp` stdio MCP package and binary.
- Own the four typed consultant tool surfaces and their shared deliberation
  engine.
- Keep provider fan-out, budget policy, privacy policy, redaction, schemas,
  docs, tests, and beta package verification coherent.

## Non-Goals

- This repo does not own a hosted Consultant Service, persistent ledger,
  semantic cache, web UI, admin dashboard, or organization approval workflow.
- This repo does not own model-vendor operations, enterprise doctrine, or
  customer-specific prompting policy.

## Boundary

This repository owns the beta MCP package boundary. It may change the package
source, tool schemas, OpenRouter-compatible provider adapter, mock provider,
policy checks, documentation, tests, and package metadata. Consumers must treat
the MCP tools, package export, CLI binary, and documented configuration as the
public surfaces.

Product-specific consultation workflows, hosted service behavior, persistent
usage ledgers, and organization policy live outside this package unless a future
ADR changes the lifecycle and boundary.

## Public Surfaces

- Package export: `package.json`
- CLI binary: `sylphx-consultant-mcp`
- MCP tool schemas and server: `src/schemas.ts`, `src/server.ts`
- Provider adapter boundary: `src/providers/`
- Documentation and ADRs: `README.md`, `docs/`, `adr/`

## Delivery

This repo currently has package scripts but no repo-local GitHub CI workflow.
Production proof for package changes is `npm run verify`, dry-run package
verification, and package registry/readme readback for published beta versions.
Published package mistakes are recovered with forward fixes or replacement
versions.
