#!/usr/bin/env bash
# Rust-First gate: four consultant MCP tools must delegate solely to Rust consultant-core.
# Forbidden: parallel TS MCP tool handlers or TS deliberation engine on the shipped MCP path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
TS_ENTRY="${ROOT}/src/index.ts"
RUST_LIB="${ROOT}/crates/consultant-mcp-server/src/lib.rs"
RUST_TOOLS="${ROOT}/crates/consultant-mcp-server/src/tools.rs"
RUST_CORE="${ROOT}/crates/consultant-core/src/engine.rs"
TOOLS_GATE="${ROOT}/scripts/check-no-ts-tools-backend.sh"
GATE_TEST="${ROOT}/test/check-no-ts-tools-backend.test.ts"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"
PARITY_TEST="${ROOT}/test/parity.test.ts"
HTTP_INTEGRATION="${ROOT}/test/integration/http-transport.test.ts"

violations=0

report_violation() {
	echo "VIOLATION: $*"
	violations=$((violations + 1))
}

echo "=== check-no-ts-tools-backend $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${BIN}" ]]; then
	report_violation "missing bin/sylphx-consultant-mcp"
fi

if [[ ! -f "${TOOLS_GATE}" ]]; then
	report_violation "missing scripts/check-no-ts-tools-backend.sh"
fi

if [[ ! -f "${GATE_TEST}" ]]; then
	report_violation "missing test/check-no-ts-tools-backend.test.ts"
fi

if [[ ! -f "${LEDGER}" ]]; then
	report_violation "missing docs/specs/consultant-mcp-migration-ledger.json"
fi

if [[ ! -f "${RUST_LIB}" ]]; then
	report_violation "missing crates/consultant-mcp-server/src/lib.rs"
fi

if [[ ! -f "${RUST_TOOLS}" ]]; then
	report_violation "missing crates/consultant-mcp-server/src/tools.rs"
fi

if [[ ! -f "${RUST_CORE}" ]]; then
	report_violation "missing crates/consultant-core/src/engine.rs"
fi

if [[ ! -f "${PARITY_TEST}" ]]; then
	report_violation "missing test/parity.test.ts"
fi

if [[ ! -f "${HTTP_INTEGRATION}" ]]; then
	report_violation "missing test/integration/http-transport.test.ts"
fi

if [[ -f "${ROOT}/src/server.ts" ]]; then
	report_violation "src/server.ts must be deleted (transport/stdio-ts-adapter ts_deleted)"
fi

if [[ -f "${LEDGER}" ]]; then
	node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const toolIds = [
  "tool/consultant.review_decision",
  "tool/consultant.research",
  "tool/consultant.challenge_answer",
  "tool/consultant.compare_options",
];

for (const id of toolIds) {
  const entry = ledger.capabilities.find((cap) => cap.id === id);
  if (!entry) {
    console.error(`[check-no-ts-tools-backend] missing capability ${id}`);
    process.exit(1);
  }
  if (entry.state !== "authority_rust") {
    console.error(
      `[check-no-ts-tools-backend] ${id} is ${entry.state}; expected authority_rust`
    );
    process.exit(1);
  }
}

const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
const httpTransport = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
if (!stdioRust || stdioRust.state !== "rust_impl") {
  console.error(
    `[check-no-ts-tools-backend] transport/stdio-rust-rmcp is ${stdioRust?.state ?? "missing"}; expected rust_impl (rej-010: S5 slice, authority_rust deferred)`
  );
  process.exit(1);
}
if (!httpTransport || httpTransport.state !== "authority_rust") {
  console.error(
    `[check-no-ts-tools-backend] transport/web-mcp-http is ${httpTransport?.state ?? "missing"}; expected authority_rust`
  );
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
	if ! grep -q 'resolve_rust_bin' "${BIN}"; then
		report_violation "bin/sylphx-consultant-mcp must resolve Rust rmcp server via resolve_rust_bin"
	fi

	if grep -qE 'use_ts_transport|exec node|CONSULTANT_MCP_TRANSPORT:-}" == "ts"' "${BIN}"; then
		report_violation "bin/sylphx-consultant-mcp must not launch node or retain TS MCP opt-in"
	fi
fi

if [[ -f "${RUST_LIB}" ]]; then
	for tool in \
		consultant.review_decision \
		consultant.research \
		consultant.challenge_answer \
		consultant.compare_options; do
		if ! grep -q "$tool" "${RUST_LIB}"; then
			report_violation "Rust MCP server must register tool ${tool}"
		fi
	done

	if ! grep -q 'run_consultation' "${RUST_LIB}"; then
		report_violation "Rust MCP server must route tools through consultant-core run_consultation"
	fi

	if ! grep -q 'consult_tool' "${RUST_LIB}"; then
		report_violation "Rust MCP server must centralize tool dispatch via consult_tool"
	fi
fi

if [[ -f "${RUST_TOOLS}" ]]; then
	for tool in \
		TOOL_REVIEW_DECISION \
		TOOL_RESEARCH \
		TOOL_CHALLENGE_ANSWER \
		TOOL_COMPARE_OPTIONS; do
		if ! grep -q "$tool" "${RUST_TOOLS}"; then
			report_violation "Rust tools metadata must define ${tool}"
		fi
	done
fi

if [[ -f "${RUST_CORE}" ]]; then
	if ! grep -q 'pub async fn run_consultation' "${RUST_CORE}"; then
		report_violation "consultant-core must expose run_consultation deliberation engine"
	fi
fi

if [[ -f "${TS_ENTRY}" ]]; then
	if grep -qE 'StdioServerTransport|McpServer|@modelcontextprotocol/sdk/server|registerTool|tools/call' "${TS_ENTRY}"; then
		report_violation "src/index.ts must not implement TS MCP tool handlers"
	fi
fi

if [[ -d "${ROOT}/src" ]]; then
	if grep -rqE 'StdioServerTransport|McpServer|@modelcontextprotocol/sdk/server|registerTool' "${ROOT}/src" 2>/dev/null; then
		report_violation "src/ must not retain TS MCP tool server handlers"
	fi
fi

if [[ "${violations}" -gt 0 ]]; then
	echo ""
	echo "FAIL: ${violations} consultant MCP tool TS authority violation(s)."
	echo "Authority: crates/consultant-mcp-server/src/lib.rs → crates/consultant-core/src/engine.rs."
	exit 1
fi

echo "PASS: four consultant MCP tools delegate solely to Rust consultant-core (no parallel TS tool backend)."