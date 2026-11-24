//! The editor's only network boundary. Provider errors deliberately exclude response bodies.
use crate::{
    artwork,
    project::{Candidate, Project, Provenance},
};
use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::blocking::{Client, multipart};
use std::{
    collections::HashMap,
    fmt,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime},
};

pub const DEFAULT_MODEL: &str = "gpt-image-2.5-flare";
pub const SUFFIX: &str = "Preserve the source framing and subject identity unless the user's instructions request a change.";
pub struct Config {
    key: Option<String>,
    pub model: String,
}
impl Config {
    pub fn load(dir: &Path) -> Result<Self> {
        Self::resolve(dir, |name| std::env::var(name).ok())
    }
    pub fn resolve(dir: &Path, env: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let mut file = HashMap::new();
        let path = dir.join(".env");
        if path.try_exists()? {
            for item in
                dotenvy::from_path_iter(path).map_err(|_| anyhow::anyhow!("Cannot read .env"))?
            {
                let (k, v) = item.map_err(|_| anyhow::anyhow!("Invalid entry in .env"))?;
                file.insert(k, v);
            }
        }
        let get = |name: &str| {
            env(name)
                .or_else(|| file.get(name).cloned())
                .map(|v| v.trim().to_owned())
                .filter(|s| !s.is_empty())
        };
        Ok(Self {
            key: get("OPENAI_API_KEY"),
            model: get("OPENAI_IMAGE_MODEL").unwrap_or_else(|| DEFAULT_MODEL.into()),
        })
    }
    pub fn ready(&self) -> bool {
        self.key.is_some()
    }
    pub fn client(self) -> Result<Option<OpenAi>> {
        self.key
            .map(|key| {
                Ok(OpenAi {
                    key,
                    http: Client::builder()
                        .redirect(reqwest::redirect::Policy::none())
                        .retry(reqwest::retry::never())
                        .timeout(Duration::from_secs(300))
                        .connect_timeout(Duration::from_secs(15))
                        .build()?,
                })
            })
            .transpose()
    }
}
#[derive(Clone)]
pub struct Request {
    pub source: Arc<Vec<u8>>,
    pub source_digest: String,
    pub user_prompt: String,
    pub effective: String,
    pub model: String,
    pub size: String,
}
impl Request {
    pub fn new(p: &Project, user_prompt: String, model: String) -> Result<Self> {
        ensure!(!user_prompt.trim().is_empty(), "Enter an edit description");
        let effective = format!("{user_prompt}\n\n{SUFFIX}");
        ensure!(
            effective.chars().count() <= 32000,
            "Description exceeds the model's prompt limit"
        );
        let img = &p.source.pixels;
        Ok(Self {
            source: Arc::new(artwork::upload(img)?),
            source_digest: p.manifest.source.sha256.clone(),
            user_prompt,
            effective,
            size: model_size(&model, img.width(), img.height()),
            model,
        })
    }
}
pub fn model_size(model: &str, width: u32, height: u32) -> String {
    let ratio = (width as f64 / height.max(1) as f64).clamp(1. / 3., 3.);
    if model.starts_with("gpt-image-2") {
        let height = (1_572_864. / ratio).sqrt();
        let round = |v: f64| ((v / 16.).round() as u32) * 16;
        let h = round(height);
        let w = round(height * ratio).clamp(h.div_ceil(48) * 16, h * 3);
        format!("{w}x{h}")
    } else {
        [(1024, 1024), (1536, 1024), (1024, 1536)]
            .into_iter()
            .min_by(|&(w, h), &(x, y)| {
                ((w as f64 / h as f64 / ratio).ln().abs())
                    .total_cmp(&(x as f64 / y as f64 / ratio).ln().abs())
            })
            .map(|(w, h)| format!("{w}x{h}"))
            .unwrap()
    }
}
#[derive(Clone, Debug, PartialEq)]
pub enum Failure {
    Credential,
    Model,
    Input,
    Rate(Option<u64>),
    Network,
    Service,
    InvalidRaster,
    Local(String),
}
impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rate(Some(s)) => write!(f, "OpenAI rate limit. Retry after {s} seconds."),
            Self::Local(m) => write!(f, "{m}"),
            other => f.write_str(match other {
                Self::Credential => "OpenAI rejected the credential. Check OPENAI_API_KEY.",
                Self::Model => "The image model is unavailable. Check OPENAI_IMAGE_MODEL.",
                Self::Input => "OpenAI rejected the image or description.",
                Self::Rate(None) => "OpenAI rate limit reached.",
                Self::Network => {
                    "The network connection failed. The submitted request may still incur usage."
                }
                Self::Service => {
                    "OpenAI could not finish this edit. The request may still incur usage."
                }
                Self::InvalidRaster => "The returned image failed validation.",
                _ => unreachable!(),
            }),
        }
    }
}
pub trait Provider: Send + Sync {
    fn edit(&self, r: &Request, slot: usize) -> std::result::Result<Vec<u8>, Failure>;
}
pub struct OpenAi {
    key: String,
    http: Client,
}
impl OpenAi {
    fn build_request(
        &self,
        r: &Request,
    ) -> std::result::Result<reqwest::blocking::RequestBuilder, Failure> {
        let part = multipart::Part::bytes(r.source.as_ref().clone())
            .file_name("source.png")
            .mime_str("image/png")
            .map_err(|_| Failure::Input)?;
        let form = multipart::Form::new()
            .part("image", part)
            .text("model", r.model.clone())
            .text("prompt", r.effective.clone())
            .text("n", "1")
            .text("size", r.size.clone())
            .text("output_format", "png");
        Ok(self
            .http
            .post("https://api.openai.com/v1/images/edits")
            .bearer_auth(&self.key)
            .multipart(form))
    }
}
fn http_failure(status: u16, code: &str, delay: Option<u64>) -> Failure {
    match status {
        _ if code.contains("model") => Failure::Model,
        401 | 403 => Failure::Credential,
        404 => Failure::Model,
        429 => Failure::Rate(delay),
        400..500 => Failure::Input,
        _ => Failure::Service,
    }
}
impl Provider for OpenAi {
    fn edit(&self, r: &Request, _slot: usize) -> std::result::Result<Vec<u8>, Failure> {
        let res = self
            .build_request(r)?
            .send()
            .map_err(|_| Failure::Network)?;
        let status = res.status().as_u16();
        if !(200..300).contains(&status) {
            let delay = res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| {
                    s.parse().ok().or_else(|| {
                        httpdate::parse_http_date(s).ok().map(|d| {
                            d.duration_since(SystemTime::now())
                                .unwrap_or_default()
                                .as_secs()
                        })
                    })
                });
            let err: serde_json::Value =
                serde_json::from_reader(res.take(32768)).unwrap_or_default();
            let code = err
                .pointer("/error/code")
                .and_then(|c| c.as_str())
                .unwrap_or("");
            return Err(http_failure(status, code, delay));
        }
        #[derive(serde::Deserialize)]
        struct Response {
            data: Vec<Item>,
        }
        #[derive(serde::Deserialize)]
        struct Item {
            b64_json: String,
        }
        const RESPONSE_LIMIT: u64 = 96 * 1024 * 1024;
        let mut data = Vec::new();
        res.take(RESPONSE_LIMIT + 1)
            .read_to_end(&mut data)
            .map_err(|_| Failure::Network)?;
        if data.len() as u64 > RESPONSE_LIMIT {
            return Err(Failure::InvalidRaster);
        }
        let res: Response = serde_json::from_slice(&data).map_err(|_| Failure::InvalidRaster)?;
        let [item] = res.data.as_slice() else {
            return Err(Failure::InvalidRaster);
        };
        STANDARD
            .decode(&item.b64_json)
            .map_err(|_| Failure::InvalidRaster)
    }
}
pub struct Fixtures(pub PathBuf);
impl Provider for Fixtures {
    fn edit(&self, _: &Request, slot: usize) -> std::result::Result<Vec<u8>, Failure> {
        artwork::read_bounded(
            &self.0.join(format!("{}.png", slot + 1)),
            artwork::ART_BYTES,
        )
        .map_err(|_| Failure::Local(format!("Fixture {}.png is missing or too large", slot + 1)))
    }
}

pub struct Job {
    pub id: u64,
    pub slot: usize,
    pub result: std::result::Result<(Candidate, Provenance), Failure>,
}
#[derive(Clone)]
pub struct Batch {
    pub id: u64,
    pub total: usize,
    pub ready: usize,
    pub active: bool,
    pub prompt: String,
    pub model: String,
    cancelled: Arc<AtomicBool>,
}
impl Batch {
    pub fn new(id: u64, total: usize, prompt: String, model: String) -> Result<Self> {
        ensure!((1..=4).contains(&total), "Choose one to four variations");
        Ok(Self {
            id,
            total,
            ready: 0,
            active: true,
            prompt,
            model,
            cancelled: Default::default(),
        })
    }
    pub fn cancel(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        self.active = false;
    }
    pub fn retry(&mut self, id: u64) -> Result<()> {
        ensure!(
            !self.active && self.ready < self.total,
            "No unfinished batch to retry"
        );
        self.id = id;
        self.active = true;
        self.cancelled = Default::default();
        Ok(())
    }
    pub fn accept(&mut self, job: &Job) -> bool {
        if !self.active || job.id != self.id || job.slot != self.ready {
            return false;
        }
        if job.result.is_ok() {
            self.ready += 1;
        }
        self.active = job.result.is_ok() && self.ready < self.total;
        true
    }
    pub fn run(&self, provider: &dyn Provider, p: &Project, mut emit: impl FnMut(Job)) {
        let request = Request::new(p, self.prompt.clone(), self.model.clone())
            .context("Could not prepare upload");
        let r = match request {
            Ok(r) => r,
            Err(e) => {
                emit(Job {
                    id: self.id,
                    slot: self.ready,
                    result: Err(Failure::Local(e.to_string())),
                });
                return;
            }
        };
        for slot in self.ready..self.total {
            if self.cancelled.load(Ordering::Acquire) {
                break;
            }
            let result = provider
                .edit(&r, slot)
                .and_then(|bytes| Candidate::from_png(bytes).map_err(|_| Failure::InvalidRaster))
                .map(|c| {
                    let dims = [c.art.pixels.width(), c.art.pixels.height()];
                    (
                        c,
                        Provenance {
                            source_digest: r.source_digest.clone(),
                            model: r.model.clone(),
                            user_prompt: r.user_prompt.clone(),
                            effective_prompt: r.effective.clone(),
                            dimensions: dims,
                        },
                    )
                });
            if self.cancelled.load(Ordering::Acquire) {
                break;
            }
            let failed = result.is_err();
            emit(Job {
                id: self.id,
                slot,
                result,
            });
            if failed {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wire_request_uses_one_edit_with_the_resolved_key_and_normalized_source() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let cfg = Config::resolve(dir.path(), |k| {
            (k == "OPENAI_API_KEY").then_some("env-dummy".into())
        })?;
        assert_eq!(cfg.key.as_deref(), Some("env-dummy"));
        std::fs::write(
            dir.path().join(".env"),
            "OPENAI_API_KEY=file-dummy\nOPENAI_IMAGE_MODEL=file-model\n",
        )?;
        let file = Config::resolve(dir.path(), |_| None)?;
        assert_eq!(file.key.as_deref(), Some("file-dummy"));
        let cfg = Config::resolve(dir.path(), |k| {
            (k == "OPENAI_API_KEY").then_some("env-dummy".into())
        })?;
        let model = cfg.model.clone();
        let http = cfg.client()?.unwrap();
        let p = Project::from_bytes(
            "harbor.jpg".into(),
            include_bytes!("../assets/hamburg-harbor.jpg").to_vec(),
        )?;
        let r = Request::new(&p, "Blue hour".into(), model)?;
        let mut req = http.build_request(&r).unwrap().build()?;
        assert_eq!(req.method(), reqwest::Method::POST);
        assert_eq!(req.url().as_str(), "https://api.openai.com/v1/images/edits");
        assert_eq!(req.headers()["authorization"], "Bearer env-dummy");
        let bytes = req.body_mut().as_mut().unwrap().buffer()?;
        let body = String::from_utf8_lossy(bytes);
        for field in [
            "name=\"image\"; filename=\"source.png\"",
            "name=\"prompt\"",
            "Blue hour",
            SUFFIX,
            "name=\"n\"\r\n\r\n1",
            "name=\"model\"\r\n\r\nfile-model",
            "name=\"output_format\"\r\n\r\npng",
        ] {
            assert!(body.contains(field));
        }
        assert!(bytes.windows(8).any(|w| w == b"\x89PNG\r\n\x1a\n"));
        assert!(!body.contains("env-dummy"));
        Ok(())
    }
    #[test]
    fn provider_errors_are_actionable_and_do_not_include_remote_messages() {
        for (status, code, expected) in [
            (401, "invalid_api_key", Failure::Credential),
            (403, "model_not_found", Failure::Model),
            (400, "invalid_image", Failure::Input),
            (429, "rate_limit_exceeded", Failure::Rate(Some(19))),
            (500, "server_error", Failure::Service),
        ] {
            assert_eq!(http_failure(status, code, Some(19)), expected);
        }
    }
}
