//! Exercise the editor's Apply and Stop paths from beside a packaged player.
use anyhow::{Context, Result, ensure};
use eframe::wgpu;
use std::path::Path;
use wyang::{
    artwork, desktop,
    gpu::Renderer,
    project::{Playback, Project, atomic_write, playback_root},
    scene::Settings,
};

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let action = args.next().context("Expected action")?;
    if action == "preview" {
        let capture = image::open(args.next().context("Expected editor capture")?)?.into_rgb8();
        let mut colors = std::collections::HashSet::new();
        for y in (capture.height() / 3..capture.height() / 2).step_by(5) {
            for x in (capture.width() / 2..capture.width() * 4 / 5).step_by(5) {
                colors.insert(capture.get_pixel(x, y).0);
            }
        }
        ensure!(colors.len() > 100, "Waiting for the harbor preview");
        return Ok(());
    }
    if action == "compare" {
        let rest = image::open(args.next().context("Expected export path")?)?.into_rgb8();
        let desktop = image::open(args.next().context("Expected window capture")?)?.into_rgb8();
        ensure!(
            rest.dimensions() == desktop.dimensions(),
            "Capture and export dimensions differ"
        );
        let error: u64 = rest
            .iter()
            .zip(desktop.iter())
            .map(|(a, b)| a.abs_diff(*b) as u64)
            .sum();
        let mean = error as f64 / rest.len() as f64;
        println!("Desktop/export mean channel error {mean:.3} / 255");
        ensure!(mean < 3.0, "Desktop crop differs from the export");
        return Ok(());
    }
    let display = args.next().context("Expected display ID")?;
    let active = || desktop::status().active.contains(&display);
    match action.as_str() {
        "idle" => ensure!(!active(), "Display already has a Wyang player"),
        "active" => ensure!(active(), "Display has no active player"),
        "reduced" => println!("{}", desktop::status().reduced),
        "stop" => desktop::stop(&display)?,
        "invalid" => {
            ensure!(desktop::apply(&uuid::Uuid::new_v4().to_string(), &display).is_err());
            ensure!(active(), "Failed replacement stopped the original player");
        }
        "still" | "motion" => {
            let source = args.next().context("Expected project path or -")?;
            let mut project = if source == "-" {
                Project::from_bytes(
                    "Hamburg harbor.jpg".into(),
                    include_bytes!("../assets/hamburg-harbor.jpg").to_vec(),
                )?
            } else {
                Project::open(Path::new(&source))?
            };
            if action == "still" {
                project.set_settings(
                    &display,
                    Settings {
                        focal: [0.63, 0.36],
                        horizon: 0.46,
                        motion: false,
                        ..Default::default()
                    },
                );
            }
            if let Some(output) = args.next() {
                let width = args.next().context("Expected width")?.parse()?;
                let height = args.next().context("Expected height")?.parse()?;
                let instance = wgpu::Instance::default();
                let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
                let (device, queue) =
                    pollster::block_on(adapter.request_device(&Default::default()))?;
                let gpu = Renderer::new(&device, &queue, &project.chosen().pixels);
                let rest = gpu.capture(
                    [width, height],
                    project.settings(&display),
                    Default::default(),
                )?;
                atomic_write(Path::new(&output), &artwork::png(&rest)?)?;
            }
            let scene = Playback::stage(&playback_root()?, &project, &display)?;
            desktop::apply(&scene, &display)?;
            ensure!(active(), "Ready player has no live lease");
        }
        _ => anyhow::bail!("Unknown action"),
    }
    Ok(())
}
