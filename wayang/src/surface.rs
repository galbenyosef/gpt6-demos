//! Locate broad patches of cool, horizontally textured water in the lower image.
use image::{GrayImage, Luma, RgbaImage, imageops};

pub struct WaterMask {
    pub pixels: GrayImage,
    pub detected: bool,
}

impl WaterMask {
    pub fn from_image(source: &RgbaImage) -> Self {
        const TILE: u32 = 8;
        let sample = imageops::thumbnail(source, 320, 240);
        let luminance = |x, y| {
            let [r, g, b, _] = sample.get_pixel(x, y).0;
            (3. * r as f32 + 6. * g as f32 + b as f32) / 10.
        };
        let evidence = GrayImage::from_fn(40, 30, |col, row| {
            if row < 15 {
                return Luma([0]);
            }
            let (mut dx, mut dy, mut cool) = (0., 0., 0);
            for y in row * TILE..(row + 1) * TILE - 1 {
                for x in col * TILE..(col + 1) * TILE - 1 {
                    let [r, g, b, a] = sample.get_pixel(x, y).0;
                    cool +=
                        u32::from(a > 200 && b as i16 - r as i16 > 4 && b as f32 > 0.93 * g as f32);
                    let l = luminance(x, y);
                    dx += (l - luminance(x + 1, y)).abs();
                    dy += (l - luminance(x, y + 1)).abs();
                }
            }
            let likely = cool >= 16 && dy > 54. && dy + 29.4 > 0.95 * (dx + 29.4);
            Luma([if likely { 255 } else { 0 }])
        });
        // Isolated blue tiles on masts, clothing or buildings do not form a surface.
        let neighborhood = imageops::blur(&evidence, 1.1);
        let pixels = GrayImage::from_fn(40, 30, |x, y| {
            let coverage = neighborhood.get_pixel(x, y)[0] as f32 / 255.;
            Luma([(((coverage - 0.36) / 0.42).clamp(0., 1.) * 255.) as u8])
        });
        let detected = pixels.iter().filter(|&&v| v > 128).count() >= 72;
        Self { pixels, detected }
    }
}
