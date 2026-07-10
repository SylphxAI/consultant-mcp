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
	trap 'rm -rf "${tmp}"' EXIT
	pkg_tgz="$(cd "${ROOT}" && npm pack --pack-destination "${tmp}" --silent)"
	if [[ ! -f "${pkg_tgz}" ]]; then
		report_violation "npm pack did not produce a tarball"
	else
		if ! tar -tzf "${pkg_tgz}" | grep -qx 'package/bin/native/consultant-mcp-server'; then
			report_violation "npm pack tarball missing package/bin/native/consultant-mcp-server"
		fi
		if ! tar -tzf "${pkg_tgz}" | grep -qx 'package/bin/sylphx-consultant-mcp'; then
			report_violation "npm pack tarball missing package/bin/sylphx-consultant-mcp"
		fi
	fi
fi

if [[ "${violations}" -gt 0 ]]; then
	echo "FAILED: ${violations} native packaging violation(s)."
	echo "Authority: crates/consultant-mcp-server via bin/native/consultant-mcp-server."
	exit 1
fi

echo "PASS: native Rust MCP server is staged and included in npm pack output."