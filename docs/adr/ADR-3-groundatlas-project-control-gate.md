---
status: accepted
slug: groundatlas-project-control-gate
---

# ADR-3: GroundAtlas Project Control Gate

## Context

Consultant MCP is a public beta package repository with package verification,
protected GitHub CI, and protected npm publication workflow evidence. Fleet
dogfooding needs a vendor-neutral project manifest and CI/release proof that the
released GroundAtlas package/action can discover the repository without turning
generated reports into source of truth.

## Decision

Adopt `project.manifest.json` as the vendor-neutral project control file. Keep
`.doctrine/project.json` as the Sylphx Doctrine adapter and org-local governance
catalog. Keep ADR-29 CI admission, `npm run verify`, project-control tests, and
released `groundatlas@0.1.3` dogfooding through `SylphxAI/groundatlas@v0.1.3`.
Generated `.groundatlas*` files plus GroundAtlas JSON/Markdown reports are
evidence/navigation only, not SSOT.

## Consequences

- Agents and automation read `PROJECT.md`, `project.manifest.json`,
  `.doctrine/project.json`, `README.md`, docs, source, tests, and CI evidence
  before durable package changes.
- CI proves the beta package verification path and GroundAtlas control-file
  boundary on pull requests, merge groups, and main pushes.
- npm publication remains owned by the protected release workflow plus
  registry/readme/provenance/install-smoke/GitHub release readback.
