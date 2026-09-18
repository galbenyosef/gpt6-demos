//! Compile generated source drawings into fixed, ground-registered runtime tiles.
//! No drawing/pose synthesis: only binary alpha, crop, nearest sampling and packing.
use std::{
    fs::File,
    io::{BufReader, BufWriter},
    path::Path,
};

const TILE: usize = 128;
const SIDE: usize = TILE * 4;

fn write(path: &Path, width: usize, height: usize, pixels: &[u8]) {
    let mut encoder = png::Encoder::new(
        BufWriter::new(File::create(path).unwrap()),
        width as u32,
        height as u32,
    );
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.add_text_chunk("Source".into(), "AI-assisted Paco artwork; source and prompts in art/paco/. Compiled with build_paco; no pose synthesis.".into()).unwrap();
    encoder
        .write_header()
        .unwrap()
        .write_image_data(pixels)
        .unwrap();
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut reader = png::Decoder::new(BufReader::new(
        File::open(root.join("art/paco/source-v1.png")).unwrap(),
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
    let mut atlas = vec![0; SIDE * SIDE * 4];
    for frame in 0..16 {
        let (col, row) = (frame % 4, frame / 4);
        let (x0, y0) = ((col * w + 2) / 4, (row * h + 2) / 4);
        let (x1, y1) = (((col + 1) * w + 2) / 4, ((row + 1) * h + 2) / 4);
        let (mut left, mut top, mut right, mut bottom) = (x1, y1, x0, y0);
        for y in y0..y1 {
            for x in x0..x1 {
                if data[(y * w + x) * 4 + 3] >= 192 {
                    left = left.min(x);
                    top = top.min(y);
                    right = right.max(x + 1);
                    bottom = bottom.max(y + 1);
                }
            }
        }
        assert!(right > left && bottom > top);
        // Shared 1/3 scale retains physical proportions: sitting is shorter.
        let (dw, dh) = ((right - left).div_ceil(3), (bottom - top).div_ceil(3));
        assert!(dw <= 112 && dh <= 108, "frame exceeds the safe tile area");
        let ox = (TILE - dw) / 2;
        // Passing run poses lift off slightly; other poses share the same ground.
        let lift = if frame == 5 || frame == 7 { 2 } else { 0 };
        let oy = 116 - lift - dh;
        for y in 0..dh {
            for x in 0..dw {
                let sx = (left + x * 3 + 1).min(right - 1);
                let sy = (top + y * 3 + 1).min(bottom - 1);
                let src = (sy * w + sx) * 4;
                if data[src + 3] < 192 {
                    continue;
                }
                let dst = ((row * TILE + oy + y) * SIDE + col * TILE + ox + x) * 4;
                atlas[dst..dst + 3].copy_from_slice(&data[src..src + 3]);
                atlas[dst + 3] = 255;
            }
        }
        println!(
            "frame {frame:02}: source=({left},{top})..({right},{bottom}) tile=({ox},{oy}) {dw}x{dh}"
        );
    }
    let folder = root.join("resources/packs/paco");
    write(&folder.join("atlas.png"), SIDE, SIDE, &atlas);
    let mut preview = vec![0; TILE * TILE * 4];
    // Standing pose, row 2 col 3, uses exactly the shipped frame pixels.
    for y in 0..TILE {
        let src = ((2 * TILE + y) * SIDE + 3 * TILE) * 4;
        preview[y * TILE * 4..(y + 1) * TILE * 4].copy_from_slice(&atlas[src..src + TILE * 4]);
    }
    write(&folder.join("preview.png"), TILE, TILE, &preview);
}
