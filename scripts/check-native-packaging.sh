#!/usr/bin/env bash
# rej-010 rust_impl packaging gate: published npm tarballs must ship the prebuilt
# Rust MCP server at bin/native/consultant-mcp-server (staged via npm run build:rust).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="${ROOT}/bin/native/consultant-mcp-server"
GATE_TEST="${ROOT}/test/native-packaging.test.ts"
PACKAGE_JSON="${ROOT}/package.json"

violations=0

report_violation() {
  echo "VIOLATION: $*"
  violations=$((violations + 1))
}

echo "=== check-native-packaging $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${GATE_TEST}" ]]; then
  report_violation "missing test/native-packaging.test.ts"
fi

if ! grep -q '"check:native-packaging"' "${PACKAGE_JSON}"; then
  report_violation "package.json must expose check:native-packaging script"
fi

if ! grep -q 'bin/native' "${PACKAGE_JSON}"; then
  report_violation "package.json files must include bin/native for prebuilt Rust binary"
fi

if [[ ! -f "${NATIVE}" ]]; then
  report_violation "missing bin/native/consultant-mcp-server — run: npm run build:rust"
elif [[ ! -x "${NATIVE}" ]]; then
  report_violation "bin/native/consultant-mcp-server is not executable"
fi

if [[ "${violations}" -eq 0 ]]; then
  tmp="$(mktemp -d)"
  cleanup() { rm -rf "${tmp}"; }
  trap cleanup EXIT

  # Force-include gitignored staged native binary for npm pack.
  # npm respects .gitignore unless overridden; package.json "files" is not always enough
  # for nested gitignored paths on all npm versions.
  NPMIGNORE="${ROOT}/.npmignore"
  NPMIGNORE_CREATED=0
  if [[ ! -f "${NPMIGNORE}" ]]; then
    cat >"${NPMIGNORE}" <<'IGNORE'
# Generated for pack gate — do not re-ignore staged native binary.
# package.json "files" is the allowlist; keep gitignored bin/native packable.
node_modules/
target/
*.tgz
artifacts/
.env
.env.*
coverage/
.vitest/
.groundatlas*/
IGNORE
    NPMIGNORE_CREATED=1
  fi

  pack_out="$(cd "${ROOT}" && npm pack --pack-destination "${tmp}" 2>&1)" || {
    echo "$pack_out"
    report_violation "npm pack failed"
  }
  echo "$pack_out" | tail -n 5

  pkg_tgz="$(find "${tmp}" -maxdepth 1 -type f -name '*.tgz' | head -n 1 || true)"
  if [[ -z "${pkg_tgz}" || ! -f "${pkg_tgz}" ]]; then
    # Fallback: basename from npm pack stdout last line
    base="$(echo "$pack_out" | tail -n 1 | tr -d '[:space:]')"
    if [[ -n "$base" && -f "${tmp}/${base}" ]]; then
      pkg_tgz="${tmp}/${base}"
    fi
  fi

  if [[ -z "${pkg_tgz}" || ! -f "${pkg_tgz}" ]]; then
    report_violation "npm pack did not produce a tarball"
  else
    listing="$(tar -tzf "${pkg_tgz}" || true)"
    if ! printf '%s\n' "${listing}" | grep -E '(^|/)package/bin/native/consultant-mcp-server$' >/dev/null; then
      if ! printf '%s\n' "${listing}" | grep -E 'bin/native/consultant-mcp-server' >/dev/null; then
        echo "--- tarball listing (first 80) ---"
        printf '%s\n' "${listing}" | head -n 80
        report_violation "npm pack tarball missing package/bin/native/consultant-mcp-server"
      fi
    fi
    if ! printf '%s\n' "${listing}" | grep -E 'bin/sylphx-consultant-mcp' >/dev/null; then
      echo "--- tarball listing (first 80) ---"
      printf '%s\n' "${listing}" | head -n 80
      report_violation "npm pack tarball missing package/bin/sylphx-consultant-mcp"
    fi
  fi

  if [[ "${NPMIGNORE_CREATED}" -eq 1 ]]; then
    rm -f "${NPMIGNORE}"
  fi
fi

if [[ "${violations}" -gt 0 ]]; then
  echo "FAILED: ${violations} native packaging violation(s)."
  echo "Authority: crates/consultant-mcp-server via bin/native/consultant-mcp-server."
  exit 1
fi

echo "PASS: native Rust MCP server is staged and included in npm pack output."
