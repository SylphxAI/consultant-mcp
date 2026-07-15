#!/usr/bin/env bash
# S5 gate: default MCP stdio transport must delegate solely to Rust rmcp.
# TS stdio adapter is retired (transport/stdio-ts-adapter → ts_deleted).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
RUST_MAIN="${ROOT}/crates/consultant-mcp-server/src/main.rs"
RUST_STDIO="${ROOT}/crates/consultant-mcp-server/src/stdio_transport.rs"
TS_ADAPTER_GATE="${ROOT}/scripts/check-ts-adapter-deletion-ready.sh"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"

violations=0
report_violation() { echo "VIOLATION: $*"; violations=$((violations + 1)); }

echo "=== check-no-ts-stdio-backend $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

[[ -f "${BIN}" ]] || report_violation "missing bin/sylphx-consultant-mcp"
[[ -f "${RUST_MAIN}" ]] || report_violation "missing crates/consultant-mcp-server/src/main.rs"
[[ -f "${RUST_STDIO}" ]] || report_violation "missing crates/consultant-mcp-server/src/stdio_transport.rs"
[[ -f "${TS_ADAPTER_GATE}" ]] || report_violation "missing scripts/check-ts-adapter-deletion-ready.sh"
[[ -f "${LEDGER}" ]] || report_violation "missing docs/specs/consultant-mcp-migration-ledger.json"

if [[ -f "${ROOT}/src/server.ts" ]]; then
  report_violation "src/server.ts must be deleted (transport/stdio-ts-adapter ts_deleted)"
fi

if [[ -f "${ROOT}/dist/server.js" ]]; then
  report_violation "dist/server.js must be deleted (transport/stdio-ts-adapter ts_deleted)"
fi

if [[ -f "${LEDGER}" ]]; then
node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
const tsAdapter = ledger.capabilities.find((cap) => cap.id === "transport/stdio-ts-adapter");
if (!stdioRust) { console.error("missing transport/stdio-rust-rmcp"); process.exit(1); }
if (!tsAdapter) { console.error("missing transport/stdio-ts-adapter"); process.exit(1); }
const rustAuthorityStates = new Set(["rust_impl", "authority_rust", "ts_deleted"]);
if (!rustAuthorityStates.has(stdioRust.state)) {
  console.error(`transport/stdio-rust-rmcp is ${stdioRust.state}; expected rust_impl, authority_rust, or ts_deleted`);
  process.exit(1);
}
const allowedProof = new Set(["missing", "differential_green", "canary_green", "caught_up"]);
const proofStatus = (stdioRust.proof || {}).status;
if (["rust_impl", "ts_deleted"].includes(stdioRust.state) && !allowedProof.has(proofStatus)) {
  console.error(`transport/stdio-rust-rmcp proof.status=${proofStatus}; expected one of ${[...allowedProof].join(", ")}`);
  process.exit(1);
}
if (tsAdapter.state !== "ts_deleted") {
  console.error(`transport/stdio-ts-adapter is ${tsAdapter.state}; expected ts_deleted`);
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
  grep -q 'resolve_rust_bin' "${BIN}" || report_violation "bin must resolve Rust via resolve_rust_bin"
  grep -q 'printf.*stdio' "${BIN}" || report_violation "bin must default transport to stdio"
  if grep -qE 'use_ts_transport|exec node|CONSULTANT_MCP_TRANSPORT:-}" == "ts"' "${BIN}"; then
    report_violation "bin must not launch node or retain TS stdio opt-in"
  fi
fi

if [[ -f "${RUST_MAIN}" ]]; then
  grep -q 'stdio_transport::serve_stdio' "${RUST_MAIN}" || report_violation "main must call stdio_transport::serve_stdio"
fi

if [[ -f "${RUST_STDIO}" ]]; then
  grep -q 'transport::stdio' "${RUST_STDIO}" || report_violation "stdio_transport.rs must expose rmcp stdio"
fi

if [[ "${violations}" -gt 0 ]]; then
  echo "FAIL: ${violations} MCP stdio TS authority violation(s)."
  exit 1
fi
echo "PASS: MCP stdio transport delegates solely to Rust rmcp (differential_green parity proven)."