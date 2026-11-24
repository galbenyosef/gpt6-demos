//! Prepare an offline scene for a test compositor without touching the user's applied scenes.
use anyhow::{Context, Result};
use wyang::project::{Playback, Project};
fn main() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    let root = args.next().context("Expected scene directory")?;
    let display = args
        .next()
        .context("Expected display connector")?
        .into_string()
        .map_err(|_| anyhow::anyhow!("Invalid display"))?;
    let p = match std::env::var_os("WYANG_TEST_PROJECT") {
        Some(dir) => Project::open(std::path::Path::new(&dir))?,
        None => Project::from_bytes(
            "Hamburg harbor.jpg".into(),
            include_bytes!("../assets/hamburg-harbor.jpg").to_vec(),
        )?,
    };
    if let Some(path) = args.next() {
        use eframe::wgpu;
        let width = args
            .next()
            .context("Expected width")?
            .to_str()
            .context("width")?
            .parse()?;
        let height = args
            .next()
            .context("Expected height")?
            .to_str()
            .context("height")?
            .parse()?;
        let instance = wgpu::Instance::default();
        let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
        let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
        let gpu = wyang::gpu::Renderer::new(&device, &queue, &p.chosen().pixels);
        let pixels = gpu.capture([width, height], p.settings(&display), Default::default())?;
        wyang::project::atomic_write(std::path::Path::new(&path), &wyang::artwork::png(&pixels)?)?;
    }
    println!(
        "{}",
        Playback::stage(std::path::Path::new(&root), &p, &display)?
    );
    Ok(())
}
