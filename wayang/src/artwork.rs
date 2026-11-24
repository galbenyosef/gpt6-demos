use anyhow::{Context, Result, ensure};
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, RgbaImage};
use std::{
    fs::File,
    io::{Cursor, Read},
    path::Path,
    sync::Arc,
};

pub const IMPORT_BYTES: usize = 40 * 1024 * 1024;
pub const PIXELS: u64 = 32_000_000;
// Lossless normalized artwork may occupy more storage than its compressed original.
pub const ART_BYTES: usize = 132 * 1024 * 1024;
pub const UPLOAD_BYTES: usize = 16 * 1024 * 1024;

pub fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let f = File::open(path).context("Could not open the file")?;
    ensure!(
        f.metadata()?.len() <= limit as u64,
        "File exceeds the {} MiB limit",
        limit >> 20
    );
    let mut bytes = Vec::new();
    f.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= limit, "File exceeds its size limit");
    Ok(bytes)
}

pub fn digest(bytes: &[u8]) -> String {
    use sha2::Digest;
    hex::encode(sha2::Sha256::digest(bytes))
}

pub fn decode(bytes: &[u8], limit: usize) -> Result<RgbaImage> {
    ensure!(bytes.len() <= limit, "Encoded image exceeds the size limit");
    let format = image::guess_format(bytes).context("Expected a PNG, JPEG or WebP image")?;
    ensure!(
        matches!(
            format,
            ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP
        ),
        "Choose a PNG, JPEG or WebP image"
    );
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(320 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().context("Invalid image header")?;
    let (w, h) = decoder.dimensions();
    ensure!(
        w > 0 && h > 0 && w as u64 * h as u64 <= PIXELS,
        "Image must be at most 32 megapixels"
    );
    let orientation = decoder.orientation()?;
    let icc = decoder.icc_profile()?;
    let mut img = DynamicImage::from_decoder(decoder).context("Could not decode image data")?;
    img.apply_orientation(orientation);
    if icc.is_none() && img.color_space() != image::metadata::Cicp::SRGB {
        img.apply_color_space(image::metadata::Cicp::SRGB, Default::default())?;
    }
    let mut rgba = img.into_rgba8();
    if let Some(icc) = icc {
        use moxcms::{ColorProfile, DataColorSpace, Layout};
        let profile =
            ColorProfile::new_from_slice(&icc).context("Invalid embedded color profile")?;
        let gray = profile.color_space == DataColorSpace::Gray;
        let transform = profile
            .create_transform_8bit(
                if gray { Layout::Gray } else { Layout::Rgba },
                &ColorProfile::new_srgb(),
                Layout::Rgba,
                Default::default(),
            )
            .context("Unsupported embedded color profile")?;
        let mut row = vec![0; rgba.width() as usize * 4];
        let stride = row.len();
        for line in rgba.as_mut().chunks_exact_mut(stride) {
            let original = &*line;
            let gray_line;
            let input = if gray {
                gray_line = original
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .map(|p| p[0])
                    .collect::<Vec<_>>();
                &gray_line[..]
            } else {
                original
            };
            transform.transform(input, &mut row)?;
            for (pixel, rgb) in line
                .as_chunks_mut::<4>()
                .0
                .iter_mut()
                .zip(row.as_chunks::<4>().0)
            {
                pixel[..3].copy_from_slice(&rgb[..3]);
            }
        }
    }
    Ok(rgba)
}

pub fn png(image: &RgbaImage) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    image::codecs::png::PngEncoder::new(&mut bytes).write_image(
        image,
        image.width(),
        image.height(),
        image::ExtendedColorType::Rgba8,
    )?;
    Ok(bytes)
}

#[derive(Clone)]
pub struct Artwork {
    pub pixels: Arc<RgbaImage>,
    pub thumbnail: Arc<RgbaImage>,
}
impl Artwork {
    pub fn new(image: RgbaImage) -> Self {
        let factor = (144.0 / image.width() as f64)
            .min(90.0 / image.height() as f64)
            .min(1.);
        let thumb = image::imageops::thumbnail(
            &image,
            (image.width() as f64 * factor).round().max(1.) as u32,
            (image.height() as f64 * factor).round().max(1.) as u32,
        );
        Self {
            pixels: Arc::new(image),
            thumbnail: Arc::new(thumb),
        }
    }
}

pub fn upload(image: &RgbaImage) -> Result<Vec<u8>> {
    let mut bytes = png(image)?;
    let mut dims = image.dimensions();
    while bytes.len() > UPLOAD_BYTES {
        let scale = (UPLOAD_BYTES as f64 / bytes.len() as f64).sqrt() * 0.92;
        dims = (
            (dims.0 as f64 * scale).max(1.) as u32,
            (dims.1 as f64 * scale).max(1.) as u32,
        );
        bytes = png(&image::imageops::resize(
            image,
            dims.0,
            dims.1,
            image::imageops::FilterType::Triangle,
        ))?;
    }
    Ok(bytes)
}
