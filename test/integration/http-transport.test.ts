/**
 * Integration test for consultant MCP server with HTTP transport (Rust rmcp).
 * Proves streamable HTTP initialize, tools/list, auth, health, and golden mock parity.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashRequest } from "../../src/policy.js";
import type { ConsultationRequest, ConsultationResult } from "../../src/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const binWrapper = path.join(repoRoot, "bin/sylphx-consultant-mcp");
const RUST_HTTP_READY = "Streamable HTTP MCP listening on http://";
const TEST_HOST = "127.0.0.1";

const parityRequests = JSON.parse(
  readFileSync(path.join(repoRoot, "test/fixtures/parity/requests.json"), "utf8")
) as Record<string, ConsultationRequest>;

const goldenDir = path.join(repoRoot, "test/fixtures/golden");

const parityMatrix = [
  {
    tool: "consultant.review_decision",
    requestKey: "review_decision",
    fixture: "review_decision_mock.json"
  },
  { tool: "consultant.research", requestKey: "research", fixture: "research_mock.json" },
  {
    tool: "consultant.challenge_answer",
    requestKey: "challenge_answer",
    fixture: "challenge_answer_mock.json"
  },
  {
    tool: "consultant.compare_options",
    requestKey: "compare_options",
    fixture: "compare_options_mock.json"
  }
] as const;

const TOOL_NAMES = parityMatrix.map((entry) => entry.tool);

const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8")
) as { version: string };

let baseUrl: string;

const getFreePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, TEST_HOST, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) {
          resolve(address.port);
        } else {
          reject(new Error("Failed to allocate a test HTTP port"));
        }
      });
    });
  });

const streamableHttpHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream"
};

const parseMcpResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (contentType.includes("application/json")) {
    return JSON.parse(body) as Record<string, unknown>;
  }

  const dataLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0);

  const payload = dataLines.at(-1);
  if (!payload) {
    throw new SyntaxError(`No MCP JSON payload in streamable HTTP response: ${body.slice(0, 200)}`);
  }
  return JSON.parse(payload) as Record<string, unknown>;
};

const createMcpHttpClient = () => {
  let sessionHeaders: Record<string, string> = { ...streamableHttpHeaders };

  const postMcp = async (body: Record<string, unknown>) => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify(body)
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) {
      sessionHeaders = { ...sessionHeaders, "mcp-session-id": sessionId };
    }
    return response;
  };

  const sendRequest = async (method: string, params?: unknown, id = 1) => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id,
      method,
      params
    });
    return parseMcpResponse(response);
  };

  const sendNotification = async (method: string, params?: unknown) => {
    await postMcp({
      jsonrpc: "2.0",
      method,
      params
    });
  };

  const initializeSession = async () => {
    await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-http-client", version: "1.0.0" }
    });
    await sendNotification("notifications/initialized");
  };

  return { sendRequest, sendNotification, initializeSession };
};

const waitForRustHttpServer = (serverProc: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Rust HTTP MCP server startup timeout"));
    }, 30_000);

    const onReady = (output: string) => {
      if (output.includes(RUST_HTTP_READY)) {
        clearTimeout(timeout);
        setTimeout(resolve, 200);
      }
    };

    serverProc.stdout?.on("data", (data) => onReady(data.toString()));
    serverProc.stderr?.on("data", (data) => onReady(data.toString()));
  });

function normalizeResult(result: ConsultationResult): ConsultationResult {
  return {
    ...result,
    consultationId: result.consultationId.replace(/_[a-f0-9]{8}$/, "_NORMALIZED"),
    providerTrace: { ...result.providerTrace, latencyMs: 0 },
    panel: result.panel.map((entry) => ({ ...entry, latencyMs: 0 }))
  };
}

describe("MCP Server HTTP Transport Integration (Rust rmcp)", () => {
  let serverProc: ChildProcess;

  beforeAll(async () => {
    execSync("npm run build:rust", { cwd: repoRoot, stdio: "pipe", timeout: 300_000 });

    const testPort = await getFreePort();
    baseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        CONSULTANT_MOCK: "true",
        MCP_TRANSPORT: "http",
        MCP_HTTP_PORT: testPort.toString(),
        MCP_HTTP_HOST: TEST_HOST
      }
    });

    await waitForRustHttpServer(serverProc);
  }, 300_000);

  afterAll(() => {
    serverProc?.kill("SIGTERM");
  });

  it("responds to health check", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { status?: string };
    expect(data.status).toBe("ok");
  });

  it("responds to initialize request over HTTP", async () => {
    const client = createMcpHttpClient();
    const response = await client.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-http-client", version: "1.0.0" }
    });

    expect(response.id).toBe(1);
    const serverInfo = (response.result as { serverInfo?: { name?: string; version?: string } })
      ?.serverInfo;
    expect(serverInfo?.name).toBe("sylphx-consultant-mcp");
    expect(serverInfo?.version).toBe(packageJson.version);
  });

  it("lists all four consultant tools over HTTP", async () => {
    const client = createMcpHttpClient();
    await client.initializeSession();

    const response = await client.sendRequest("tools/list", {}, 2);

    expect(response.id).toBe(2);
    const tools = (response.result as { tools?: Array<{ name: string }> })?.tools;
    expect(tools).toBeDefined();
    const toolNames = tools?.map((tool) => tool.name) ?? [];
    for (const toolName of TOOL_NAMES) {
      expect(toolNames).toContain(toolName);
    }
  });

  for (const [index, { tool, requestKey, fixture }] of parityMatrix.entries()) {
    it(`${tool} golden mock parity over HTTP`, async () => {
      const client = createMcpHttpClient();
      await client.initializeSession();

      const request = parityRequests[requestKey];
      const golden = JSON.parse(
        readFileSync(path.join(goldenDir, fixture), "utf8")
      ) as ConsultationResult;
      const expected = normalizeResult({
        ...golden,
        consultationId: `consult_${hashRequest(request)}_NORMALIZED`
      });

      const response = await client.sendRequest(
        "tools/call",
        {
          name: tool,
          arguments: request
        },
        3 + index
      );

      expect(response.id).toBe(3 + index);
      const result = response.result as {
        isError?: boolean;
        structuredContent?: ConsultationResult;
      };
      expect(result?.isError).not.toBe(true);
      expect(normalizeResult(result?.structuredContent as ConsultationResult)).toEqual(expected);
    });
  }

  it("does not return wildcard CORS headers by default", async () => {
    const response = await fetch(baseUrl, {
      method: "OPTIONS",
      headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "POST"
      }
    });

    const corsHeader = response.headers.get("Access-Control-Allow-Origin");
    expect(corsHeader).not.toBe("*");
  });
});

describe("MCP Server HTTP Transport Authentication (Rust rmcp)", () => {
  const API_KEY = "test-secret-key-123";
  let serverProc: ChildProcess;
  let authBaseUrl: string;

  beforeAll(async () => {
    execSync("npm run build:rust", { cwd: repoRoot, stdio: "pipe", timeout: 300_000 });

    const testPort = await getFreePort();
    authBaseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        CONSULTANT_MOCK: "true",
        MCP_TRANSPORT: "http",
        MCP_HTTP_PORT: testPort.toString(),
        MCP_HTTP_HOST: TEST_HOST,
        MCP_API_KEY: API_KEY
      }
    });

    await waitForRustHttpServer(serverProc);
  }, 300_000);

  afterAll(() => {
    serverProc?.kill("SIGTERM");
  });

  const initialize = (headers: Record<string, string>) =>
    fetch(authBaseUrl, {
      method: "POST",
      headers: { ...streamableHttpHeaders, ...headers },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "auth-test-client", version: "1.0.0" }
        }
      })
    });

  it("rejects requests with no X-API-Key header (401)", async () => {
    const response = await initialize({});
    expect(response.status).toBe(401);
    const data = (await response.json()) as { error?: { message?: string } };
    expect(data.error?.message).toContain("X-API-Key");
  });

  it("rejects requests with a wrong X-API-Key (401)", async () => {
    const response = await initialize({ "X-API-Key": "wrong-key" });
    expect(response.status).toBe(401);
  });

  it("accepts requests carrying the correct X-API-Key", async () => {
    const response = await initialize({ "X-API-Key": API_KEY });
    expect(response.status).toBe(200);
    const data = await parseMcpResponse(response);
    const serverInfo = (data.result as { serverInfo?: { name?: string } })?.serverInfo;
    expect(serverInfo?.name).toBe("sylphx-consultant-mcp");
  });

  it("keeps the health endpoint open without a key", async () => {
    const response = await fetch(`${authBaseUrl}/health`);
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { status?: string };
    expect(data.status).toBe("ok");
  });
});