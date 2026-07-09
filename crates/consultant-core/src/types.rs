use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const ENGINE_NAME: &str = "consultant-core";
pub const ENGINE_VERSION: &str = "0.1.1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConsultationKind {
    ReviewDecision,
    Research,
    ChallengeAnswer,
    CompareOptions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyClass {
    Public,
    Internal,
    Confidential,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    StrongAccept,
    AcceptWithChanges,
    NeedsMoreEvidence,
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetPolicy {
    pub max_usd: Option<f64>,
    pub max_latency_ms: Option<i64>,
    pub require_approval_over_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceRef {
    #[serde(rename = "type")]
    pub evidence_type: String,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationRequestBase {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub context: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<String>>,
    #[serde(default = "default_privacy_class")]
    pub privacy_class: PrivacyClass,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget: Option<BudgetPolicy>,
    #[serde(default = "default_output_mode", skip_serializing_if = "is_default_output_mode")]
    pub output_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_evidence: Option<Vec<EvidenceRef>>,
}

fn default_privacy_class() -> PrivacyClass {
    PrivacyClass::Internal
}

fn default_output_mode() -> String {
    "concise".to_string()
}

fn is_default_output_mode(value: &String) -> bool {
    value == "concise"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewDecisionRequest {
    #[serde(flatten)]
    pub base: ConsultationRequestBase,
    pub decision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchRequest {
    #[serde(flatten)]
    pub base: ConsultationRequestBase,
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeAnswerRequest {
    #[serde(flatten)]
    pub base: ConsultationRequestBase,
    pub task: String,
    pub proposed_answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareOption {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareOptionsRequest {
    #[serde(flatten)]
    pub base: ConsultationRequestBase,
    pub problem: String,
    pub options: Vec<CompareOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConsultationRequest {
    ReviewDecision(ReviewDecisionRequest),
    Research(ResearchRequest),
    ChallengeAnswer(ChallengeAnswerRequest),
    CompareOptions(CompareOptionsRequest),
}

impl ConsultationRequest {
    pub fn kind(&self) -> ConsultationKind {
        match self {
            Self::ReviewDecision(_) => ConsultationKind::ReviewDecision,
            Self::Research(_) => ConsultationKind::Research,
            Self::ChallengeAnswer(_) => ConsultationKind::ChallengeAnswer,
            Self::CompareOptions(_) => ConsultationKind::CompareOptions,
        }
    }

    pub fn base(&self) -> &ConsultationRequestBase {
        match self {
            Self::ReviewDecision(request) => &request.base,
            Self::Research(request) => &request.base,
            Self::ChallengeAnswer(request) => &request.base,
            Self::CompareOptions(request) => &request.base,
        }
    }

    pub fn from_value(kind: ConsultationKind, value: Value) -> Result<Self, String> {
        match kind {
            ConsultationKind::ReviewDecision => {
                let request: ReviewDecisionRequest =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                Ok(Self::ReviewDecision(request))
            }
            ConsultationKind::Research => {
                let request: ResearchRequest =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                Ok(Self::Research(request))
            }
            ConsultationKind::ChallengeAnswer => {
                let request: ChallengeAnswerRequest =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                Ok(Self::ChallengeAnswer(request))
            }
            ConsultationKind::CompareOptions => {
                let request: CompareOptionsRequest =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                Ok(Self::CompareOptions(request))
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelModelResult {
    pub model: String,
    pub role: String,
    pub ok: bool,
    pub content: String,
    pub latency_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedChange {
    pub priority: String,
    pub change: String,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyTrace {
    pub privacy_class: PrivacyClass,
    pub redaction_applied: bool,
    pub budget_status: String,
    pub estimated_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTrace {
    pub provider: String,
    pub models: Vec<String>,
    pub judge_model: String,
    pub latency_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationResult {
    pub consultation_id: String,
    pub kind: ConsultationKind,
    pub status: String,
    pub verdict: Verdict,
    pub confidence: f64,
    pub executive_summary: String,
    pub consensus: Vec<String>,
    pub disagreements: Vec<String>,
    pub blind_spots: Vec<String>,
    pub recommended_changes: Vec<RecommendedChange>,
    pub evidence_gaps: Vec<String>,
    pub follow_up_questions: Vec<String>,
    pub citations: Vec<Citation>,
    pub panel: Vec<PanelModelResult>,
    pub policy: PolicyTrace,
    pub provider_trace: ProviderTrace,
}

#[derive(Debug, Clone)]
pub struct ModelMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ModelCompleteInput {
    pub model: String,
    pub messages: Vec<ModelMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ModelCompleteOutput {
    pub model: String,
    pub content: String,
    pub latency_ms: i64,
}

#[async_trait::async_trait]
pub trait ModelClient: Send + Sync {
    async fn complete(&self, input: ModelCompleteInput) -> Result<ModelCompleteOutput, String>;
}

#[derive(Debug, Clone)]
pub struct ConsultantConfig {
    pub provider_name: String,
    pub panel_models: Vec<String>,
    pub judge_model: String,
    pub timeout_ms: u64,
    pub max_output_tokens: u32,
    pub default_max_usd: f64,
    pub allow_confidential_external: bool,
    pub mock: bool,
}