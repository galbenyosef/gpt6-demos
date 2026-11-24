use anyhow::Result;
use eframe::wgpu;
use image::{Rgba, RgbaImage};
use wyang::{
    artwork,
    gpu::Renderer,
    scene::{Pose, Settings},
};
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
