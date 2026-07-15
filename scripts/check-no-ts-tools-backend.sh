#!/usr/bin/env bash
# Four consultant tools must be exposed via Rust rmcp + consultant-core (ts_deleted admission).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/sylphx-consultant-mcp"
RUST_LIB="${ROOT}/crates/consultant-mcp-server/src/lib.rs"
RUST_CORE="${ROOT}/crates/consultant-core/src/engine.rs"
LEDGER="${ROOT}/docs/specs/consultant-mcp-migration-ledger.json"

violations=0
report_violation() { echo "VIOLATION: $*"; violations=$((violations + 1)); }

echo "=== check-no-ts-tools-backend $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

[[ -f "${BIN}" ]] || report_violation "missing bin/sylphx-consultant-mcp"
[[ -f "${RUST_LIB}" ]] || report_violation "missing crates/consultant-mcp-server/src/lib.rs"
[[ -f "${RUST_CORE}" ]] || report_violation "missing crates/consultant-core/src/engine.rs"
[[ -f "${LEDGER}" ]] || report_violation "missing docs/specs/consultant-mcp-migration-ledger.json"

if [[ -f "${ROOT}/src/server.ts" ]]; then
  report_violation "src/server.ts must be deleted (tools served only via Rust rmcp)"
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
const allowed = new Set(["rust_impl", "parity_proven", "authority_rust", "ts_deleted"]);
for (const id of toolIds) {
  const entry = ledger.capabilities.find((cap) => cap.id === id);
  if (!entry) { console.error(`missing ${id}`); process.exit(1); }
  if (!allowed.has(entry.state)) {
    console.error(`${id} is ${entry.state}; expected rust_impl+ or ts_deleted`);
    process.exit(1);
  }
}
const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
const httpTransport = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
if (!stdioRust || !allowed.has(stdioRust.state)) {
  console.error(`transport/stdio-rust-rmcp is ${stdioRust?.state ?? "missing"}; expected rust_impl+ or ts_deleted`);
  process.exit(1);
}
if (!httpTransport || !allowed.has(httpTransport.state)) {
  console.error(`transport/web-mcp-http is ${httpTransport?.state ?? "missing"}; expected rust_impl+ or ts_deleted`);
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
  grep -q 'resolve_rust_bin' "${BIN}" || report_violation "bin must resolve Rust via resolve_rust_bin"
  if grep -qE 'use_ts_transport|exec node' "${BIN}"; then
    report_violation "bin must not retain TS tool transport opt-in"
  fi
fi

if [[ -f "${RUST_LIB}" ]]; then
  for tool in consultant.review_decision consultant.research consultant.challenge_answer consultant.compare_options; do
    grep -q "$tool" "${RUST_LIB}" || report_violation "Rust lib must expose tool $tool"
  done
fi

if [[ -f "${RUST_CORE}" ]]; then
  grep -q 'run_consultation\|deliberat\|Consultation' "${RUST_CORE}" || report_violation "consultant-core engine must implement consultation"
fi

if [[ "${violations}" -gt 0 ]]; then
  echo "FAIL: ${violations} tools TS authority violation(s)."
  exit 1
fi
echo "PASS: four consultant tools delegate solely to Rust rmcp."