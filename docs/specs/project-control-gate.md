# Project Control Gate

## Purpose

Make Consultant MCP dogfood GroundAtlas as a real open-source package consumer
while preserving project truth boundaries:

- `project.manifest.json` is the vendor-neutral per-project control file.
- `.doctrine/project.json` is the Sylphx Doctrine adapter and governance catalog.
- `.groundatlas*` files plus GroundAtlas JSON/Markdown reports are generated evidence/navigation only, not SSOT.

## Required Read Path

Before changing this repository, read the smallest relevant set:

1. `AGENTS.md`, `PROJECT.md`, `project.manifest.json`, and `.doctrine/project.json`.
2. `README.md`, `docs/architecture.md`, `docs/usage.md`, and `docs/adr/` for public beta behavior.
3. `src/`, `package.json`, `package-lock.json`, and `src/__tests__/` for package/source changes.
4. `.github/workflows/ci.yml` and CI evidence for validation changes.
5. `SECURITY.md` for vulnerability-reporting and public trust boundaries.

## CI Contract

The CI workflow must:

- install with `npm ci`;
- run `npm run verify` for typecheck, tests, build, and dry-run npm package verification;
- run `npm run test:project-control`;
- run `SylphxAI/groundatlas@v0.1.3` with `package-spec: groundatlas@0.1.3`;
- require generated atlas evidence and strict fleet status;
- assert the Markdown fleet scorecard title and adopted summary;
- upload GroundAtlas JSON and Markdown reports as CI artifacts.

## Publication Boundary

The package metadata is public and publishable through the protected release
workflow. Public beta publication is complete only after protected CI/release
workflow evidence, npm provenance publication or existing-version readback, npm
registry/readme readback, install smoke, and GitHub release readback. Do not
manually publish from a workstation as the normal path.
