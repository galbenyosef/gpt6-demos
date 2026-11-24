//! Record one default animation cycle with the production GPU renderer.
use anyhow::{Context, Result, ensure};
use eframe::wgpu;
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use wyang::{
    gpu::Renderer,
    project::Project,
    scene::{LOOP_SECONDS, Motion, Settings},
};

fn main() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    let project = Project::open(Path::new(
        &args.next().context("Expected project directory")?,
    ))?;
    let output = PathBuf::from(args.next().context("Expected a new MP4 path")?);
    ensure!(!output.exists(), "Choose a new MP4 path");
    let parent = output
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let staged = tempfile::Builder::new()
        .suffix(".mp4")
        .tempfile_in(parent)?;
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
    let renderer = Renderer::new(&device, &queue, &project.chosen().pixels);
    let mut encoder = Command::new("ffmpeg")
        .args([
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            "1280x720",
            "-r",
            "30",
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ])
        .arg(staged.path())
        .stdin(Stdio::piped())
        .spawn()
        .context("Starting ffmpeg")?;
    let mut sink = encoder.stdin.take().context("Opening the video encoder")?;
    let mut motion = Motion::default();
    let settings = Settings::default();
    for _ in 0..(30. * LOOP_SECONDS) as usize {
        motion.step(settings, [0.; 2], 1. / 30., false, false);
        sink.write_all(
            renderer
                .capture([1280, 720], settings, motion.pose)?
                .as_raw(),
        )?;
    }
    drop(sink);
    ensure!(encoder.wait()?.success(), "The video encoder failed");
    staged.persist_noclobber(output)?;
    Ok(())
}
