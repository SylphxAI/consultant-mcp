#!/usr/bin/env bash
# Consultant MCP differential parity — TS contract oracle vs native Rust rmcp SSOT.
# Fail-closed: requires bun (no SKIP-as-pass).
# See PARITY-VERIFICATION-STANDARD.md, DECISION-001 / rej-010.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="${SCRATCH_DIR:-/tmp/consultant-mcp-differential}"
mkdir -p "$SCRATCH"
LOG="$SCRATCH/differential.log"
ARTIFACT="$SCRATCH/verification.json"
ORACLE_JSON="$SCRATCH/oracle.json"
: >"$LOG"

cd "$REPO_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "::error::bun required for consultant-mcp differential parity — no SKIP-as-pass" | tee -a "$LOG"
  exit 1
fi

echo "=== consultant-mcp differential parity $(date -Iseconds) ===" | tee -a "$LOG"

echo "--- build TypeScript library (oracle imports src/) ---" | tee -a "$LOG"
npm run build 2>&1 | tee -a "$LOG"

echo "--- build Rust rmcp server ---" | tee -a "$LOG"
npm run build:rust 2>&1 | tee -a "$LOG"

echo "--- check-no-ts-tools-backend gate ---" | tee -a "$LOG"
bash "$REPO_ROOT/scripts/check-no-ts-tools-backend.sh" 2>&1 | tee -a "$LOG"

echo "--- check-no-ts-stdio-backend gate ---" | tee -a "$LOG"
bash "$REPO_ROOT/scripts/check-no-ts-stdio-backend.sh" 2>&1 | tee -a "$LOG"

echo "--- check-no-ts-http-backend gate ---" | tee -a "$LOG"
bash "$REPO_ROOT/scripts/check-no-ts-http-backend.sh" 2>&1 | tee -a "$LOG"

echo "--- TS contract oracle (4 tools + stdio/http transport contract) ---" | tee -a "$LOG"
bun run "$REPO_ROOT/scripts/differential/consultant-mcp-oracle.ts" >"$ORACLE_JSON" 2>>"$LOG"

echo "--- Rust native differential test ---" | tee -a "$LOG"
CONSULTANT_MCP_ORACLE_JSON="$ORACLE_JSON" \
  cargo test -p consultant-core --test consultant_mcp_differential -- --nocapture 2>&1 | tee -a "$LOG"

CANDIDATE_SHA="${CANDIDATE_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)}"
BASELINE_TS_SHA="$(git -C "$REPO_ROOT" log -1 --format=%H -- scripts/differential src/engine.ts src/policy.ts 2>/dev/null || echo unknown)"
RUST_SHA="$CANDIDATE_SHA"
BEHAVIOR_SPEC_HASH="$(sha256sum "$REPO_ROOT/scripts/differential/fixtures/consultant-mcp-corpus.json" 2>/dev/null | awk '{print $1}' || echo missing)"
FIXTURE_CORPUS_HASH="$(jq -r '.fixtureCorpusHash' "$ORACLE_JSON")"
CASE_COUNT="$(jq '.cases | length' "$ORACLE_JSON")"
HTTP_PROBE_CASE_COUNT="$(jq '[.cases[] | select(.domain == "httpProbe")] | length' "$ORACLE_JSON")"

jq -n \
  --arg verifiedAt "$(date -Iseconds)" \
  --arg candidateSha "$CANDIDATE_SHA" \
  --arg baselineTsSha "$BASELINE_TS_SHA" \
  --arg rustCandidateSha "$RUST_SHA" \
  --arg behaviorSpecHash "$BEHAVIOR_SPEC_HASH" \
  --arg fixtureCorpusHash "$FIXTURE_CORPUS_HASH" \
  --argjson caseCount "$CASE_COUNT" \
  --argjson httpProbeCaseCount "$HTTP_PROBE_CASE_COUNT" \
  '{
    schemaVersion: 2,
    slice: "consultant-mcp.tools|transport.stdio|transport.http",
    status: "differential_green",
    verifiedAt: $verifiedAt,
    lastComparedMainSha: $candidateSha,
    mergeGroupSha: $candidateSha,
    baselineTsSha: $baselineTsSha,
    rustCandidateSha: $rustCandidateSha,
    behaviorSpecHash: $behaviorSpecHash,
    fixtureCorpusHash: $fixtureCorpusHash,
    caseCount: $caseCount,
    httpProbeCaseCount: $httpProbeCaseCount,
    harness: "scripts/run-consultant-mcp-differential.sh",
    differentialTest: "crates/consultant-core/tests/consultant_mcp_differential.rs#consultant_mcp_differential_matches_ts_oracle",
    oracle: "scripts/differential/consultant-mcp-oracle.ts"
  }' >"$ARTIFACT"

echo "consultant-mcp-differential: OK (cases=$CASE_COUNT httpProbe=$HTTP_PROBE_CASE_COUNT corpus=$FIXTURE_CORPUS_HASH)" | tee -a "$LOG"
echo "verification artifact: $ARTIFACT" | tee -a "$LOG"