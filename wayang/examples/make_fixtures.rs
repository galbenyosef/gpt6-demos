//! Create recognizable, deterministic color studies for the editor's offline provider.
use anyhow::{Context, Result};
use std::path::PathBuf;
use wyang::artwork;
fn main() -> Result<()> {
    let dir = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .context("Expected a destination directory")?,
    );
    std::fs::create_dir_all(&dir)?;
    let harbor = artwork::decode(
        include_bytes!("../assets/hamburg-harbor.jpg"),
        artwork::IMPORT_BYTES,
    )?;
    for (i, (gain, bias)) in [
        ([0.50, 0.62, 0.85], [4., 10., 27.]),
        ([0.80, 0.89, 0.74], [5., 14., 12.]),
        ([1., 0.71, 0.52], [12., 5., 15.]),
    ]
    .into_iter()
    .enumerate()
    {
        let mut im = harbor.clone();
        for p in im.pixels_mut() {
            for c in 0..3 {
                p[c] = (p[c] as f32 * gain[c] + bias[c]).clamp(0., 255.) as u8;
            }
        }
        wyang::project::atomic_write(&dir.join(format!("{}.png", i + 1)), &artwork::png(&im)?)?;
    }
    Ok(())
}
