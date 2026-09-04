/**
 * Integration test for consultant MCP server with HTTP transport (Rust rmcp).
 * Proves streamable HTTP initialize, tools/list, auth, health, and golden mock parity.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { hashRequest } from "../../src/policy.js";
import type { ConsultationRequest, ConsultationResult } from "../../src/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const binWrapper = path.join(repoRoot, "bin/sylphx-consultant-mcp");
const stagedRustBin = path.join(repoRoot, "bin/native/consultant-mcp-server");
// Pin the candidate binary. After bun install the launcher prefers published optionalDep.
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
let testPort: number;

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

const initializeParams = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "test-http-client", version: "1.0.0" }
};

const decodeChunkedBody = (chunked: string): string => {
  let rest = chunked;
  let body = "";
  while (rest.length > 0) {
    const lineEnd = rest.indexOf("\r\n");
    if (lineEnd < 0) {
      break;
    }
    const size = Number.parseInt(rest.slice(0, lineEnd), 16);
    if (!Number.isFinite(size) || size < 0) {
      break;
    }
    if (size === 0) {
      break;
    }
    const dataStart = lineEnd + 2;
    body += rest.slice(dataStart, dataStart + size);
    rest = rest.slice(dataStart + size + 2);
  }
  return body;
};

const parseRawHttpResponse = (raw: string): { status: number; contentType: string; body: string } => {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    throw new SyntaxError(`Incomplete HTTP response: ${raw.slice(0, 200)}`);
  }
  const headerText = raw.slice(0, headerEnd);
  let body = raw.slice(headerEnd + 4);
  const lines = headerText.split("\r\n");
  const status = Number(lines[0]?.split(" ")[1] ?? 0);
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }
  }
  const contentType = headers.get("content-type") ?? "";
  if ((headers.get("transfer-encoding") ?? "").toLowerCase().includes("chunked")) {
    body = decodeChunkedBody(body);
  }
  return { status, contentType, body };
};

// Raw HTTP/1.1 so the Host header is on the wire. Bun fetch/node:http may drop Host,
// which makes rmcp fall back to the loopback :authority and falsely return 200.
const postMcpWithHost = (
  port: number,
  hostHeader: string,
  body: Record<string, unknown>
): Promise<{ status: number; contentType: string; body: string }> =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = [
      "POST /mcp HTTP/1.1",
      `Host: ${hostHeader}`,
      "Content-Type: application/json",
      "Accept: application/json, text/event-stream",
      `Content-Length: ${Buffer.byteLength(payload)}`,
      "Connection: close",
      "",
      payload
    ].join("\r\n");

    const socket = net.createConnection({ host: TEST_HOST, port });
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out waiting for MCP HTTP response with Host ${hostHeader}`));
    }, 10_000);

    socket.on("connect", () => {
      socket.write(request);
    });
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    socket.on("end", () => {
      clearTimeout(timeout);
      try {
        resolve(parseRawHttpResponse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const parseMcpPayload = (contentType: string, body: string) => {
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
    execSync("bun run build:rust", { cwd: repoRoot, stdio: "pipe", timeout: 300_000 });

    testPort = await getFreePort();
    baseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        CONSULTANT_MOCK: "true",
        CONSULTANT_MCP_RUST_BIN: stagedRustBin,
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

  it("rejects Streamable HTTP initialize when Host is not on the allowlist", async () => {
    const denied = await postMcpWithHost(testPort, "evil.example", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: initializeParams
    });
    expect(denied.status).toBe(403);
    expect(denied.body).toContain("Host header is not allowed");
  });

  it("still initializes Streamable HTTP when Host is the loopback bind", async () => {
    const allowed = await postMcpWithHost(testPort, `${TEST_HOST}:${String(testPort)}`, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: initializeParams
    });
    expect(allowed.status).toBe(200);
    const data = parseMcpPayload(allowed.contentType, allowed.body);
    const serverInfo = (data.result as { serverInfo?: { name?: string; version?: string } })
      ?.serverInfo;
    expect(serverInfo?.name).toBe("sylphx-consultant-mcp");
    expect(serverInfo?.version).toBe(packageJson.version);
  });

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
    execSync("bun run build:rust", { cwd: repoRoot, stdio: "pipe", timeout: 300_000 });

    const testPort = await getFreePort();
    authBaseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        CONSULTANT_MOCK: "true",
        CONSULTANT_MCP_RUST_BIN: stagedRustBin,
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
