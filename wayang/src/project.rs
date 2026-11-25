use crate::{
    artwork::{self, Artwork},
    scene::Settings,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};

pub fn atomic_write(path: &Path, data: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    fs::create_dir_all(parent)?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
    tmp.write_all(data)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path)?;
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Asset {
    pub path: String,
    pub sha256: String,
}
impl Asset {
    pub fn new(bytes: &[u8], extension: &str) -> Self {
        let sha256 = artwork::digest(bytes);
        Self {
            path: format!("assets/{sha256}.{extension}"),
            sha256,
        }
    }
    fn validate(&self) -> Result<()> {
        ensure!(
            self.sha256.len() == 64 && self.sha256.bytes().all(|v| v.is_ascii_hexdigit()),
            "Invalid asset digest"
        );
        ensure!(
            ["png", "jpg", "webp"]
                .iter()
                .any(|ext| self.path == format!("assets/{}.{}", self.sha256, ext)),
            "Invalid asset path"
        );
        Ok(())
    }
    fn load(&self, dir: &Path, limit: usize) -> Result<Vec<u8>> {
        self.validate()?;
        let path = dir.join(&self.path).canonicalize()?;
        ensure!(
            path.starts_with(dir.canonicalize()?),
            "Asset is outside the project"
        );
        let bytes = artwork::read_bounded(&path, limit)?;
        ensure!(
            artwork::digest(&bytes) == self.sha256,
            "Artwork digest mismatch"
        );
        Ok(bytes)
    }
    fn save(&self, dir: &Path, bytes: &[u8]) -> Result<()> {
        self.validate()?;
        let assets = dir.join("assets");
        fs::create_dir_all(&assets)?;
        ensure!(
            assets.canonicalize()?.starts_with(dir.canonicalize()?),
            "Asset directory is outside the project"
        );
        if self.load(dir, bytes.len()).is_err() {
            atomic_write(&dir.join(&self.path), bytes)?;
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Provenance {
    pub source_digest: String,
    pub model: String,
    pub user_prompt: String,
    pub effective_prompt: String,
    pub dimensions: [u32; 2],
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Variant {
    pub id: String,
    pub asset: Asset,
    pub generation: Provenance,
    pub displays: BTreeMap<String, Settings>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub source: Asset,
    pub source_name: String,
    pub prompt: String,
    pub variants: Vec<Variant>,
    pub selected: String,
    pub display: String,
    pub source_displays: BTreeMap<String, Settings>,
}
#[derive(Clone)]
pub struct Candidate {
    pub art: Artwork,
    pub png: Arc<Vec<u8>>,
    pub asset: Asset,
}
impl Candidate {
    pub fn from_png(bytes: Vec<u8>) -> Result<Self> {
        ensure!(
            image::guess_format(&bytes)? == image::ImageFormat::Png,
            "The model returned an unexpected image format"
        );
        let raster = artwork::decode(&bytes, artwork::ART_BYTES)?;
        let bytes = artwork::png(&raster)?;
        let asset = Asset::new(&bytes, "png");
        Ok(Self {
            art: Artwork::new(raster),
            png: Arc::new(bytes),
            asset,
        })
    }
}
pub const SOURCE: &str = "original";
#[derive(Clone)]
pub struct Project {
    pub directory: Option<PathBuf>,
    pub manifest: Manifest,
    pub original: Arc<Vec<u8>>,
    pub source: Artwork,
    pub candidates: BTreeMap<String, Candidate>,
    pub unavailable: BTreeMap<String, String>,
}
impl Project {
    pub fn import(path: &Path) -> Result<Self> {
        Self::from_bytes(
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            artwork::read_bounded(path, artwork::IMPORT_BYTES)?,
        )
    }
    pub fn from_bytes(name: String, bytes: Vec<u8>) -> Result<Self> {
        let source = Artwork::new(artwork::decode(&bytes, artwork::IMPORT_BYTES)?);
        let extension = image::guess_format(&bytes)?.extensions_str()[0];
        let manifest = Manifest {
            version: 1,
            source: Asset::new(&bytes, extension),
            source_name: name,
            prompt: String::new(),
            variants: vec![],
            selected: SOURCE.into(),
            display: String::new(),
            source_displays: Default::default(),
        };
        Ok(Self {
            directory: None,
            manifest,
            source,
            original: Arc::new(bytes),
            candidates: Default::default(),
            unavailable: Default::default(),
        })
    }
    pub fn add(&mut self, art: Candidate, generation: Provenance) {
        let id = uuid::Uuid::new_v4().to_string();
        let asset = art.asset.clone();
        self.manifest.variants.push(Variant {
            id: id.clone(),
            asset,
            generation,
            displays: Default::default(),
        });
        self.candidates.insert(id.clone(), art);
        if self.manifest.selected == SOURCE {
            self.manifest.selected = id;
        }
    }
    pub fn chosen(&self) -> &Artwork {
        self.candidates
            .get(&self.manifest.selected)
            .map_or(&self.source, |c| &c.art)
    }
    pub fn settings(&self, display: &str) -> Settings {
        let maps = self
            .manifest
            .variants
            .iter()
            .find(|v| v.id == self.manifest.selected)
            .map_or(&self.manifest.source_displays, |v| &v.displays);
        maps.get(display).copied().unwrap_or_default()
    }
    pub fn set_settings(&mut self, display: &str, s: Settings) {
        let maps = self
            .manifest
            .variants
            .iter_mut()
            .find(|v| v.id == self.manifest.selected)
            .map_or(&mut self.manifest.source_displays, |v| &mut v.displays);
        maps.insert(display.into(), s);
    }
    pub fn save(&self, dir: &Path) -> Result<()> {
        self.manifest.source.save(dir, &self.original)?;
        for variant in &self.manifest.variants {
            if let Some(candidate) = self.candidates.get(&variant.id) {
                variant.asset.save(dir, &candidate.png)?;
            }
        }
        atomic_write(
            &dir.join("project.json"),
            &serde_json::to_vec_pretty(&self.manifest)?,
        )
    }
    pub fn open(dir: &Path) -> Result<Self> {
        let manifest: Manifest =
            serde_json::from_slice(&artwork::read_bounded(&dir.join("project.json"), 8 << 20)?)
                .context("Invalid project manifest")?;
        ensure!(manifest.version == 1, "Unsupported project version");
        let mut seen = HashSet::new();
        ensure!(
            manifest
                .variants
                .iter()
                .all(|v| v.id != SOURCE && seen.insert(&v.id)),
            "Duplicate variant identity"
        );
        for s in manifest.source_displays.values() {
            s.validate()?;
        }
        let original = manifest
            .source
            .load(dir, artwork::IMPORT_BYTES)
            .context("Original image missing or corrupt")?;
        let source = Artwork::new(artwork::decode(&original, artwork::IMPORT_BYTES)?);
        let mut p = Self {
            directory: Some(dir.to_owned()),
            manifest,
            original: Arc::new(original),
            source,
            candidates: Default::default(),
            unavailable: Default::default(),
        };
        for variant in &p.manifest.variants {
            let load = || -> Result<Candidate> {
                for s in variant.displays.values() {
                    s.validate()?;
                }
                let c = Candidate::from_png(variant.asset.load(dir, artwork::ART_BYTES)?)?;
                ensure!(
                    variant.generation.source_digest == p.manifest.source.sha256
                        && variant.generation.dimensions
                            == [c.art.pixels.width(), c.art.pixels.height()],
                    "Artwork provenance mismatch"
                );
                Ok(c)
            };
            match load() {
                Ok(c) => {
                    p.candidates.insert(variant.id.clone(), c);
                }
                Err(e) => {
                    p.unavailable.insert(variant.id.clone(), format!("{e}"));
                }
            }
        }
        if !p.candidates.contains_key(&p.manifest.selected) && p.manifest.selected != SOURCE {
            p.manifest.selected = p
                .manifest
                .variants
                .iter()
                .find(|v| p.candidates.contains_key(&v.id))
                .map_or_else(|| SOURCE.into(), |v| v.id.clone());
        }
        Ok(p)
    }
}

#[derive(Serialize, Deserialize)]
pub struct Playback {
    pub version: u32,
    pub artwork: Asset,
    pub settings: Settings,
    pub display: String,
}
impl Playback {
    /// The immutable snapshot can be handed to the host while the old scene is still visible.
    pub fn stage(root: &Path, p: &Project, display: &str) -> Result<String> {
        let bytes = match p.candidates.get(&p.manifest.selected) {
            Some(c) => c.png.clone(),
            None => Arc::new(artwork::png(&p.source.pixels)?),
        };
        let s = Self {
            version: 1,
            artwork: Asset::new(&bytes, "png"),
            settings: p.settings(display),
            display: display.into(),
        };
        let manifest = serde_json::to_vec(&s)?;
        let id = artwork::digest(&manifest);
        let dir = root.join(&id);
        s.artwork.save(&dir, &bytes)?;
        atomic_write(&dir.join("scene.json"), &manifest)?;
        Ok(id)
    }
    pub fn load(root: &Path, id: &str) -> Result<(Self, Arc<image::RgbaImage>)> {
        ensure!(
            id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit()),
            "Invalid scene identifier"
        );
        let dir = root.join(id);
        let manifest = artwork::read_bounded(&dir.join("scene.json"), 64 << 10)?;
        ensure!(artwork::digest(&manifest) == id, "Scene digest mismatch");
        let s: Self = serde_json::from_slice(&manifest)?;
        ensure!(s.version == 1, "Unsupported scene version");
        s.settings.validate()?;
        let pixels = artwork::decode(
            &s.artwork.load(&dir, artwork::ART_BYTES)?,
            artwork::ART_BYTES,
        )?;
        Ok((s, Arc::new(pixels)))
    }
}
pub fn playback_root() -> Result<PathBuf> {
    #[cfg(target_os = "macos")]
    let base = crate::desktop::platform::application_support()?;
    #[cfg(not(target_os = "macos"))]
    let base = {
        let home = std::env::var_os("HOME").context("Home directory unavailable")?;
        std::env::var_os("XDG_DATA_HOME")
            .map_or_else(|| PathBuf::from(home).join(".local/share"), PathBuf::from)
    };
    Ok(base.join("wyang/scenes"))
}
