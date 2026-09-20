use serde::{Deserialize, Serialize};
use std::io::{self, BufRead};
pub const VERSION: u32 = 1;
pub const MAX_MESSAGE: usize = 64 * 1024;
pub const MAX_SEQUENCE: u64 = (1u64 << 53) - 1;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Hello {
        seq: u64,
        version: u32,
        pack: String,
        size: f64,
        paused: bool,
    },
    Sample {
        seq: u64,
        sample: Sample,
    },
    ListPacks {
        seq: u64,
        offset: usize,
    },
    SelectPack {
        seq: u64,
        id: String,
    },
    CommitPack {
        seq: u64,
        generation: u64,
    },
    DiscardPack {
        seq: u64,
        generation: u64,
    },
    SetSize {
        seq: u64,
        size: f64,
    },
    SetPaused {
        seq: u64,
        paused: bool,
    },
    ReloadPacks {
        seq: u64,
    },
    Shutdown {
        seq: u64,
    },
}
impl Request {
    pub fn seq(&self) -> u64 {
        match self {
            Self::Hello { seq, .. }
            | Self::Sample { seq, .. }
            | Self::ListPacks { seq, .. }
            | Self::SelectPack { seq, .. }
            | Self::CommitPack { seq, .. }
            | Self::DiscardPack { seq, .. }
            | Self::SetSize { seq, .. }
            | Self::SetPaused { seq, .. }
            | Self::ReloadPacks { seq }
            | Self::Shutdown { seq } => *seq,
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Sample {
    pub dt: f64,
    pub pointer: [f64; 2],
    pub monitor: [f64; 4],
    pub work: [f64; 4],
    pub monitor_id: u64,
    pub monitor_generation: u64,
    pub device_scale: f64,
    pub visible: bool,
    pub reset: bool,
}
impl Sample {
    pub fn validate(&self) -> Result<(), String> {
        let finite = self
            .pointer
            .iter()
            .chain(self.monitor.iter())
            .chain(self.work.iter())
            .all(|v| v.is_finite() && v.abs() <= 1_000_000.);
        if !finite
            || !self.dt.is_finite()
            || self.dt < 0.
            || self.dt > 3600.
            || !self.device_scale.is_finite()
            || !(0.1..=16.).contains(&self.device_scale)
            || self.monitor[2..]
                .iter()
                .chain(self.work[2..].iter())
                .any(|v| *v <= 0.)
            || self.monitor_id > MAX_SEQUENCE
            || self.monitor_generation > MAX_SEQUENCE
        {
            return Err("Invalid sample geometry, clock or generation".into());
        }
        Ok(())
    }
}
pub fn size_valid(size: f64) -> bool {
    [1., 1.5, 2.].contains(&size)
}
pub fn id_valid(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
}
/// Bound the allocation before reading an untrusted line (including absent newline).
pub fn read_message(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut out = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if out.is_empty() {
                Ok(None)
            } else {
                Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Truncated protocol message",
                ))
            };
        }
        let newline = available.iter().position(|&b| b == b'\n');
        let n = newline.map_or(available.len(), |i| i + 1);
        if out.len() + n > MAX_MESSAGE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Protocol message exceeds 64 KiB",
            ));
        }
        out.extend_from_slice(&available[..n]);
        reader.consume(n);
        if newline.is_some() {
            return Ok(Some(out));
        }
    }
}
