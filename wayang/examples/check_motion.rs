//! Measure horizontal travel in two textured bands of the harbor desktop capture.
use anyhow::{Result, ensure};
use image::{GrayImage, imageops::FilterType};

fn horizontal_shift(a: &GrayImage, b: &GrayImage, row_percent: i32) -> i32 {
    let (w, h) = (a.width() as i32, a.height() as i32);
    let short = w.min(h);
    // Fit a translation to each band, allowing for the vertical component of the sway.
    let radius = (short / 25).max(1);
    let row = h * row_percent / 100;
    let error = |dx: i32, dy: i32| -> u64 {
        let mut sum = 0;
        for y in ((row - h / 40)..(row + h / 40)).step_by(3) {
            for x in (w / 6..w * 5 / 6).step_by(5) {
                let original = a.get_pixel(x as u32, y as u32)[0];
                let shifted = b.get_pixel((x + dx) as u32, (y + dy) as u32)[0];
                sum += u64::from(original.abs_diff(shifted));
            }
        }
        sum
    };
    let mut best = (error(0, 0), 0);
    for dx in -radius..=radius {
        for dy in -radius / 2..=radius / 2 {
            let cost = error(dx, dy);
            if cost < best.0 {
                best = (cost, dx);
            }
        }
    }
    best.1
}

fn main() -> Result<()> {
    let mut frames = Vec::new();
    let mut original_size = None;
    for path in std::env::args_os().skip(1) {
        let image = image::open(path)?;
        let size = (image.width(), image.height());
        ensure!(
            original_size.get_or_insert(size) == &size,
            "Capture size changed"
        );
        frames.push(image.resize(1280, 720, FilterType::Triangle).into_luma8());
    }
    ensure!(
        frames.len() >= 2,
        "Supply two or more captures of the same wallpaper"
    );
    let (w, h) = frames[0].dimensions();
    let to_1080p = 1080. / w.min(h) as f32;
    for (i, a) in frames.iter().enumerate() {
        for b in &frames[i + 1..] {
            let sky = horizontal_shift(a, b, 21) as f32 * to_1080p;
            let water = horizontal_shift(a, b, 87) as f32 * to_1080p;
            println!(
                "Measured horizontal travel at 1080p scale: sky {sky:.1}px, water {water:.1}px"
            );
            if sky.abs() >= 2.0 && (water - sky) * sky.signum() >= 3.0 {
                return Ok(());
            }
        }
    }
    anyhow::bail!("Could not see the foreground travel farther than the background");
}
