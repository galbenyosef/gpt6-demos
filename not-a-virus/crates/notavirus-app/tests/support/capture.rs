//! Offscreen captures of the production CALayer renderer; no desktop overlay.
use super::bridge::Renderer;
use notavirus_core::{Frame, Rect, TickOutput, Vec2};
use objc2_app_kit::{NSBitmapImageFileType, NSPanel};
use objc2_foundation::NSDictionary;
use std::{fs::File, io::BufWriter, path::Path};

pub fn pack(panel: &NSPanel, root: &Path, id: &str, save: bool) {
    let output = root.join("../../target/native-captures");
    if save {
        std::fs::create_dir_all(&output).unwrap();
    }
    let mut loaded = notavirus_pack::load(&root.join(id)).unwrap();
    let columns = loaded.width as usize / 128;
    let rows = loaded.height as usize / 128;
    let frames = columns * rows;
    let linear = loaded.pack.filter == notavirus_core::Filter::Linear;
    let renderer = Renderer::prepare(&mut loaded).unwrap();
    renderer.attach(panel);
    assert_eq!(
        renderer.layer.magnificationFilter().to_string(),
        if linear { "linear" } else { "nearest" }
    );
    let mut worst_alpha_error: f64 = 0.;
    let mut worst_pixel_error: f64 = 0.;
    let view = panel.contentView().unwrap();
    for scale in [1., 1.5, 2.] {
        let size = (128. * scale) as usize;
        for flip in [false, true] {
            let mut pixel_size = 0;
            let mut sheet = Vec::new();
            for index in 0..frames {
                let frame = Frame {
                    uv: Rect {
                        origin: Vec2::new(
                            (index % columns) as f64 / columns as f64,
                            1. - (index / columns + 1) as f64 / rows as f64,
                        ),
                        size: Vec2::new(1. / columns as f64, 1. / rows as f64),
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
                    sheet.resize(pixel_size * pixel_size * frames * 4, 0);
                }
                assert_eq!(info.width as usize, pixel_size);
                let side = pixel_size * columns;
                assert!(
                    pixels.as_chunks::<4>().0.iter().any(|p| p[3] > 0),
                    "empty native frame"
                );
                // Compare the native snapshot silhouette with the requested
                // source tile, including orientation and anchor-preserving flip.
                // Property assertions alone cannot catch wrong image row order
                // or AppKit ignoring a backing-layer transform.
                let mut mismatches = 0;
                let mut alpha_error = 0.;
                let mut max_alpha_error: f64 = 0.;
                for y in 0..pixel_size {
                    for x in 0..pixel_size {
                        let sx = x * 128 / pixel_size;
                        let sx = if flip { 127 - sx } else { sx };
                        let sy = y * 128 / pixel_size;
                        let source = (((index / columns) * 128 + sy) * loaded.width as usize
                            + (index % columns) * 128
                            + sx)
                            * 4
                            + 3;
                        let actual = pixels[(y * pixel_size + x) * 4 + 3];
                        if linear {
                            let u = (x as f64 + 0.5) * 128. / pixel_size as f64 - 0.5;
                            let u = if flip { 127. - u } else { u };
                            let v = (y as f64 + 0.5) * 128. / pixel_size as f64 - 0.5;
                            let mut expected = 0.;
                            for j in 0..2 {
                                for i in 0..2 {
                                    let sx = (u.floor() as isize + i).clamp(0, 127) as usize;
                                    let sy = (v.floor() as isize + j).clamp(0, 127) as usize;
                                    let weight = if i == 0 {
                                        1. - u.fract().rem_euclid(1.)
                                    } else {
                                        u.fract().rem_euclid(1.)
                                    } * if j == 0 {
                                        1. - v.fract().rem_euclid(1.)
                                    } else {
                                        v.fract().rem_euclid(1.)
                                    };
                                    let a = (((index / columns) * 128 + sy)
                                        * loaded.width as usize
                                        + (index % columns) * 128
                                        + sx)
                                        * 4
                                        + 3;
                                    expected += f64::from(loaded.rgba[a]) * weight;
                                }
                            }
                            let error = (f64::from(actual) - expected).abs();
                            alpha_error += error;
                            max_alpha_error = max_alpha_error.max(error);
                        }
                        mismatches += usize::from((actual >= 128) != (loaded.rgba[source] >= 128));
                    }
                }
                if linear {
                    let mean_error = alpha_error / (pixel_size * pixel_size) as f64;
                    worst_alpha_error = worst_alpha_error.max(mean_error);
                    worst_pixel_error = worst_pixel_error.max(max_alpha_error);
                    let matches = mean_error < 1.5 && max_alpha_error < 64.;
                    if !matches && save {
                        std::fs::write(
                            output.join(format!("{id}-failure-{index}-{size}-{flip}.png")),
                            encoded.to_vec(),
                        )
                        .unwrap();
                    }
                    // AppKit's resampling is not byte-identical to the bilinear
                    // reference. Jellyfish's long outlines give 1.065/255 mean
                    // error at 2× backing despite identical total alpha coverage.
                    // Bound both aggregate error and EVERY pixel: <1.5/255 mean,
                    // <64/255 maximum. The per-pixel cap catches wrong frames,
                    // orientation and shifts that a mean-only budget can hide.
                    assert!(
                        matches,
                        "linear alpha mismatch: pack={id}, frame={index}, scale={scale}, flip={flip}, mean={mean_error}, max={max_alpha_error}"
                    );
                } else {
                    assert_eq!(
                        mismatches, 0,
                        "native silhouette mismatch: pack={id}, frame={index}, scale={scale}, flip={flip}"
                    );
                }
                for y in 0..pixel_size {
                    let dest = (((index / columns) * pixel_size + y) * side
                        + (index % columns) * pixel_size)
                        * 4;
                    sheet[dest..dest + pixel_size * 4]
                        .copy_from_slice(&pixels[y * pixel_size * 4..(y + 1) * pixel_size * 4]);
                }
            }
            if !save {
                continue;
            }
            let side = pixel_size * columns;
            let path = output.join(format!(
                "{id}-{}-{}.png",
                size,
                if flip { "left" } else { "right" }
            ));
            let mut encoder = png::Encoder::new(
                BufWriter::new(File::create(&path).unwrap()),
                side as u32,
                (pixel_size * rows) as u32,
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
        "native pixels: {id}, {frames} frames, three sizes and both facings match source alpha (linear={linear}, worst mean alpha error={worst_alpha_error:.4}/255, worst pixel error={worst_pixel_error:.2}/255)"
    );
}
