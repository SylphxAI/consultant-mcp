---
status: accepted
slug: groundatlas-project-control-gate
---

# ADR-3: GroundAtlas Project Control Gate

## Context

Consultant MCP is a public beta package repository with package verification
scripts but no repo-local GitHub CI workflow. Fleet dogfooding needs a
vendor-neutral project manifest and CI proof that the released GroundAtlas
package/action can discover the repository without turning generated reports
into source of truth.

The beta package is not published to npm yet. Publication is an immutable public
contract and remains outside this project-control slice until a dedicated
release workflow and release-intent decision exist.

## Decision

Adopt `project.manifest.json` as the vendor-neutral project control file. Keep
`.doctrine/project.json` as the Sylphx Doctrine adapter and org-local governance
catalog. Add ADR-29 CI admission, `npm run verify`, project-control tests, and
released `groundatlas@0.1.2` dogfooding through `SylphxAI/groundatlas@v0.1.2`.
Generated `.groundatlas*` outputs are evidence/navigation only, not SSOT.

## Consequences

- Agents and automation read `PROJECT.md`, `project.manifest.json`,
  `.doctrine/project.json`, `README.md`, docs, source, tests, and CI evidence
  before durable package changes.
- CI now proves the beta package verification path and GroundAtlas control-file
  boundary on pull requests, merge groups, and main pushes.
- npm publication remains blocked on a separate release workflow/Changesets
  decision plus registry/readme/provenance readback.
