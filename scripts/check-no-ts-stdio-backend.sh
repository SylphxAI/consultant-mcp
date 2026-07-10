#!/usr/bin/env bash
# Rust-First gate: default MCP stdio transport must delegate solely to Rust rmcp.
# TS stdio adapter is retired (transport/stdio-ts-adapter → ts_deleted).
# Forbidden: parallel TS stdio MCP server in src/; bin stdio path via node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
TS_ENTRY="${ROOT}/src/index.ts"
RUST_MAIN="${ROOT}/crates/consultant-mcp-server/src/main.rs"
RUST_STDIO="${ROOT}/crates/consultant-mcp-server/src/stdio_transport.rs"
STDIO_GATE="${ROOT}/scripts/check-no-ts-stdio-backend.sh"
GATE_TEST="${ROOT}/test/check-no-ts-stdio-backend.test.ts"
TS_ADAPTER_GATE="${ROOT}/scripts/check-ts-adapter-deletion-ready.sh"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"
PARITY_TEST="${ROOT}/test/parity.test.ts"

violations=0

report_violation() {
	echo "VIOLATION: $*"
	violations=$((violations + 1))
}

echo "=== check-no-ts-stdio-backend $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${BIN}" ]]; then
	report_violation "missing bin/sylphx-consultant-mcp"
fi

if [[ ! -f "${STDIO_GATE}" ]]; then
	report_violation "missing scripts/check-no-ts-stdio-backend.sh"
fi

if [[ ! -f "${GATE_TEST}" ]]; then
	report_violation "missing test/check-no-ts-stdio-backend.test.ts"
fi

if [[ ! -f "${TS_ADAPTER_GATE}" ]]; then
	report_violation "missing scripts/check-ts-adapter-deletion-ready.sh"
fi

if [[ ! -f "${LEDGER}" ]]; then
	report_violation "missing docs/specs/consultant-mcp-migration-ledger.json"
fi

if [[ ! -f "${RUST_MAIN}" ]]; then
	report_violation "missing crates/consultant-mcp-server/src/main.rs"
fi

if [[ ! -f "${RUST_STDIO}" ]]; then
	report_violation "missing crates/consultant-mcp-server/src/stdio_transport.rs"
fi

if [[ ! -f "${PARITY_TEST}" ]]; then
	report_violation "missing test/parity.test.ts"
fi

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
if (!stdioRust) {
  console.error("[check-no-ts-stdio-backend] missing capability transport/stdio-rust-rmcp");
  process.exit(1);
}
if (!tsAdapter) {
  console.error("[check-no-ts-stdio-backend] missing capability transport/stdio-ts-adapter");
  process.exit(1);
}
if (stdioRust.state !== "rust_impl") {
  console.error(
    `[check-no-ts-stdio-backend] transport/stdio-rust-rmcp is ${stdioRust.state}; expected rust_impl (rej-010: S5 slice, authority_rust promotion deferred)`
  );
  process.exit(1);
}
if (tsAdapter.state !== "ts_deleted") {
  console.error(
    `[check-no-ts-stdio-backend] transport/stdio-ts-adapter is ${tsAdapter.state}; expected ts_deleted`
  );
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
	if ! grep -q 'resolve_rust_bin' "${BIN}"; then
		report_violation "bin/sylphx-consultant-mcp must resolve Rust rmcp server via resolve_rust_bin"
	fi

	if ! grep -q 'printf.*stdio' "${BIN}"; then
		report_violation "bin/sylphx-consultant-mcp must default transport to stdio"
	fi

	if grep -qE 'use_ts_transport|exec node|CONSULTANT_MCP_TRANSPORT:-}" == "ts"' "${BIN}"; then
		report_violation "bin/sylphx-consultant-mcp must not launch node or retain TS stdio opt-in"
	fi
fi

if [[ -f "${RUST_MAIN}" ]]; then
	if ! grep -q 'stdio_transport::serve_stdio' "${RUST_MAIN}"; then
		report_violation "Rust MCP server main must delegate default transport to stdio_transport::serve_stdio"
	fi
fi

if [[ -f "${RUST_STDIO}" ]]; then
	if ! grep -q 'transport::stdio' "${RUST_STDIO}"; then
		report_violation "stdio_transport.rs must expose rmcp stdio transport"
	fi
fi

if [[ -f "${TS_ENTRY}" ]]; then
	if grep -qE 'StdioServerTransport|McpServer|@modelcontextprotocol/sdk/server' "${TS_ENTRY}"; then
		report_violation "src/index.ts must not implement TS stdio MCP server transport"
	fi
fi

if [[ "${violations}" -gt 0 ]]; then
	echo ""
	echo "FAIL: ${violations} MCP stdio TS authority violation(s)."
	echo "Authority: crates/consultant-mcp-server/src/main.rs via bin/sylphx-consultant-mcp."
	exit 1
fi

echo "PASS: MCP stdio transport is rust_impl — Rust rmcp stdio wired, no parallel TS stdio backend (authority_rust deferred per rej-010)."