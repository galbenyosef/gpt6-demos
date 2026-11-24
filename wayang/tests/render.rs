use anyhow::Result;
use eframe::wgpu;
use image::{Rgba, RgbaImage};
use wyang::{
    artwork,
    gpu::Renderer,
    scene::{Effect, Motion, Pose, Settings},
};

#[test]
fn automatic_effect_animates_water_locally_and_uses_lights_on_other_images() -> Result<()> {
    let instance = wgpu::Instance::default();
    let adapter = pollster::block_on(instance.request_adapter(&Default::default()))?;
    let (device, queue) = pollster::block_on(adapter.request_device(&Default::default()))?;
    let settings = Settings::default();
    let camera = Settings {
        effect: Effect::Camera,
        ..settings
    };
    let size = [800, 600];
    let pose = Pose {
        phase: 0.12,
        animated: true,
        ..Default::default()
    };
    let harbor =
        image::load_from_memory(include_bytes!("../assets/hamburg-harbor.jpg"))?.into_rgba8();
    let renderer = Renderer::new(&device, &queue, &harbor);
    let auto = renderer.capture(size, settings, pose)?;
    let camera_only = renderer.capture(size, camera, pose)?;
    let mut paused = Motion { pose };
    assert!(!paused.step(settings, [1.; 2], 0.1, true, false));
    assert_eq!(renderer.capture(size, settings, paused.pose)?, auto);
    assert!(!paused.step(settings, [1.; 2], 0.1, false, true));
    assert_eq!(
        renderer.capture(size, settings, paused.pose)?,
        renderer.capture(size, camera, Pose::default())?
    );
    assert_eq!(
        auto,
        renderer.capture(
            size,
            Settings {
                effect: Effect::Water,
                ..settings
            },
            pose
        )?
    );
    let changed = |a: &RgbaImage,
                   b: &RgbaImage,
                   x_range: std::ops::Range<u32>,
                   y_range: std::ops::Range<u32>| {
        let mut n = 0;
        for y in y_range {
            for x in x_range.clone() {
                let (p, q) = (a.get_pixel(x, y), b.get_pixel(x, y));
                if (0..3).any(|c| p[c].abs_diff(q[c]) > 12) {
                    n += 1;
                }
            }
        }
        n
    };
    assert_eq!(
        changed(&auto, &camera_only, 50..750, 40..230),
        0,
        "Ripples reached the sky"
    );
    assert_eq!(
        changed(&auto, &camera_only, 70..150, 360..415),
        0,
        "Ripples reached the ship"
    );
    let water_changes = changed(&auto, &camera_only, 450..720, 455..565);
    assert!(
        water_changes > 2000,
        "Only {water_changes} water pixels changed beyond the camera move"
    );
    let flat = RgbaImage::from_pixel(120, 90, Rgba([60, 65, 70, 255]));
    let renderer = Renderer::new(&device, &queue, &flat);
    let a = renderer.capture(size, settings, pose)?;
    assert_eq!(
        a,
        renderer.capture(
            size,
            Settings {
                effect: Effect::Lights,
                ..settings
            },
            pose
        )?
    );
    let b = renderer.capture(
        size,
        settings,
        Pose {
            phase: 0.17,
            ..pose
        },
    )?;
    let light_changes = changed(&a, &b, 0..800, 0..600);
    assert!(
        light_changes > 2400,
        "Only {light_changes} pixels of moving lights on a flat scene"
    );
    assert_eq!(
        renderer.capture(size, settings, Pose::default())?,
        renderer.capture(size, camera, Pose::default())?
    );
    println!(
        "Beyond camera motion: {water_changes} changed water pixels out of 29700, {light_changes} moving light pixels out of 480000"
    );
    Ok(())
}

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
    let s = Settings {
        effect: Effect::Camera,
        ..Default::default()
    };
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
    assert!((11.0..14.0).contains(&far), "Camera moved {far:.2} pixels");
    assert!(
        near - far > 10.,
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
            animated: true,
        },
    )?;
    let left = render.capture(
        [600, 300],
        s,
        Pose {
            pointer: [-1., 0.],
            phase: 0.7,
            animated: true,
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
                    phase: 0.42,
                    animated: true,
                }
            )?
        );
        assert!(a.pixels().all(|p| p[0] >= 20 && p[3] == 255));
    }
    Ok(())
}
