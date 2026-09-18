//! Compile authored gatita drawings: crop, alpha-weighted area sampling and pack.
//! Keep smooth edge alpha; no pose synthesis or binary-alpha pixel-art treatment.
use std::{
    fs::File,
    io::{BufReader, BufWriter},
    path::Path,
};

const TILE: usize = 128;
const COLS: usize = 4;
const ROWS: usize = 6;
const STEP: f64 = 2.7;

fn write(path: &Path, width: usize, height: usize, pixels: &[u8]) {
    let mut encoder = png::Encoder::new(
        BufWriter::new(File::create(path).unwrap()),
        width as u32,
        height as u32,
    );
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.add_text_chunk("Source".into(), "AI-assisted gatita artwork; source/prompts in art/gatita/. Compiled with build_gatita; alpha-weighted area sampling, no pose synthesis.".into()).unwrap();
    encoder
        .write_header()
        .unwrap()
        .write_image_data(pixels)
        .unwrap();
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut reader = png::Decoder::new(BufReader::new(
        File::open(root.join("art/gatita/source-v1.png")).unwrap(),
    ))
    .read_info()
    .unwrap();
    let mut data = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut data).unwrap();
    assert_eq!(info.color_type, png::ColorType::Rgba);
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    let (w, h) = (info.width as usize, info.height as usize);
    assert_eq!(
        (w, h),
        (1024, 1536),
        "source changed: review registration before rebuilding"
    );
    // Normalize only the generated matte's near-transparent/near-opaque tails;
    // retain smooth fractional alpha throughout the antialiased silhouette.
    for p in data.chunks_exact_mut(4) {
        p[3] = ((u16::from(p[3].saturating_sub(8)) * 255 / 240).min(255)) as u8;
    }
    // Extract separated silhouettes rather than trusting the image model's grid.
    // Components can overlap in bounding boxes (a tail beside a neighbour's nose).
    let mut labels = vec![usize::MAX; w * h];
    let mut components = Vec::new();
    let mut label = 0;
    for seed in 0..w * h {
        if data[seed * 4 + 3] == 0 || labels[seed] != usize::MAX {
            continue;
        }
        let mut stack = vec![seed];
        labels[seed] = label;
        let (mut left, mut top, mut right, mut bottom, mut count) = (w, h, 0, 0, 0);
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            left = left.min(x);
            top = top.min(y);
            right = right.max(x + 1);
            bottom = bottom.max(y + 1);
            count += 1;
            for ny in y.saturating_sub(1)..=(y + 1).min(h - 1) {
                for nx in x.saturating_sub(1)..=(x + 1).min(w - 1) {
                    let next = ny * w + nx;
                    if labels[next] == usize::MAX && data[next * 4 + 3] > 0 {
                        labels[next] = label;
                        stack.push(next);
                    }
                }
            }
        }
        if count > 1000 {
            components.push((label, left, top, right, bottom));
        }
        label += 1;
    }
    assert_eq!(
        components.len(),
        24,
        "source must contain 24 separate kitten silhouettes: {components:?}"
    );
    components.sort_by_key(|c| c.4);
    for row in components.chunks_exact_mut(COLS) {
        row.sort_by_key(|c| c.1);
    }
    let mut atlas = vec![0; TILE * COLS * TILE * ROWS * 4];
    for (frame, &(label, left, top, right, bottom)) in components.iter().enumerate() {
        let (col, row) = (frame % COLS, frame / COLS);
        let (dw, dh) = (
            ((right - left) as f64 / STEP).ceil() as usize,
            ((bottom - top) as f64 / STEP).ceil() as usize,
        );
        assert!(
            dw <= 112 && dh <= 104,
            "frame {frame} exceeds safe tile area"
        );
        // Keep the torso still when the seated tail extends to the left.
        let ox = (TILE - dw) / 2 - if frame == 16 { 11 } else { 0 };
        let lift = match frame {
            9 => 8,
            11 => 4,
            _ => 0,
        };
        let oy = 116 - lift - dh;
        for dy in 0..dh {
            for dx in 0..dw {
                let ax = left as f64 + dx as f64 * STEP;
                let ay = top as f64 + dy as f64 * STEP;
                let bx = ax + STEP;
                let by = ay + STEP;
                let mut sums = [0.; 4];
                for sy in ay.floor() as usize..(by.ceil() as usize).min(bottom) {
                    for sx in ax.floor() as usize..(bx.ceil() as usize).min(right) {
                        let weight = (bx.min((sx + 1) as f64) - ax.max(sx as f64))
                            * (by.min((sy + 1) as f64) - ay.max(sy as f64));
                        if labels[sy * w + sx] != label {
                            continue;
                        }
                        let src = (sy * w + sx) * 4;
                        let alpha = data[src + 3] as f64 * weight;
                        sums[3] += alpha;
                        for c in 0..3 {
                            sums[c] += data[src + c] as f64 * alpha;
                        }
                    }
                }
                let dst = ((row * TILE + oy + dy) * COLS * TILE + col * TILE + ox + dx) * 4;
                let alpha = (sums[3] / (STEP * STEP)).round() as u8;
                if alpha > 0 {
                    for c in 0..3 {
                        atlas[dst + c] = (sums[c] / sums[3]).round() as u8;
                    }
                    atlas[dst + 3] = alpha;
                }
            }
        }
        println!(
            "frame {frame:02}: source=({left},{top})..({right},{bottom}) tile=({ox},{oy}) {dw}x{dh}, lift={lift}"
        );
    }
    let mut preview = vec![0; TILE * TILE * 4];
    for y in 0..TILE {
        preview[y * TILE * 4..(y + 1) * TILE * 4]
            .copy_from_slice(&atlas[y * COLS * TILE * 4..(y * COLS + 1) * TILE * 4]);
    }
    for id in ["gatita", "default"] {
        let folder = root.join("resources/packs").join(id);
        write(&folder.join("atlas.png"), COLS * TILE, ROWS * TILE, &atlas);
        write(&folder.join("preview.png"), TILE, TILE, &preview);
    }
    // Keep the fallback pack's behavior and art in sync with gatita.
    let manifest = std::fs::read_to_string(root.join("resources/packs/gatita/pack.toml")).unwrap();
    let default = manifest
        .replace("id = \"gatita\"", "id = \"default\"")
        .replace("name = \"gatita\"", "name = \"gatita (Default)\"")
        .replace("version = 2", "version = 3");
    std::fs::write(root.join("resources/packs/default/pack.toml"), default).unwrap();
}
