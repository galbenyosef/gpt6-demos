//! Opt-in, local acceptance measurements. GPU completion is synchronized only while profiling.
use eframe::wgpu;
use serde::Serialize;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub struct Metrics {
    path: PathBuf,
    adapter: String,
    device: wgpu::Device,
    start: Instant,
    cpu: f64,
    samples: Vec<f64>,
    done: bool,
}
fn cpu_seconds() -> f64 {
    // POSIX process time includes the player's rendering and event threads.
    let mut time = std::mem::MaybeUninit::<libc::timespec>::uninit();
    if unsafe { libc::clock_gettime(libc::CLOCK_PROCESS_CPUTIME_ID, time.as_mut_ptr()) } != 0 {
        return 0.;
    }
    let time = unsafe { time.assume_init() };
    time.tv_sec as f64 + time.tv_nsec as f64 / 1e9
}
#[derive(Serialize)]
struct Summary<'a> {
    adapter: &'a str,
    size: [u32; 2],
    seconds: f64,
    frames: usize,
    fps: f64,
    median_render_ms: f64,
    p95_render_ms: f64,
    process_cpu_percent: f64,
}
impl Metrics {
    pub fn new(adapter: &wgpu::Adapter, device: &wgpu::Device) -> Option<Self> {
        let dir = PathBuf::from(std::env::var_os("WYANG_PROFILE_DIR")?);
        if !dir.is_dir() {
            return None;
        }
        Some(Self {
            path: dir.join(format!("player-{}.json", std::process::id())),
            adapter: adapter.get_info().name,
            device: device.clone(),
            start: Instant::now(),
            cpu: cpu_seconds(),
            samples: vec![],
            done: false,
        })
    }
    pub fn frame(&mut self, began: Instant, size: [u32; 2]) {
        if self.done {
            return;
        }
        if self
            .device
            .poll(wgpu::PollType::wait_indefinitely())
            .is_err()
        {
            return;
        }
        self.samples.push(began.elapsed().as_secs_f64() * 1000.);
        if self.start.elapsed() < Duration::from_secs(60) {
            return;
        }
        self.done = true;
        self.samples.sort_by(f64::total_cmp);
        let n = self.samples.len();
        let seconds = self.start.elapsed().as_secs_f64();
        let summary = Summary {
            adapter: &self.adapter,
            size,
            seconds,
            frames: n,
            fps: n as f64 / seconds,
            median_render_ms: self.samples[n / 2],
            p95_render_ms: self.samples[(n * 95).div_ceil(100) - 1],
            process_cpu_percent: (cpu_seconds() - self.cpu) * 100. / seconds,
        };
        if let Ok(bytes) = serde_json::to_vec_pretty(&summary) {
            let _ = wyang::project::atomic_write(&self.path, &bytes);
        }
    }
}
