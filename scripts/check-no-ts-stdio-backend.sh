#!/usr/bin/env bash
# Rust-First gate (rust_impl dual-path): default MCP stdio must resolve to Rust rmcp.
# Residual TS adapter (src/server.ts) may remain as CONSULTANT_MCP_TRANSPORT=ts opt-in.
# Does NOT require ts_deleted (rej-010 promotion freeze).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
RUST_MAIN="${ROOT}/crates/consultant-mcp-server/src/main.rs"
RUST_STDIO="${ROOT}/crates/consultant-mcp-server/src/stdio_transport.rs"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"

violations=0
report_violation() { echo "VIOLATION: $*"; violations=$((violations + 1)); }

echo "=== check-no-ts-stdio-backend (rust_impl dual-path) $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

[[ -f "${BIN}" ]] || report_violation "missing bin/sylphx-consultant-mcp"
[[ -f "${RUST_MAIN}" ]] || report_violation "missing crates/consultant-mcp-server/src/main.rs"
[[ -f "${RUST_STDIO}" ]] || report_violation "missing crates/consultant-mcp-server/src/stdio_transport.rs"
[[ -f "${LEDGER}" ]] || report_violation "missing docs/specs/consultant-mcp-migration-ledger.json"

if [[ -f "${LEDGER}" ]]; then
node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
const tsAdapter = ledger.capabilities.find((cap) => cap.id === "transport/stdio-ts-adapter");
if (!stdioRust) { console.error("missing transport/stdio-rust-rmcp"); process.exit(1); }
if (!["rust_impl","parity_proven","authority_rust"].includes(stdioRust.state)) {
  console.error(`transport/stdio-rust-rmcp is ${stdioRust.state}; expected rust_impl+`);
  process.exit(1);
}
if (!tsAdapter) { console.error("missing transport/stdio-ts-adapter"); process.exit(1); }
// rej-010: forbid unproven ts_deleted / authority claims on this gate
if (tsAdapter.state === "ts_deleted") {
  console.error("transport/stdio-ts-adapter is ts_deleted without main-bound proof path in dual-path gate; use check-ts-adapter-deletion-ready.sh only after differential_green");
  process.exit(1);
}
if (stdioRust.state === "authority_rust") {
  console.error("transport/stdio-rust-rmcp authority_rust deferred (rej-010)");
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
  grep -q 'resolve_rust_bin' "${BIN}" || report_violation "bin must resolve Rust via resolve_rust_bin"
  grep -q 'printf.*stdio' "${BIN}" || report_violation "bin must default transport to stdio"
fi

if [[ -f "${RUST_MAIN}" ]]; then
  grep -q 'stdio_transport::serve_stdio' "${RUST_MAIN}" || report_violation "main must call stdio_transport::serve_stdio"
fi

if [[ -f "${RUST_STDIO}" ]]; then
  grep -q 'transport::stdio' "${RUST_STDIO}" || report_violation "stdio_transport.rs must expose rmcp stdio"
fi

if [[ "${violations}" -gt 0 ]]; then
  echo "FAIL: ${violations} stdio rust_impl violation(s)."
  exit 1
fi
echo "PASS: MCP stdio transport is rust_impl (dual-path residual TS allowed; authority_rust/ts_deleted deferred)."
