# Repository Agent Instructions

This repository follows the central doctrine in
[SylphxAI/doctrine](https://github.com/SylphxAI/doctrine).

Before changing behavior, read [PROJECT.md](./PROJECT.md) and
[.doctrine/project.json](./.doctrine/project.json). Keep enterprise policy in
doctrine; keep only repo-local package facts here.

Useful validation for this package:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run pack:beta`
- `npm run verify`

Do not add hosted-service persistence, admin UI, organization approval workflow,
or customer-specific prompting policy to this beta MCP package without first
updating the project boundary through an ADR or manifest change.
