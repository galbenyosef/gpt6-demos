#[path = "../editor.rs"]
mod editor;
use anyhow::{Context, Result, bail};
use std::path::PathBuf;
use wyang::provider::Config;

fn main() -> Result<()> {
    let mut fixture = None;
    let mut open = None;
    let mut args = std::env::args_os().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--fixtures" {
            fixture = Some(PathBuf::from(
                args.next().context("Expected a fixture directory")?,
            ));
        } else if arg == "--help" || arg == "-h" {
            println!(
                "wyang [IMAGE | PROJECT_DIRECTORY] [--fixtures DIRECTORY]\nOpen the wallpaper editor. Fixture files are named 1.png through 4.png."
            );
            return Ok(());
        } else if open.is_none() {
            open = Some(PathBuf::from(arg));
        } else {
            bail!("Unexpected argument");
        }
    }
    let config = Config::load(std::path::Path::new("."));
    let opts = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1240., 800.])
            .with_min_inner_size([880., 570.])
            .with_app_id("org.wyang.Editor"),
        ..Default::default()
    };
    eframe::run_native(
        "Wyang",
        opts,
        Box::new(move |cc| Ok(Box::new(editor::Editor::new(cc, config, fixture, open)))),
    )
    .map_err(|e| anyhow::anyhow!("Could not open the editor: {e}"))
}
