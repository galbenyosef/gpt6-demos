//! Measure the same scene pass at 1080p without changing the desktop display mode.
#[path = "../src/bin/wyang-player/metrics.rs"]
mod metrics;
use anyhow::{Context, Result};
use eframe::wgpu;
use std::{
    path::Path,
    time::{Duration, Instant},
};
use wyang::{
    gpu::Renderer,
    project::Project,
    scene::{self, Motion, Settings},
};

fn main() -> Result<()> {
    let project = std::env::args_os()
        .nth(1)
        .context("Expected project directory")?;
    let project = Project::open(Path::new(&project))?;
    let pixels = &project.chosen().pixels;
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
    let gpu = Renderer::new(&device, &queue, pixels);
    let size = [1920, 1080];
    let view = gpu.target(size)?.create_view(&Default::default());
    let mut metrics = metrics::Metrics::new(&adapter, &device)
        .context("Set WYANG_PROFILE_DIR to an existing output directory")?;
    let settings = Settings::default();
    let mut motion = Motion::default();
    let start = Instant::now();
    let interval = Duration::from_secs_f64(1.0 / 30.0);
    let mut next = start;
    let mut last = start;
    loop {
        std::thread::sleep(next.saturating_duration_since(Instant::now()));
        let now = Instant::now();
        motion.step(settings, [0.; 2], (now - last).as_secs_f32(), false, false);
        let params = scene::uniforms(
            [pixels.width(), pixels.height()],
            size,
            settings,
            motion.pose,
        );
        gpu.draw(&view, params);
        metrics.frame(now, size);
        if now - start >= Duration::from_secs(60) {
            break;
        }
        next += interval;
        if next <= now {
            next = now + interval;
        }
        last = now;
    }
    Ok(())
}
