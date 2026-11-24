use anyhow::Result;
use eframe::wgpu;
use image::{Rgba, RgbaImage};
use wyang::{
    artwork,
    gpu::Renderer,
    scene::{Motion, Pose, Settings},
};

#[test]
fn default_wallpaper_moves_the_foreground_against_the_background_with_a_parked_pointer()
-> Result<()> {
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
    // A vertical line crosses both depth regions. Track its center in the output pixels.
    let size = [1920, 1080];
    let photo = RgbaImage::from_fn(size[0], size[1], |x, _| {
        let value = if x.abs_diff(960) < 3 { 255 } else { 0 };
        Rgba([value, value, value, 255])
    });
    let renderer = Renderer::new(&device, &queue, &photo);
    let s = Settings::default();
    let mut motion = Motion::default();
    let rest = renderer.capture(size, s, motion.pose)?;
    for _ in 0..90 {
        assert!(motion.step(s, [0.; 2], 1. / 30., false, false));
    }
    let moving = renderer.capture(size, s, motion.pose)?;
    let center = |frame: &RgbaImage, y| {
        let line = frame.rows().nth(y).unwrap();
        let (weighted, total) = line.enumerate().fold((0., 0.), |(sum, total), (x, p)| {
            let value = f64::from(p[0]);
            (sum + x as f64 * value, total + value)
        });
        weighted / total
    };
    let far = center(&rest, 200) - center(&moving, 200);
    let near = center(&rest, 1000) - center(&moving, 1000);
    assert!((4.0..6.0).contains(&far), "Camera moved {far:.2} pixels");
    assert!(
        near - far > 5.,
        "Foreground {near:.2}px, background {far:.2}px"
    );
    println!(
        "Parked pointer after 3 seconds at 1080p: background {far:.2}px, foreground {near:.2}px"
    );
    assert!(!motion.step(s, [1.; 2], 0.1, true, false));
    assert_eq!(renderer.capture(size, s, motion.pose)?, moving);
    assert!(!motion.step(s, [1.; 2], 0.1, false, true));
    assert_eq!(renderer.capture(size, s, motion.pose)?, rest);
    Ok(())
}
#[test]
fn shared_gpu_renderer_exports_repeatable_rest_and_depth_weighted_motion() -> Result<()> {
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
    let image = RgbaImage::from_fn(600, 300, |x, y| {
        Rgba([20 + (x % 201) as u8, 20 + (y % 201) as u8, 130, 255])
    });
    let render = Renderer::new(&device, &queue, &image);
    let s = Settings {
        ambient: false,
        strength: 0.01,
        ..Default::default()
    };
    let still = render.capture([600, 300], s, Pose::default())?;
    assert_eq!(
        artwork::decode(&artwork::png(&still)?, artwork::ART_BYTES)?,
        still
    );
    let right = render.capture(
        [600, 300],
        s,
        Pose {
            pointer: [1., 0.],
            phase: 0.3,
        },
    )?;
    let left = render.capture(
        [600, 300],
        s,
        Pose {
            pointer: [-1., 0.],
            phase: 0.7,
        },
    )?;
    assert_eq!(right[(100, 15)], left[(100, 15)]);
    assert!(right[(100, 288)][0] > left[(100, 288)][0] + 3);
    for dims in [[180, 320], [320, 180], [384, 112]] {
        let s = Settings {
            strength: 0.,
            focal: [1., 0.],
            ..s
        };
        let a = render.capture(dims, s, Pose::default())?;
        assert_eq!(
            a,
            render.capture(
                dims,
                s,
                Pose {
                    pointer: [-1., 1.],
                    phase: 0.42
                }
            )?
        );
        assert!(a.pixels().all(|p| p[0] >= 20 && p[3] == 255));
    }
    Ok(())
}
