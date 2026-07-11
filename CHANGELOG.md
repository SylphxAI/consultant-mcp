# @sylphx/consultant-mcp

## 0.2.0

### Minor Changes

- Publish the Rust-default MCP consumer package from main: fail-closed `bin/sylphx-consultant-mcp` launcher, staged `bin/native/consultant-mcp-server` (rmcp stdio + HTTP), and SHA-bound npm artifact so consumers install the main-tip Rust authority path (not pure TypeScript `dist/server.js`). Residual TS adapter remains opt-in via `CONSULTANT_MCP_TRANSPORT=ts`.

## 0.1.1

### Patch Changes

- Republish the Consultant MCP beta package from the finalized GitHub-hosted provenance release workflow so the npm `gitHead`, release tag, registry readback, install smoke, and GitHub Release evidence align.

## 0.1.0

### Patch Changes

- Publish the Consultant MCP beta package to npm through the protected Sylphx release workflow.
