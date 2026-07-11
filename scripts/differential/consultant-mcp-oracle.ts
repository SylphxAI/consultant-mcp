#!/usr/bin/env bun
/**
 * TS contract oracle for consultant-mcp differential parity.
 *
 * Frozen baseline for rej-010 reproof:
 * - four typed MCP tool mock deliberation outputs (shared golden corpus)
 * - stdio/http transport routing contract (bin wrapper semantics)
 * - rmcp surface markers (stdio + streamable HTTP)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConsultation } from "../../src/engine.ts";
import { hashRequest } from "../../src/policy.ts";
import { MockModelClient } from "../../src/providers/openrouter.ts";
import type { ConsultationRequest, ConsultationResult, ConsultantConfig } from "../../src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const CORPUS_PATH = join(__dirname, "fixtures/consultant-mcp-corpus.json");
const PARITY_DIR = join(REPO_ROOT, "test/fixtures/parity");
const GOLDEN_DIR = join(REPO_ROOT, "test/fixtures/golden");

interface TransportContractCase {
  id: string;
  env: Record<string, string>;
  expect: { transport: string };
}

interface SurfaceContractCase {
  id: string;
  surface: "bin" | "stdio" | "stdioModule" | "http";
  markers: string[];
}

interface ToolCase {
  id: string;
  tool: string;
  requestKey: string;
  fixture: string;
}

interface StdioProbeCase {
  id: string;
  kind: "initialize" | "toolsList" | "toolCall";
  tool?: string;
  requestKey?: string;
  expect: Record<string, unknown>;
}

interface HttpProbeCase {
  id: string;
  kind: "health" | "initialize" | "toolsList" | "toolCall";
  path?: string;
  tool?: string;
  requestKey?: string;
  expect: Record<string, unknown>;
}

interface Corpus {
  corpusVersion: number;
  transportContractCases: TransportContractCase[];
  surfaceContractCases: SurfaceContractCase[];
  toolCases: ToolCase[];
  stdioProbeCases?: StdioProbeCase[];
  httpProbeCases?: HttpProbeCase[];
  serverContract: {
    name: string;
    tools: string[];
  };
}

export interface DifferentialCase {
  readonly id: string;
  readonly domain:
    | "tool"
    | "transportContract"
    | "surfaceContract"
    | "serverContract"
    | "stdioProbe"
    | "httpProbe";
  readonly input: Record<string, unknown>;
  readonly output: unknown;
}

function resolveTransport(env: Record<string, string | undefined>): string {
  if (env.CONSULTANT_MCP_TRANSPORT) {
    return env.CONSULTANT_MCP_TRANSPORT;
  }
  if (env.MCP_TRANSPORT) {
    return env.MCP_TRANSPORT;
  }
  return "stdio";
}

function normalizeResult(result: ConsultationResult): ConsultationResult {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

function expectedWithRequestHash(
  expected: ConsultationResult,
  request: ConsultationRequest
): ConsultationResult {
  return {
    ...expected,
    consultationId: `consult_${hashRequest(request)}_NORMALIZED`
  };
}

function parityConfig(): ConsultantConfig {
  return JSON.parse(
    readFileSync(join(PARITY_DIR, "config.json"), "utf8")
  ) as ConsultantConfig;
}

function surfaceFile(surface: SurfaceContractCase["surface"]): string {
  switch (surface) {
    case "bin":
      return join(REPO_ROOT, "bin/sylphx-consultant-mcp");
    case "stdio":
      return join(REPO_ROOT, "crates/consultant-mcp-server/src/main.rs");
    case "stdioModule":
      return join(REPO_ROOT, "crates/consultant-mcp-server/src/stdio_transport.rs");
    case "http":
      return join(REPO_ROOT, "crates/consultant-mcp-server/src/http_transport.rs");
  }
}

function surfaceMarkers(surface: SurfaceContractCase): Record<string, boolean> {
  const content = readFileSync(surfaceFile(surface.surface), "utf8");
  const markers: Record<string, boolean> = {};
  for (const marker of surface.markers) {
    markers[marker] = content.includes(marker);
  }
  return markers;
}

function fixtureCorpusHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function main(): Promise<void> {
  const raw = await readFile(CORPUS_PATH, "utf8");
  const corpus = JSON.parse(raw) as Corpus;
  if (corpus.corpusVersion !== 1) {
    throw new Error(`unsupported corpusVersion: ${corpus.corpusVersion}`);
  }

  const parityRequests = JSON.parse(
    await readFile(join(PARITY_DIR, "requests.json"), "utf8")
  ) as Record<string, ConsultationRequest>;
  const config = parityConfig();
  const client = new MockModelClient();
  const packageJson = JSON.parse(
    await readFile(join(REPO_ROOT, "package.json"), "utf8")
  ) as { version: string };

  const cases: DifferentialCase[] = [];

  for (const testCase of corpus.transportContractCases) {
    cases.push({
      id: testCase.id,
      domain: "transportContract",
      input: { env: testCase.env },
      output: { transport: resolveTransport(testCase.env) }
    });
  }

  for (const testCase of corpus.surfaceContractCases) {
    cases.push({
      id: testCase.id,
      domain: "surfaceContract",
      input: { surface: testCase.surface, markers: testCase.markers },
      output: { markers: surfaceMarkers(testCase) }
    });
  }

  cases.push({
    id: "server-contract-rmcp",
    domain: "serverContract",
    input: { tools: corpus.serverContract.tools },
    output: {
      name: corpus.serverContract.name,
      version: packageJson.version,
      tools: corpus.serverContract.tools
    }
  });

  for (const testCase of corpus.stdioProbeCases ?? []) {
    cases.push({
      id: testCase.id,
      domain: "stdioProbe",
      input: {
        kind: testCase.kind,
        ...(testCase.tool ? { tool: testCase.tool } : {}),
        ...(testCase.requestKey ? { requestKey: testCase.requestKey } : {})
      },
      output: testCase.expect
    });
  }

  for (const probe of corpus.httpProbeCases ?? []) {
    cases.push({
      id: probe.id,
      domain: "httpProbe",
      input: {
        kind: probe.kind,
        ...(probe.path ? { path: probe.path } : {}),
        ...(probe.tool ? { tool: probe.tool } : {}),
        ...(probe.requestKey ? { requestKey: probe.requestKey } : {})
      },
      output: probe.expect
    });
  }

  for (const testCase of corpus.toolCases) {
    const request = parityRequests[testCase.requestKey];
    if (!request) {
      throw new Error(`missing parity request ${testCase.requestKey}`);
    }
    const golden = JSON.parse(
      await readFile(join(GOLDEN_DIR, testCase.fixture), "utf8")
    ) as ConsultationResult;
    const expected = expectedWithRequestHash(golden, request);
    const actual = normalizeResult(await runConsultation(request, client, config));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `TS oracle tool mismatch for ${testCase.id}: actual does not match golden baseline`
      );
    }
    cases.push({
      id: testCase.id,
      domain: "tool",
      input: { tool: testCase.tool, requestKey: testCase.requestKey },
      output: actual
    });
  }

  const payload = {
    corpusVersion: corpus.corpusVersion,
    fixtureCorpusHash: fixtureCorpusHash(raw),
    cases
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

await main();