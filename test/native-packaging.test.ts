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

  it("bin wrapper is arch-aware and resolves optionalDep before staged native", () => {
    const bin = readText("bin/sylphx-consultant-mcp");

    expect(bin).toContain("resolve_from_optional_dep");
    expect(bin).toContain("@sylphx/consultant-mcp-darwin-arm64");
    expect(bin).toContain("@sylphx/consultant-mcp-linux-x64-gnu");
    expect(bin).toContain("is_runnable_native");
    expect(bin).toContain('"$ROOT/bin/native/consultant-mcp-server"');
    expect(bin).toContain("No runnable Rust MCP server");
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

  it("release workflow builds multi-arch natives then assembles before publish", () => {
    const workflow = readText(".github/workflows/release.yml");

    expect(workflow).toContain("dtolnay/rust-toolchain@stable");
    expect(workflow).toContain("npm run build:rust");
    expect(workflow).toContain("bin/native/consultant-mcp-server");
    expect(workflow).toContain("assemble:multiarch");
    expect(workflow).toContain("consultant-native-");
    expect(workflow).toContain("Publish platform packages");
    expect(workflow).toContain("verify:multiarch-readback");
  });

  it("declares multi-arch optionalDependencies platform packages", () => {
    const pkg = JSON.parse(readText("package.json")) as {
      version: string;
      optionalDependencies?: Record<string, string>;
    };
    const optional = pkg.optionalDependencies ?? {};
    for (const name of [
      "@sylphx/consultant-mcp-darwin-arm64",
      "@sylphx/consultant-mcp-darwin-x64",
      "@sylphx/consultant-mcp-linux-x64-gnu",
      "@sylphx/consultant-mcp-linux-arm64-gnu",
    ]) {
      expect(optional[name]).toBe(pkg.version);
      const platformKey = name.replace("@sylphx/consultant-mcp-", "");
      const platformPkg = JSON.parse(
        readText(`npm/${platformKey}/package.json`)
      ) as { name: string; version: string; os: string[]; cpu: string[] };
      expect(platformPkg.name).toBe(name);
      expect(platformPkg.version).toBe(pkg.version);
      expect(platformPkg.os.length).toBeGreaterThan(0);
      expect(platformPkg.cpu.length).toBeGreaterThan(0);
    }
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