#!/usr/bin/env bash
# Rust-First gate (rust_impl): HTTP MCP transport is Rust streamable HTTP.
# No parallel TS StreamableHTTPServerTransport required-absent on shipped path.
# Does NOT promote authority_rust (rej-010).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
RUST_HTTP="${ROOT}/crates/consultant-mcp-server/src/http_transport.rs"
RUST_MAIN="${ROOT}/crates/consultant-mcp-server/src/main.rs"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"

violations=0
report_violation() { echo "VIOLATION: $*"; violations=$((violations + 1)); }

echo "=== check-no-ts-http-backend (rust_impl) $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

[[ -f "${BIN}" ]] || report_violation "missing bin/sylphx-consultant-mcp"
[[ -f "${RUST_HTTP}" ]] || report_violation "missing http_transport.rs"
[[ -f "${RUST_MAIN}" ]] || report_violation "missing main.rs"
[[ -f "${LEDGER}" ]] || report_violation "missing consultant-mcp-migration-ledger.json"

if [[ -f "${LEDGER}" ]]; then
node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const http = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
if (!http) { console.error("missing transport/web-mcp-http"); process.exit(1); }
if (!["rust_impl","parity_proven"].includes(http.state)) {
  console.error(`transport/web-mcp-http is ${http.state}; expected rust_impl|parity_proven (rej-010)`);
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
  grep -q 'resolve_transport' "${BIN}" || report_violation "bin must resolve_transport for http mode"
  grep -q 'MCP_TRANSPORT' "${BIN}" || report_violation "bin must honor MCP_TRANSPORT=http"
fi

if [[ -f "${RUST_HTTP}" ]]; then
  grep -q 'StreamableHttpService' "${RUST_HTTP}" || report_violation "http_transport.rs must implement StreamableHttpService"
fi

if [[ -f "${RUST_MAIN}" ]]; then
  grep -q 'http_transport' "${RUST_MAIN}" || report_violation "main must wire http_transport"
fi

# Residual TS stdio adapter is OK; forbid TS streamable HTTP backend in src if present
if [[ -f "${ROOT}/src/server.ts" ]]; then
  if grep -qE 'StreamableHTTPServerTransport|createMcpExpressApp|app\.post\(["'\''"]/mcp' "${ROOT}/src/server.ts"; then
    report_violation "src/server.ts must not implement Streamable HTTP MCP (Rust owns HTTP)"
  fi
fi

if [[ "${violations}" -gt 0 ]]; then
  echo "FAIL: ${violations} HTTP rust_impl violation(s)."
  exit 1
fi
echo "PASS: HTTP MCP transport is rust_impl (authority_rust deferred)."
