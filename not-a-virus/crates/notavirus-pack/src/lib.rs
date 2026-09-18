//! Untrusted pack data is fully validated before it reaches the simulation or AppKit.
mod import;
mod schema;
pub use import::install;
use notavirus_core::*;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{BufReader, Cursor},
    path::{Component, Path, PathBuf},
};
use thiserror::Error;
pub const MAX_BYTES: u64 = 32 * 1024 * 1024;
const MAX_TEXT: u64 = 1024 * 1024;
#[derive(Debug, Error)]
#[error("{0}")]
pub struct PackError(pub String);
pub type Result<T> = std::result::Result<T, PackError>;
fn error(s: impl Into<String>) -> PackError {
    PackError(s.into())
}
fn require(condition: bool, message: impl Into<String>) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(error(message))
    }
}
#[derive(Debug)]
pub struct LoadedPack {
    pub pack: Pack,
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub root: PathBuf,
}
/// Directory candidates are deterministic: bundled first, then user; the first valid id wins.
#[derive(Debug)]
pub struct Candidate {
    pub path: PathBuf,
    pub id: Option<String>,
    pub name: String,
    pub failure: Option<String>,
}
pub fn discover(roots: &[PathBuf]) -> Vec<Candidate> {
    let mut out = Vec::new();
    let mut ids = HashSet::new();
    for root in roots {
        let mut paths: Vec<_> = fs::read_dir(root)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.is_dir()
                    && !p
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .starts_with('.')
            })
            .collect();
        paths.sort();
        for path in paths {
            match load(&path) {
                Ok(p) => {
                    let id = p.pack.id;
                    let duplicate = !ids.insert(id.clone());
                    out.push(Candidate {
                        path,
                        id: Some(id),
                        name: p.pack.name,
                        failure: duplicate.then(|| "duplicate id".into()),
                    });
                }
                Err(e) => out.push(Candidate {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                    path,
                    id: None,
                    failure: Some(e.to_string()),
                }),
            }
        }
    }
    out
}
pub(crate) fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.to_string_lossy().contains('\\')
        && !path.to_string_lossy().contains(':')
        && path.components().all(|c| matches!(c, Component::Normal(_)))
}
fn asset(root: &Path, name: &str, limit: u64) -> Result<Vec<u8>> {
    require(
        safe_relative(Path::new(name)),
        format!("unsafe asset path: {name}"),
    )?;
    let path = root
        .join(name)
        .canonicalize()
        .map_err(|e| error(format!("{name}: {e}")))?;
    require(
        path.starts_with(root),
        format!("asset escapes pack: {name}"),
    )?;
    let meta = fs::metadata(&path).map_err(|e| error(e.to_string()))?;
    require(
        meta.is_file() && meta.len() <= limit,
        format!("{name}: invalid file or size exceeds limit"),
    )?;
    use std::io::Read;
    let mut data = Vec::new();
    fs::File::open(path)
        .map_err(|e| error(e.to_string()))?
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|e| error(e.to_string()))?;
    require(data.len() as u64 <= limit, "file exceeds size limit")?;
    Ok(data)
}
fn positive(n: f64) -> bool {
    n.is_finite() && n > 0.
}
pub fn load(root: &Path) -> Result<LoadedPack> {
    let root = root.canonicalize().map_err(|e| error(e.to_string()))?;
    let data = asset(&root, "pack.toml", MAX_TEXT)?;
    let source = std::str::from_utf8(&data).map_err(|e| error(e.to_string()))?;
    let m: schema::Manifest =
        toml::from_str(source).map_err(|e| error(format!("pack.toml: {e}")))?;
    require(m.schema == 1, "unsupported schema; expected 1")?;
    require(
        !m.extra.contains_key("rules"),
        "rules are not supported in schema 1",
    )?;
    for key in m.extra.keys().filter(|k| k.as_str() != "author") {
        tracing::warn!(key, "unknown pack metadata");
    }
    require(
        !m.id.is_empty()
            && m.id.len() <= 128
            && m.id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-'),
        "invalid pack id",
    )?;
    require(
        !m.name.trim().is_empty() && m.name.len() <= 256,
        "invalid pack name",
    )?;
    require(
        m.tile.iter().all(|&v| v > 0 && v <= 4096),
        "tile must be within 1..4096",
    )?;
    require(
        m.anchor
            .iter()
            .zip(m.tile)
            .all(|(&a, t)| a.is_finite() && a >= 0. && a <= f64::from(t)),
        "anchor must be inside tile",
    )?;
    let filter = match m.filter.as_str() {
        "nearest" => Filter::Nearest,
        "linear" => Filter::Linear,
        _ => return Err(error("unknown filter")),
    };
    let b = &m.behavior;
    let motion = &m.motion;
    require(b.preset == "chase", "unsupported behavior preset")?;
    require(
        b.idle_delay_ms.is_finite() && b.idle_delay_ms >= 0. && positive(b.sleep_after_ms),
        "invalid behavior delays",
    )?;
    require(
        positive(motion.max_speed)
            && positive(motion.acceleration)
            && motion.stop_distance.is_finite()
            && motion.stop_distance >= 0.
            && motion.start_distance.is_finite()
            && motion.start_distance > motion.stop_distance,
        "invalid motion: require finite positive speed/acceleration and 0 <= stop < start",
    )?;
    require(
        !(b.wake.is_some() && b.sleep.is_none()),
        "wake requires a sleep role",
    )?;
    require(
        m.atlas.grid.is_some() != m.atlas.regions.is_some(),
        "atlas requires exactly one of grid or regions",
    )?;
    let encoded = asset(&root, &m.atlas.file, MAX_BYTES)?;
    let decoder = png::Decoder::new_with_limits(
        BufReader::new(Cursor::new(encoded)),
        png::Limits {
            bytes: 4096 * 4096 * 4 + 1024 * 1024,
        },
    );
    let mut reader = decoder
        .read_info()
        .map_err(|e| error(format!("invalid atlas PNG: {e}")))?;
    let info = reader.info();
    let (width, height) = (info.width, info.height);
    require(
        width > 0 && height > 0 && width <= 4096 && height <= 4096,
        "atlas dimensions exceed 4096",
    )?;
    require(
        info.animation_control.is_none(),
        "APNG atlas is not supported",
    )?;
    require(
        info.color_type == png::ColorType::Rgba && info.bit_depth == png::BitDepth::Eight,
        "atlas must be an 8-bit RGBA PNG",
    )?;
    let mut rgba = vec![
        0;
        reader
            .output_buffer_size()
            .ok_or_else(|| error("atlas buffer overflow"))?
    ];
    reader
        .next_frame(&mut rgba)
        .map_err(|e| error(format!("invalid atlas pixels: {e}")))?;
    let regions: BTreeMap<String, schema::Region> = if let Some(path) = &m.atlas.regions {
        serde_json::from_slice(&asset(&root, path, MAX_TEXT)?)
            .map_err(|e| error(format!("invalid regions: {e}")))?
    } else {
        BTreeMap::new()
    };
    if let Some([cols, rows]) = m.atlas.grid {
        require(
            cols > 0
                && rows > 0
                && cols.checked_mul(m.tile[0]) == Some(width)
                && rows.checked_mul(m.tile[1]) == Some(height),
            "grid dimensions do not match atlas",
        )?;
    }
    for (name, r) in &regions {
        require(
            r.w == m.tile[0]
                && r.h == m.tile[1]
                && r.x.checked_add(r.w).is_some_and(|v| v <= width)
                && r.y.checked_add(r.h).is_some_and(|v| v <= height),
            format!("invalid region {name}: must be untrimmed tile inside atlas"),
        )?;
    }
    require(
        !m.states.is_empty() && m.states.len() <= 4096,
        "invalid number of clips",
    )?;
    let names: Vec<_> = m.states.keys().cloned().collect();
    let resolve = |name: &str| -> Result<usize> {
        names
            .iter()
            .position(|n| n == name)
            .ok_or_else(|| error(format!("missing clip: {name}")))
    };
    let mut clips = Vec::new();
    for (name, c) in &m.states {
        require(
            !c.frames.is_empty() && c.frames.len() <= 65536,
            format!("{name}: empty or oversized frames"),
        )?;
        require(
            !(c.fps.is_some() && c.durations_ms.is_some()),
            format!("{name}: fps and durations_ms are mutually exclusive"),
        )?;
        require(
            positive(c.fps.unwrap_or(8.)),
            format!("{name}: fps must be positive and finite"),
        )?;
        if let Some(d) = &c.durations_ms {
            require(
                d.len() == c.frames.len() && d.iter().all(|&n| positive(n)),
                format!("{name}: invalid durations_ms"),
            )?;
        }
        require(
            !c.looped || (c.next.is_none() && c.interrupt.is_none()),
            format!("{name}: looping clips cannot specify next/interrupt"),
        )?;
        let interrupt = match c.interrupt.as_deref().unwrap_or("finish") {
            "finish" => Interrupt::Finish,
            "on_move" => Interrupt::OnMove,
            _ => return Err(error(format!("{name}: unknown interrupt"))),
        };
        let flip = match c.flip.as_deref().unwrap_or("velocity") {
            "velocity" => FlipMode::Velocity,
            "none" => FlipMode::None,
            "always_left" => FlipMode::AlwaysLeft,
            "always_right" => FlipMode::AlwaysRight,
            _ => return Err(error(format!("{name}: unknown flip"))),
        };
        let mut frames = Vec::new();
        for (i, key) in c.frames.iter().enumerate() {
            let (x, y) = match (key, m.atlas.grid) {
                (schema::FrameKey::Index(n), Some([cols, rows])) if *n < cols * rows => {
                    ((n % cols) * m.tile[0], (n / cols) * m.tile[1])
                }
                (schema::FrameKey::Name(n), None) => {
                    let r = regions
                        .get(n)
                        .ok_or_else(|| error(format!("{name}: missing region {n}")))?;
                    (r.x, r.y)
                }
                _ => {
                    return Err(error(format!(
                        "{name}: frame kind/index does not match atlas"
                    )));
                }
            };
            let duration = c
                .durations_ms
                .as_ref()
                .map_or(1. / c.fps.unwrap_or(8.), |d| d[i] / 1000.);
            require(
                positive(duration),
                format!("{name}: frame duration underflow/overflow"),
            )?;
            frames.push(Frame {
                uv: Rect {
                    origin: Vec2::new(
                        f64::from(x) / f64::from(width),
                        1. - f64::from(y + m.tile[1]) / f64::from(height),
                    ),
                    size: Vec2::new(
                        f64::from(m.tile[0]) / f64::from(width),
                        f64::from(m.tile[1]) / f64::from(height),
                    ),
                },
                duration,
            });
        }
        require(
            frames.iter().map(|f| f.duration).sum::<f64>().is_finite(),
            format!("{name}: total duration overflow"),
        )?;
        clips.push(Clip {
            name: name.clone(),
            frames,
            looped: c.looped,
            next: c.next.as_deref().map(&resolve).transpose()?,
            interrupt,
            flip,
        });
    }
    // Validate every chain, including clips currently unused by a behavior role.
    for start in 0..clips.len() {
        let mut seen = HashSet::new();
        let mut current = start;
        while let Some(next) = clips[current].next {
            require(seen.insert(current), "cyclic next chain")?;
            require(!clips[next].looped, "next must reference a one-shot")?;
            current = next;
        }
    }
    let role = |name: &str, looped: bool| -> Result<usize> {
        let i = resolve(name)?;
        require(
            clips[i].looped == looped,
            format!("role {name}: incorrect loop type"),
        )?;
        Ok(i)
    };
    let optional =
        |name: &Option<String>, looped| name.as_deref().map(|n| role(n, looped)).transpose();
    let behavior = Behavior {
        idle: role(&b.idle, true)?,
        moving: role(&b.moving, true)?,
        start: optional(&b.start_moving, false)?,
        stop: optional(&b.stop_moving, false)?,
        turn: optional(&b.turn, false)?,
        sleep: optional(&b.sleep, true)?,
        wake: optional(&b.wake, false)?,
        idle_delay: b.idle_delay_ms / 1000.,
        sleep_after: b.sleep_after_ms / 1000.,
    };
    Ok(LoadedPack {
        pack: Pack {
            id: m.id,
            name: m.name,
            version: m.version,
            tile: Vec2::new(f64::from(m.tile[0]), f64::from(m.tile[1])),
            anchor: Vec2::new(m.anchor[0], m.anchor[1]),
            filter,
            clips,
            behavior,
            motion: Motion {
                max_speed: motion.max_speed,
                acceleration: motion.acceleration,
                stop_distance: motion.stop_distance,
                start_distance: motion.start_distance,
            },
        },
        rgba,
        width,
        height,
        root,
    })
}
