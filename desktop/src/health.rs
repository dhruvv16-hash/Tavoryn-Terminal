//! Backend Readiness & Handshake Module
//! Polls GET /health on loopback until the backend confirms process readiness.

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendHealthResponse {
    pub ok: bool,
    pub app: String,
    #[serde(rename = "backendVersion", default)]
    pub backend_version: String,
    #[serde(rename = "processReadiness", default)]
    pub process_readiness: String,
    #[serde(rename = "runtimeStatus", default)]
    pub runtime_status: String,
    #[serde(rename = "apiVersion", default)]
    pub api_version: String,
    #[serde(default)]
    pub version: String,
}

/// Polls GET /health with exponential/fixed backoff up to max_duration.
pub async fn poll_health(port: u16, max_duration: Duration) -> Result<BackendHealthResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let url = format!("http://127.0.0.1:{port}/health");
    let start = Instant::now();
    let mut last_error = String::new();

    while start.elapsed() < max_duration {
        match client.get(&url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<BackendHealthResponse>().await {
                        Ok(data) => {
                            if data.ok && data.app.contains("tavoryn") {
                                return Ok(data);
                            } else {
                                last_error = format!("Unexpected health payload: {:?}", data);
                            }
                        }
                        Err(e) => {
                            last_error = format!("Invalid health JSON response: {e}");
                        }
                    }
                } else {
                    last_error = format!("HTTP {}", resp.status());
                }
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    Err(format!(
        "Timed out after {}s waiting for backend on {url}. Last error: {last_error}",
        max_duration.as_secs()
    ))
}
