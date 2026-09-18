//! Offscreen captures of the production CALayer renderer; no desktop overlay.
use super::bridge::Renderer;
use notavirus_core::{Frame, Rect, TickOutput, Vec2};
use objc2_app_kit::{NSBitmapImageFileType, NSPanel};
use objc2_foundation::NSDictionary;
use std::{fs::File, io::BufWriter, path::Path};

pub fn paco(panel: &NSPanel, root: &Path, save: bool) {
    let output = root.join("../../target/native-captures");
    if save {
        std::fs::create_dir_all(&output).unwrap();
    }
    let mut loaded = notavirus_pack::load(&root.join("paco")).unwrap();
    let renderer = Renderer::prepare(&mut loaded).unwrap();
    renderer.attach(panel);
    let view = panel.contentView().unwrap();
    for scale in [1., 1.5, 2.] {
        let size = (128. * scale) as usize;
        for flip in [false, true] {
            let mut pixel_size = 0;
            let mut sheet = Vec::new();
            for index in 0..16 {
                let frame = Frame {
                    uv: Rect {
                        origin: Vec2::new(
                            (index % 4) as f64 / 4.,
                            1. - (index / 4 + 1) as f64 / 4.,
                        ),
                        size: Vec2::new(0.25, 0.25),
                    },
                    duration: 0.1,
                };
                renderer.apply(
                    panel,
                    &loaded.pack,
                    TickOutput {
                        panel_origin: Vec2::ZERO,
                        panel_size: Vec2::new(size as f64, size as f64),
                        frame,
                        flip_x: flip,
                        screen_id: 1,
                        scale,
                    },
                    2.,
                );
                let bitmap = view
                    .bitmapImageRepForCachingDisplayInRect(view.bounds())
                    .unwrap();
                view.cacheDisplayInRect_toBitmapImageRep(view.bounds(), &bitmap);
                let encoded = unsafe {
                    bitmap.representationUsingType_properties(
                        NSBitmapImageFileType::PNG,
                        &NSDictionary::new(),
                    )
                }
                .unwrap();
                let mut decoder = png::Decoder::new(std::io::Cursor::new(encoded.to_vec()));
                decoder.set_transformations(
                    png::Transformations::EXPAND | png::Transformations::STRIP_16,
                );
                let mut reader = decoder.read_info().unwrap();
                let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
                let info = reader.next_frame(&mut pixels).unwrap();
                assert_eq!(info.color_type, png::ColorType::Rgba);
                if index == 0 {
                    pixel_size = info.width as usize;
                    sheet.resize(pixel_size * pixel_size * 16 * 4, 0);
                }
                assert_eq!(info.width as usize, pixel_size);
                let side = pixel_size * 4;
                assert!(
                    pixels.chunks_exact(4).any(|p| p[3] > 0),
                    "empty native frame"
                );
                // Compare the native snapshot silhouette with the requested
                // source tile, including orientation and anchor-preserving flip.
                // Property assertions alone cannot catch wrong image row order
                // or AppKit ignoring a backing-layer transform.
                let mut mismatches = 0;
                for y in 0..pixel_size {
                    for x in 0..pixel_size {
                        let sx = x * 128 / pixel_size;
                        let sx = if flip { 127 - sx } else { sx };
                        let sy = y * 128 / pixel_size;
                        let source =
                            (((index / 4) * 128 + sy) * 512 + (index % 4) * 128 + sx) * 4 + 3;
                        let actual = pixels[(y * pixel_size + x) * 4 + 3];
                        mismatches += usize::from((actual >= 128) != (loaded.rgba[source] >= 128));
                    }
                }
                assert_eq!(
                    mismatches, 0,
                    "native silhouette mismatch: frame={index}, scale={scale}, flip={flip}"
                );
                for y in 0..pixel_size {
                    let dest =
                        (((index / 4) * pixel_size + y) * side + (index % 4) * pixel_size) * 4;
                    sheet[dest..dest + pixel_size * 4]
                        .copy_from_slice(&pixels[y * pixel_size * 4..(y + 1) * pixel_size * 4]);
                }
            }
            if !save {
                continue;
            }
            let side = pixel_size * 4;
            let path = output.join(format!(
                "paco-{}-{}.png",
                size,
                if flip { "left" } else { "right" }
            ));
            let mut encoder = png::Encoder::new(
                BufWriter::new(File::create(&path).unwrap()),
                side as u32,
                side as u32,
            );
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .unwrap()
                .write_image_data(&sheet)
                .unwrap();
            println!("native capture: {}", path.display());
        }
    }
    println!(
        "native pixels: all 16 Paco frames, three sizes and both facings match source silhouettes exactly"
    );
}
