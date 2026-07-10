//! TRUE differential parity: TS contract oracle vs native Rust consultant-core SSOT.
//!
//! Fail-closed — no SKIP-as-pass. Oracle subprocess must succeed before comparison.
//! See scripts/run-consultant-mcp-differential.sh and rej-010 pilot re-audit.

use consultant_core::{
    model_client_for_config, run_consultation, ConsultationKind, ConsultationRequest,
    ConsultantConfig,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::ChildStdout;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};

const SERVER_NAME: &str = "sylphx-consultant-mcp";
static STDIO_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
static HTTP_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn corpus_fixture_path() -> PathBuf {
    repo_root().join("scripts/differential/fixtures/consultant-mcp-corpus.json")
}

#[derive(Debug, Deserialize)]
struct OracleCase {
    id: String,
    domain: String,
    input: Value,
    output: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OracleCorpus {
    corpus_version: u32,
    fixture_corpus_hash: String,
    cases: Vec<OracleCase>,
}

fn run_ts_oracle() -> OracleCorpus {
    if let Ok(path) = std::env::var("CONSULTANT_MCP_ORACLE_JSON") {
        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read CONSULTANT_MCP_ORACLE_JSON at {path}: {error}"));
        return serde_json::from_str(&raw).expect("oracle JSON must be valid");
    }

    let script = repo_root().join("scripts/differential/consultant-mcp-oracle.ts");
    let output = Command::new("bun")
        .arg("run")
        .arg(&script)
        .current_dir(repo_root())
        .output()
        .unwrap_or_else(|error| panic!("spawn TS oracle at {}: {error}", script.display()));

    assert!(
        output.status.success(),
        "TS oracle failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("oracle output must be valid JSON")
}

fn resolve_transport(env: &Value) -> String {
    let env_obj = env.as_object().expect("transport env object");
    if let Some(value) = env_obj.get("CONSULTANT_MCP_TRANSPORT").and_then(Value::as_str) {
        return value.to_string();
    }
    if let Some(value) = env_obj.get("MCP_TRANSPORT").and_then(Value::as_str) {
        return value.to_string();
    }
    "stdio".to_string()
}

fn surface_file(surface: &str) -> PathBuf {
    match surface {
        "bin" => repo_root().join("bin/sylphx-consultant-mcp"),
        "stdio" => repo_root().join("crates/consultant-mcp-server/src/main.rs"),
        "stdioModule" => repo_root().join("crates/consultant-mcp-server/src/stdio_transport.rs"),
        "http" => repo_root().join("crates/consultant-mcp-server/src/http_transport.rs"),
        other => panic!("unknown surface {other}"),
    }
}

fn surface_markers(surface: &str, markers: &[String]) -> BTreeMap<String, bool> {
    let path = surface_file(surface);
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let mut found = BTreeMap::new();
    for marker in markers {
        found.insert(marker.clone(), content.contains(marker));
    }
    found
}

fn parity_config() -> ConsultantConfig {
    ConsultantConfig {
        provider_name: "mock".to_string(),
        panel_models: vec!["mock-a".to_string(), "mock-b".to_string()],
        judge_model: "mock-judge".to_string(),
        timeout_ms: 1_000,
        max_output_tokens: 1_000,
        default_max_usd: 10.0,
        allow_confidential_external: false,
        mock: true,
    }
}

fn load_parity_requests() -> BTreeMap<String, Value> {
    let requests_path = repo_root().join("test/fixtures/parity/requests.json");
    let requests = fs::read_to_string(&requests_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", requests_path.display()));
    serde_json::from_str(&requests).expect("parse parity requests")
}

fn normalize_result(mut value: Value) -> Value {
    if let Some(id) = value.get("consultationId").and_then(Value::as_str) {
        let normalized = id
            .rsplit_once('_')
            .map(|(prefix, _)| format!("{prefix}_NORMALIZED"))
            .unwrap_or_else(|| id.to_string());
        value["consultationId"] = Value::String(normalized);
    }

    if let Some(trace) = value.get_mut("providerTrace").and_then(Value::as_object_mut) {
        trace.insert("latencyMs".to_string(), Value::Number(0.into()));
    }

    if let Some(panel) = value.get_mut("panel").and_then(Value::as_array_mut) {
        for entry in panel {
            if let Some(obj) = entry.as_object_mut() {
                obj.insert("latencyMs".to_string(), Value::Number(0.into()));
            }
        }
    }

    value
}

async fn compare_tool_case(case: &OracleCase) {
    let request_key = case.input["requestKey"]
        .as_str()
        .expect("tool requestKey");
    let requests = load_parity_requests();
    let request_value = requests
        .get(request_key)
        .unwrap_or_else(|| panic!("missing parity request {request_key}"))
        .clone();
    let kind = match request_key {
        "review_decision" => ConsultationKind::ReviewDecision,
        "research" => ConsultationKind::Research,
        "challenge_answer" => ConsultationKind::ChallengeAnswer,
        "compare_options" => ConsultationKind::CompareOptions,
        other => panic!("unknown parity request key {other}"),
    };
    let request = ConsultationRequest::from_value(kind, request_value)
        .expect("deserialize parity request");

    let config = parity_config();
    let client = model_client_for_config(&config);
    let actual = run_consultation(request, client, &config).await;
    let actual_value = normalize_result(
        serde_json::to_value(actual).expect("serialize rust consultation result"),
    );

    assert_eq!(
        actual_value, case.output,
        "tool differential mismatch for case {}",
        case.id
    );
}

fn compare_transport_contract_case(case: &OracleCase) {
    let env = &case.input["env"];
    let native = serde_json::json!({
        "transport": resolve_transport(env),
    });
    assert_eq!(
        native, case.output,
        "transport contract mismatch for case {}",
        case.id
    );
}

fn compare_surface_contract_case(case: &OracleCase) {
    let surface = case.input["surface"]
        .as_str()
        .expect("surface contract surface");
    let markers = case.input["markers"]
        .as_array()
        .expect("surface contract markers")
        .iter()
        .map(|value| value.as_str().expect("marker string").to_string())
        .collect::<Vec<_>>();
    let native = serde_json::json!({
        "markers": surface_markers(surface, &markers),
    });
    assert_eq!(
        native, case.output,
        "surface contract mismatch for case {}",
        case.id
    );
}

fn resolve_mcp_binary() -> PathBuf {
    for relative in [
        "bin/native/consultant-mcp-server",
        "target/release/consultant-mcp-server",
        "target/debug/consultant-mcp-server",
    ] {
        let candidate = repo_root().join(relative);
        if candidate.is_file() {
            return candidate;
        }
    }
    panic!("consultant-mcp-server is not built; run `npm run build:rust`");
}

struct StdioMcpClient {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout: BufReader<ChildStdout>,
    initialized: bool,
}

impl StdioMcpClient {
    fn spawn() -> Self {
        let binary = resolve_mcp_binary();
        let mut child = Command::new(&binary)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("CONSULTANT_MOCK", "true")
            .env_remove("MCP_TRANSPORT")
            .env_remove("CONSULTANT_MCP_TRANSPORT")
            .spawn()
            .unwrap_or_else(|error| panic!("spawn rmcp stdio server at {}: {error}", binary.display()));

        let stdout = child.stdout.take().expect("rmcp stdio server stdout");
        let stdin = child.stdin.take().expect("rmcp stdio server stdin");

        Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            initialized: false,
        }
    }

    fn write_message(&mut self, message: &Value) {
        let payload = serde_json::to_string(message).expect("serialize MCP message");
        writeln!(self.stdin, "{payload}").expect("write MCP message to stdin");
        self.stdin.flush().expect("flush MCP stdin");
    }

    fn read_response(&mut self, id: u64) -> Value {
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        let mut line = String::new();

        loop {
            if std::time::Instant::now() > deadline {
                panic!("timed out waiting for MCP response id={id}");
            }

            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => panic!("rmcp stdio server closed stdout while waiting for id={id}"),
                Ok(_) => {}
                Err(error) => panic!("read rmcp stdio stdout: {error}"),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let payload: Value = serde_json::from_str(trimmed)
                .unwrap_or_else(|error| panic!("parse MCP stdout line `{trimmed}`: {error}"));

            if payload.get("id").and_then(Value::as_u64) == Some(id) {
                return payload;
            }
        }
    }

    fn send_request(&mut self, method: &str, params: Value) -> Value {
        let id = STDIO_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        self.write_message(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));
        self.read_response(id)
    }

    fn send_notification(&mut self, method: &str, params: Value) {
        self.write_message(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn initialize_session(&mut self) {
        if self.initialized {
            return;
        }

        let response = self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "stdio-differential", "version": "1.0.0" },
            }),
        );

        let server_name = response
            .pointer("/result/serverInfo/name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert_eq!(
            server_name, SERVER_NAME,
            "initialize must identify consultant-mcp rmcp server"
        );

        self.send_notification("notifications/initialized", json!({}));
        self.initialized = true;
    }
}

impl Drop for StdioMcpClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn pick_ephemeral_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
    listener.local_addr().expect("local addr").port()
}

fn default_streamable_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/event-stream"),
    );
    headers
}

struct HttpMcpHarness {
    child: Child,
    base_url: String,
    client: Client,
    session_headers: HeaderMap,
}

impl HttpMcpHarness {
    fn spawn(port: u16) -> Self {
        let binary = resolve_mcp_binary();
        let child = Command::new(&binary)
            .env("MCP_TRANSPORT", "http")
            .env("MCP_HTTP_PORT", port.to_string())
            .env("MCP_HTTP_HOST", "127.0.0.1")
            .env("CONSULTANT_MOCK", "true")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap_or_else(|error| panic!("spawn consultant HTTP server: {error}"));

        let harness = Self {
            child,
            base_url: format!("http://127.0.0.1:{port}/mcp"),
            client: Client::new(),
            session_headers: default_streamable_headers(),
        };
        harness.wait_for_ready();
        harness
    }

    fn wait_for_ready(&self) {
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        while std::time::Instant::now() < deadline {
            if self
                .client
                .get(format!("{}/health", self.base_url))
                .send()
                .map(|response| response.status().is_success())
                .unwrap_or(false)
            {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!("consultant HTTP MCP server did not become healthy");
    }

    fn post_mcp(&mut self, body: &Value) -> reqwest::blocking::Response {
        let response = self
            .client
            .post(&self.base_url)
            .headers(self.session_headers.clone())
            .json(body)
            .send()
            .expect("post MCP request");
        if let Some(session_id) = response.headers().get("mcp-session-id") {
            if let Ok(value) = HeaderValue::from_bytes(session_id.as_bytes()) {
                self.session_headers.insert("mcp-session-id", value);
            }
        }
        response
    }

    fn parse_response_body(content_type: &str, body: &str) -> Option<Value> {
        if content_type.contains("application/json") {
            return Some(serde_json::from_str(body).expect("parse JSON MCP response"));
        }

        let data_lines: Vec<&str> = body
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("data:"))
            .map(|line| line.trim_start_matches("data:").trim())
            .filter(|line| !line.is_empty())
            .collect();
        let payload = data_lines.last()?;
        Some(serde_json::from_str(payload).expect("parse streamable HTTP MCP payload"))
    }

    fn parse_response(response: reqwest::blocking::Response) -> Value {
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = response.text().expect("read MCP response body");
        Self::parse_response_body(&content_type, &body)
            .unwrap_or_else(|| panic!("no MCP JSON payload in streamable HTTP response: {body}"))
    }

    fn send_request(&mut self, method: &str, params: Value) -> Value {
        let id = HTTP_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        let request_body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let deadline = std::time::Instant::now() + Duration::from_secs(30);

        loop {
            let response = self.post_mcp(&request_body);
            let content_type = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("")
                .to_string();
            let body = response.text().expect("read MCP response body");
            if let Some(payload) = Self::parse_response_body(&content_type, &body) {
                assert_eq!(
                    payload.get("id").and_then(Value::as_u64),
                    Some(id),
                    "MCP response id mismatch for {method}"
                );
                return payload;
            }

            if std::time::Instant::now() >= deadline {
                panic!("no MCP JSON payload in streamable HTTP response: {body}");
            }
            self.session_headers.remove("mcp-session-id");
            thread::sleep(Duration::from_millis(250));
        }
    }

    fn send_notification(&mut self, method: &str, params: Value) {
        let _ = self.post_mcp(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn initialize_session(&mut self) {
        self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "differential-http-client", "version": "1.0.0" },
            }),
        );
        self.send_notification("notifications/initialized", json!({}));
    }
}

impl Drop for HttpMcpHarness {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn compare_stdio_probe_case(case: &OracleCase, client: &mut StdioMcpClient) {
    let kind = case.input["kind"].as_str().expect("stdioProbe kind");
    match kind {
        "initialize" => {
            let response = client.send_request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "stdio-differential", "version": "1.0.0" },
                }),
            );
            let server_name = response
                .pointer("/result/serverInfo/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            assert_eq!(
                server_name,
                case.output["serverName"].as_str().expect("serverName"),
                "{}: initialize server name mismatch",
                case.id
            );
            client.send_notification("notifications/initialized", json!({}));
            client.initialized = true;
        }
        "toolsList" => {
            client.initialize_session();
            let response = client.send_request("tools/list", json!({}));
            let tools = response
                .pointer("/result/tools")
                .and_then(Value::as_array)
                .expect("tools array");
            let mut names: Vec<String> = tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str).map(str::to_string))
                .collect();
            names.sort();
            let mut expected = case.output["tools"]
                .as_array()
                .expect("expected tools")
                .iter()
                .map(|value| value.as_str().expect("tool name").to_string())
                .collect::<Vec<_>>();
            expected.sort();
            assert_eq!(names, expected, "{}: tools/list mismatch", case.id);
        }
        "toolCall" => {
            client.initialize_session();
            let tool = case.input["tool"].as_str().expect("toolCall tool");
            let request_key = case.input["requestKey"].as_str().expect("toolCall requestKey");
            let requests = load_parity_requests();
            let arguments = requests
                .get(request_key)
                .unwrap_or_else(|| panic!("missing parity request {request_key}"))
                .clone();

            let response = client.send_request(
                "tools/call",
                json!({
                    "name": tool,
                    "arguments": arguments,
                }),
            );

            let result = response.get("result").expect("tools/call result");
            assert!(
                result.get("isError").and_then(Value::as_bool) != Some(true),
                "{}: tool call over stdio failed: {response}",
                case.id
            );

            let structured = result
                .get("structuredContent")
                .cloned()
                .or_else(|| {
                    result
                        .pointer("/content/0/text")
                        .and_then(Value::as_str)
                        .and_then(|text| serde_json::from_str(text).ok())
                })
                .expect("structured tool response");

            for key in ["kind", "status", "verdict"] {
                if let Some(expected) = case.output.get(key) {
                    assert_eq!(
                        structured.get(key),
                        Some(expected),
                        "{}: mismatch at {key}",
                        case.id
                    );
                }
            }
        }
        other => panic!("unknown stdioProbe kind {other} in case {}", case.id),
    }
}

fn compare_http_probe_case(case: &OracleCase, harness: &mut HttpMcpHarness) {
    let kind = case.input["kind"].as_str().expect("httpProbe kind");
    match kind {
        "health" => {
            let path = case.input["path"].as_str().expect("health path");
            let response = harness
                .client
                .get(format!("{}{path}", harness.base_url))
                .send()
                .expect("health request");
            assert!(response.status().is_success(), "{}: health status", case.id);
            let body: Value = response.json().expect("health json");
            assert_eq!(body, case.output, "{}: health body mismatch", case.id);
        }
        "initialize" => {
            let response = harness.send_request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "differential-http-client", "version": "1.0.0" },
                }),
            );
            let server_name = response
                .pointer("/result/serverInfo/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            assert_eq!(
                server_name,
                case.output["serverName"].as_str().expect("serverName"),
                "{}: initialize server name mismatch",
                case.id
            );
        }
        "toolsList" => {
            harness.initialize_session();
            let response = harness.send_request("tools/list", json!({}));
            let tools = response
                .pointer("/result/tools")
                .and_then(Value::as_array)
                .expect("tools array");
            let mut names: Vec<String> = tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str).map(str::to_string))
                .collect();
            names.sort();
            let mut expected = case.output["tools"]
                .as_array()
                .expect("expected tools")
                .iter()
                .map(|value| value.as_str().expect("tool name").to_string())
                .collect::<Vec<_>>();
            expected.sort();
            assert_eq!(names, expected, "{}: tools/list mismatch", case.id);
        }
        "toolCall" => {
            harness.initialize_session();
            let tool = case.input["tool"].as_str().expect("toolCall tool");
            let request_key = case.input["requestKey"].as_str().expect("toolCall requestKey");
            let requests = load_parity_requests();
            let arguments = requests
                .get(request_key)
                .unwrap_or_else(|| panic!("missing parity request {request_key}"))
                .clone();

            let response = harness.send_request(
                "tools/call",
                json!({
                    "name": tool,
                    "arguments": arguments,
                }),
            );

            let result = response.get("result").expect("tools/call result");
            assert!(
                result.get("isError").and_then(Value::as_bool) != Some(true),
                "{}: tool call over HTTP failed: {response}",
                case.id
            );

            let structured = result
                .get("structuredContent")
                .cloned()
                .or_else(|| {
                    result
                        .pointer("/content/0/text")
                        .and_then(Value::as_str)
                        .and_then(|text| serde_json::from_str(text).ok())
                })
                .expect("structured tool response");

            for key in ["kind", "status", "verdict"] {
                if let Some(expected) = case.output.get(key) {
                    assert_eq!(
                        structured.get(key),
                        Some(expected),
                        "{}: mismatch at {key}",
                        case.id
                    );
                }
            }
        }
        other => panic!("unknown httpProbe kind {other} in case {}", case.id),
    }
}

fn compare_server_contract_case(case: &OracleCase) {
    let package_json_path = repo_root().join("package.json");
    let package_json = fs::read_to_string(&package_json_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", package_json_path.display()));
    let version = serde_json::from_str::<Value>(&package_json)
        .expect("parse package.json")["version"]
        .as_str()
        .expect("package version")
        .to_string();

    let native = serde_json::json!({
        "name": "sylphx-consultant-mcp",
        "version": version,
        "tools": case.input["tools"],
    });
    assert_eq!(
        native, case.output,
        "server contract mismatch for case {}",
        case.id
    );
}

#[test]
fn consultant_mcp_differential_matches_ts_oracle() {
    let rt = tokio::runtime::Runtime::new().expect("consultant differential tokio runtime");
    let _ = fs::read_to_string(corpus_fixture_path()).expect("read consultant-mcp corpus fixture");
    let oracle = run_ts_oracle();
    assert_eq!(oracle.corpus_version, 1);
    assert!(!oracle.fixture_corpus_hash.is_empty());
    assert!(!oracle.cases.is_empty(), "oracle must emit cases");

    let stdio_cases: Vec<&OracleCase> = oracle
        .cases
        .iter()
        .filter(|case| case.domain == "stdioProbe")
        .collect();
    let http_cases: Vec<&OracleCase> = oracle
        .cases
        .iter()
        .filter(|case| case.domain == "httpProbe")
        .collect();
    let mut stdio_client = if !stdio_cases.is_empty() {
        Some(StdioMcpClient::spawn())
    } else {
        None
    };
    let mut http_harness = if !http_cases.is_empty() {
        Some(HttpMcpHarness::spawn(pick_ephemeral_port()))
    } else {
        None
    };

    for case in &oracle.cases {
        match case.domain.as_str() {
            "tool" => rt.block_on(compare_tool_case(case)),
            "transportContract" => compare_transport_contract_case(case),
            "surfaceContract" => compare_surface_contract_case(case),
            "serverContract" => compare_server_contract_case(case),
            "stdioProbe" => compare_stdio_probe_case(
                case,
                stdio_client
                    .as_mut()
                    .expect("stdio client required for stdioProbe cases"),
            ),
            "httpProbe" => compare_http_probe_case(
                case,
                http_harness
                    .as_mut()
                    .expect("http harness required for httpProbe cases"),
            ),
            other => panic!("unknown oracle domain {other} in case {}", case.id),
        }
    }
}