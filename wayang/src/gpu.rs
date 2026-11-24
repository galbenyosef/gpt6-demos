//! The display and PNG paths both render into the same RGBA8 target.
use crate::scene::{self, Pose, Settings};
use anyhow::{Result, ensure};
use eframe::{
    egui,
    egui_wgpu::RenderState,
    wgpu::{self, util::DeviceExt},
};
use image::RgbaImage;
use std::sync::Arc;

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
fn descriptor(size: [u32; 2], usage: wgpu::TextureUsages) -> wgpu::TextureDescriptor<'static> {
    wgpu::TextureDescriptor {
        label: Some("Wyang artwork"),
        size: wgpu::Extent3d {
            width: size[0],
            height: size[1],
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMAT,
        usage,
        view_formats: &[],
    }
}

pub struct Renderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    uniform: wgpu::Buffer,
    group: wgpu::BindGroup,
    image: [u32; 2],
}
impl Renderer {
    pub fn new(device: &wgpu::Device, queue: &wgpu::Queue, pixels: &RgbaImage) -> Self {
        let size = [pixels.width(), pixels.height()];
        let max = device.limits().max_texture_dimension_2d;
        let resized;
        let data = if *size.iter().max().unwrap() > max {
            let scale = max as f64 / pixels.width().max(pixels.height()) as f64;
            resized = image::imageops::resize(
                pixels,
                (pixels.width() as f64 * scale).max(1.) as u32,
                (pixels.height() as f64 * scale).max(1.) as u32,
                image::imageops::FilterType::Triangle,
            );
            &resized
        } else {
            pixels
        };
        let texture = device.create_texture_with_data(
            queue,
            &descriptor(
                [data.width(), data.height()],
                wgpu::TextureUsages::TEXTURE_BINDING,
            ),
            Default::default(),
            data,
        );
        let module = device.create_shader_module(wgpu::include_wgsl!("scene.wgsl"));
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Wyang parallax"),
            layout: None,
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vertex"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fragment"),
                targets: &[Some(FORMAT.into())],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 32,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(
                        &texture.create_view(&Default::default()),
                    ),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform.as_entire_binding(),
                },
            ],
        });
        Self {
            device: device.clone(),
            queue: queue.clone(),
            pipeline,
            uniform,
            group,
            image: size,
        }
    }
    pub fn target(&self, size: [u32; 2]) -> Result<wgpu::Texture> {
        ensure!(
            size.iter()
                .all(|&v| v > 0 && v <= self.device.limits().max_texture_dimension_2d),
            "Display exceeds the graphics device's texture limit"
        );
        Ok(self.device.create_texture(&descriptor(
            size,
            wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
        )))
    }
    pub fn draw(&self, view: &wgpu::TextureView, values: [f32; 8]) {
        self.queue
            .write_buffer(&self.uniform, 0, bytemuck::cast_slice(&values));
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                ..Default::default()
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.group, &[]);
            pass.draw(0..3, 0..1);
        }
        self.queue.submit([encoder.finish()]);
    }
    pub fn capture(&self, size: [u32; 2], settings: Settings, pose: Pose) -> Result<RgbaImage> {
        let tex = self.target(size)?;
        self.draw(
            &tex.create_view(&Default::default()),
            scene::uniforms(self.image, size, settings, pose),
        );
        let stride = (size[0] * 4).next_multiple_of(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT);
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: stride as u64 * size[1] as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut enc = self.device.create_command_encoder(&Default::default());
        enc.copy_texture_to_buffer(
            tex.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(stride),
                    rows_per_image: None,
                },
            },
            tex.size(),
        );
        self.queue.submit([enc.finish()]);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer.slice(..).map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        self.device.poll(wgpu::PollType::wait_indefinitely())?;
        rx.recv()??;
        let mapped = buffer.slice(..).get_mapped_range()?;
        let bytes = mapped
            .chunks_exact(stride as usize)
            .flat_map(|r| r[..size[0] as usize * 4].iter().copied())
            .collect();
        Ok(RgbaImage::from_raw(size[0], size[1], bytes).expect("complete texture readback"))
    }
}

/// Each view owns its source texture, uniform buffer and output. Only changed poses render.
pub struct Canvas {
    state: RenderState,
    source: Option<(Arc<RgbaImage>, Renderer)>,
    output: Option<([u32; 2], wgpu::TextureView, egui::TextureId)>,
    last: Option<[f32; 8]>,
    pub frames: u64,
}
impl Canvas {
    pub fn new(state: RenderState) -> Self {
        Self {
            state,
            source: None,
            output: None,
            last: None,
            frames: 0,
        }
    }
    pub fn device(&self) -> (wgpu::Device, wgpu::Queue) {
        (self.state.device.clone(), self.state.queue.clone())
    }
    pub fn frame(
        &mut self,
        pixels: &Arc<RgbaImage>,
        target: [u32; 2],
        resolution: [u32; 2],
        settings: Settings,
        pose: Pose,
    ) -> Result<egui::TextureId> {
        if self
            .source
            .as_ref()
            .is_none_or(|s| !Arc::ptr_eq(&s.0, pixels))
        {
            self.source = Some((
                pixels.clone(),
                Renderer::new(&self.state.device, &self.state.queue, pixels),
            ));
            self.last = None;
        }
        let render = &self.source.as_ref().unwrap().1;
        if self.output.as_ref().is_none_or(|o| o.0 != resolution) {
            let view = render.target(resolution)?.create_view(&Default::default());
            let mut gui = self.state.renderer.write();
            if let Some((_, _, id)) = self.output.take() {
                gui.free_texture(&id);
            }
            let id =
                gui.register_native_texture(&self.state.device, &view, wgpu::FilterMode::Linear);
            self.output = Some((resolution, view, id));
            self.last = None;
        }
        let (_, view, id) = self.output.as_ref().unwrap();
        let values = scene::uniforms(render.image, target, settings, pose);
        if self.last != Some(values) {
            render.draw(view, values);
            self.last = Some(values);
            self.frames += 1;
        }
        Ok(*id)
    }
}
impl Drop for Canvas {
    fn drop(&mut self) {
        if let Some((_, _, id)) = self.output.take() {
            self.state.renderer.write().free_texture(&id);
        }
    }
}
