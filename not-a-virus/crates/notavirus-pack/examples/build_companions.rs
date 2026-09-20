//! Compile the authored Jellyfish UFO and Living Ink sheets without drawing poses.
//! Extract connected alpha silhouettes, register, area-sample and pack RGBA tiles.
use std::{
    fs::File,
    io::{BufReader, BufWriter},
    path::Path,
};

const TILE: usize = 128;
const COLS: usize = 4;
const FRAMES: usize = 16;
const STEP: f64 = 3.1;

#[derive(Clone)]
struct Component {
    label: usize,
    count: usize,
    left: usize,
    top: usize,
    right: usize,
    bottom: usize,
}

fn write(path: &Path, width: usize, height: usize, pixels: &[u8], id: &str) {
    let mut encoder = png::Encoder::new(
        BufWriter::new(File::create(path).unwrap()),
        width as u32,
        height as u32,
    );
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.add_text_chunk("Source".into(), format!(
        "AI-assisted {id} artwork; source/prompts in art/{id}/. Compiled with build_companions; alpha-weighted area sampling, no pose synthesis."
    )).unwrap();
    encoder
        .write_header()
        .unwrap()
        .write_image_data(pixels)
        .unwrap();
}

fn compile(root: &Path, id: &str) {
    let mut reader = png::Decoder::new(BufReader::new(
        File::open(root.join(format!("art/{id}/source-v1.png"))).unwrap(),
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
        (1254, 1254),
        "source changed: review registration before rebuilding"
    );
    // Same matte-tail normalization as gatita. Keep the generated soft edge
    // rather than introducing a binary silhouette or sampling hidden RGB.
    for p in data.as_chunks_mut::<4>().0 {
        p[3] = ((u16::from(p[3].saturating_sub(8)) * 255 / 240).min(255)) as u8;
    }
    // Source spacing is approximate. Cell crops would cut a tendril or satellite
    // droplet; component labels preserve silhouettes even when bounds overlap.
    let mut labels = vec![usize::MAX; w * h];
    let mut components = Vec::new();
    for seed in 0..w * h {
        if data[seed * 4 + 3] == 0 || labels[seed] != usize::MAX {
            continue;
        }
        let label = components.len();
        let mut c = Component {
            label,
            count: 0,
            left: w,
            top: h,
            right: 0,
            bottom: 0,
        };
        let mut stack = vec![seed];
        labels[seed] = label;
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            c.left = c.left.min(x);
            c.top = c.top.min(y);
            c.right = c.right.max(x + 1);
            c.bottom = c.bottom.max(y + 1);
            c.count += 1;
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
        components.push(c);
    }
    let mut bodies = components
        .iter()
        .filter(|c| c.count > 10_000)
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(
        bodies.len(),
        FRAMES,
        "expected sixteen separate character bodies"
    );
    bodies.sort_by_key(|c| c.top);
    for row in bodies.as_chunks_mut::<COLS>().0 {
        row.sort_by_key(|c| c.left);
    }
    let mut bounds = bodies.clone();
    let mut owners = vec![usize::MAX; components.len()];
    for (frame, body) in bodies.iter().enumerate() {
        owners[body.label] = frame;
    }
    if id == "living-ink" {
        // Satellites sit to the right of their authored body. Restrict matching
        // to that side before choosing the nearest bounds: the second chase
        // pose's droplets overlap the next pose's trailing end in source space.
        for c in components
            .iter()
            .filter(|c| (128..=10_000).contains(&c.count))
        {
            let x = (c.left + c.right) / 2;
            let y = (c.top + c.bottom) / 2;
            let (frame, distance) = bodies
                .iter()
                .enumerate()
                .filter(|(_, b)| x > (b.left + b.right) / 2)
                .map(|(i, b)| {
                    let dx = b.left.saturating_sub(x) + x.saturating_sub(b.right);
                    let dy = b.top.saturating_sub(y) + y.saturating_sub(b.bottom);
                    (i, dx * dx + dy * dy)
                })
                .min_by_key(|&(_, distance)| distance)
                .unwrap();
            assert!(distance < 80 * 80, "unassigned ink satellite: {}", c.label);
            owners[c.label] = frame;
            let b = &mut bounds[frame];
            b.left = b.left.min(c.left);
            b.top = b.top.min(c.top);
            b.right = b.right.max(c.right);
            b.bottom = b.bottom.max(c.bottom);
        }
    }
    let mut atlas = vec![0; TILE * COLS * TILE * COLS * 4];
    for (frame, b) in bounds.iter().enumerate() {
        let dw = ((b.right - b.left) as f64 / STEP).ceil() as usize;
        let dh = ((b.bottom - b.top) as f64 / STEP).ceil() as usize;
        let ox = (TILE - dw) / 2;
        // Ink stays on its pooled base. Jellyfish register by bell height, so
        // curling tendrils do not drag the bell down to the virtual ground.
        let oy = if id == "jellyfish-ufo" {
            [
                16, 14, 16, 18, 18, 20, 18, 16, 18, 20, 16, 16, 30, 31, 22, 18,
            ][frame]
        } else {
            116 - dh
        };
        assert!(
            ox >= 8 && ox + dw <= 120 && oy >= 8 && oy + dh <= 116,
            "frame {frame} exceeds safe tile area: {ox},{oy} {dw}x{dh}"
        );
        for dy in 0..dh {
            for dx in 0..dw {
                let ax = b.left as f64 + dx as f64 * STEP;
                let ay = b.top as f64 + dy as f64 * STEP;
                let (bx, by) = (ax + STEP, ay + STEP);
                let mut sums = [0.; 4];
                for sy in ay.floor() as usize..(by.ceil() as usize).min(b.bottom) {
                    for sx in ax.floor() as usize..(bx.ceil() as usize).min(b.right) {
                        let label = labels[sy * w + sx];
                        if label == usize::MAX || owners[label] != frame {
                            continue;
                        }
                        let weight = (bx.min((sx + 1) as f64) - ax.max(sx as f64))
                            * (by.min((sy + 1) as f64) - ay.max(sy as f64));
                        let src = (sy * w + sx) * 4;
                        let alpha = data[src + 3] as f64 * weight;
                        sums[3] += alpha;
                        for channel in 0..3 {
                            sums[channel] += data[src + channel] as f64 * alpha;
                        }
                    }
                }
                let dst =
                    ((frame / COLS * TILE + oy + dy) * COLS * TILE + frame % COLS * TILE + ox + dx)
                        * 4;
                let alpha = (sums[3] / (STEP * STEP)).round() as u8;
                if alpha > 0 {
                    for channel in 0..3 {
                        atlas[dst + channel] = (sums[channel] / sums[3]).round() as u8;
                    }
                    atlas[dst + 3] = alpha;
                }
            }
        }
        println!(
            "{id} {frame:02}: source=({},{})..({},{}) tile=({ox},{oy}) {dw}x{dh}",
            b.left, b.top, b.right, b.bottom
        );
    }
    let folder = root.join("resources/packs").join(id);
    write(
        &folder.join("atlas.png"),
        COLS * TILE,
        COLS * TILE,
        &atlas,
        id,
    );
    let mut preview = vec![0; TILE * TILE * 4];
    for y in 0..TILE {
        preview[y * TILE * 4..(y + 1) * TILE * 4]
            .copy_from_slice(&atlas[y * COLS * TILE * 4..(y * COLS + 1) * TILE * 4]);
    }
    write(&folder.join("preview.png"), TILE, TILE, &preview, id);
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    assert!(
        args.len() <= 1,
        "usage: build_companions [jellyfish-ufo|living-ink]"
    );
    for id in ["jellyfish-ufo", "living-ink"] {
        if args.is_empty() || args[0] == id {
            compile(&root, id);
        }
    }
    assert!(
        args.is_empty() || ["jellyfish-ufo", "living-ink"].contains(&args[0].as_str()),
        "unknown pack id"
    );
}
