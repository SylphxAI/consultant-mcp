import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("native Rust packaging gate (S5 rej-010 rust_impl)", () => {
  it("check-native-packaging gate script exists and enforces prebuilt binary", () => {
    const script = readText("scripts/check-native-packaging.sh");

    expect(script).toContain("check-native-packaging");
    expect(script).toContain("bin/native/consultant-mcp-server");
    expect(script).toContain("npm run build:rust");
    expect(script).toContain("npm pack");
    expect(script).toContain("package/bin/native/consultant-mcp-server");
    expect(script).toContain("rej-010");
  });

  it("package.json publishes bin/native and wires packaging checks", () => {
    const pkg = JSON.parse(readText("package.json")) as {
      files: string[];
      scripts: Record<string, string>;
    };

    expect(pkg.files).toContain("bin");
    expect(pkg.files).toContain("bin/native");
    expect(pkg.scripts["build:rust"]).toContain("stage-rust-mcp.ts");
    expect(pkg.scripts["check:native-packaging"]).toContain(
      "check-native-packaging.sh"
    );
    expect(pkg.scripts["pack:beta"]).toContain("check:native-packaging");
    expect(pkg.scripts.prepublishOnly).toContain("build:rust");
    expect(pkg.scripts.verify).toContain("pack:beta");
  });

  it("bin wrapper resolves staged native binary before target/ fallbacks", () => {
    const bin = readText("bin/sylphx-consultant-mcp");

    expect(bin).toContain('"$ROOT/bin/native/consultant-mcp-server"');
    expect(bin).toContain("Prebuilt Rust binary not found");
    // Residual TS opt-in (CONSULTANT_MCP_TRANSPORT=ts) uses node dist/server.js — dual-path rust_impl.
    expect(bin).toContain("use_ts_transport");
    expect(bin).toContain("dist/server.js");
  });

  it("stage-rust-mcp copies release binary into bin/native", () => {
    const stage = readText("scripts/stage-rust-mcp.ts");

    expect(stage).toContain("target/release/consultant-mcp-server");
    expect(stage).toContain("bin/native");
    expect(existsSync(path.join(repoRoot, "scripts/stage-rust-mcp.ts"))).toBe(
      true
    );
  });

  it("release workflow builds Rust before verify/publish", () => {
    const workflow = readText(".github/workflows/release.yml");

    expect(workflow).toContain("dtolnay/rust-toolchain@stable");
    expect(workflow).toContain("npm run build:rust");
    expect(workflow).toContain("bin/native/consultant-mcp-server");
  });

  it("migration ledger keeps stdio transport at rust_impl with packaging prod probe", () => {
    const ledger = JSON.parse(
      readText("docs/specs/consultant-mcp-migration-ledger.json")
    ) as {
      capabilities: Array<{ id: string; state: string; prodProbe?: string }>;
    };

    const stdioRust = ledger.capabilities.find(
      (capability) => capability.id === "transport/stdio-rust-rmcp"
    );
    expect(stdioRust?.state).toBe("rust_impl");
    expect(stdioRust?.prodProbe).toContain("check:native-packaging");
  });
});