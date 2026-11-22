// SPDX-License-Identifier: GPL-2.0-or-later
mod audio;
mod input;
mod peek;
mod ui;

use audio::Audio;
use egui_wgpu::ScreenDescriptor;
use input::{Clock, Input};
use std::{path::PathBuf, sync::Arc, time::Instant};
use temblor::{
    content::Vfs,
    renderer::Renderer,
    session::{self, Session},
};
use ui::{Action, Interface, ORANGE};
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event::{DeviceEvent, DeviceId, ElementState, MouseButton, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, EventLoop},
    keyboard::{KeyCode, PhysicalKey},
    window::{CursorGrabMode, Window, WindowId},
};

const ARENA: &[u8] = include_bytes!("../../assets/arena.pk3");
const ACTORS: &[u8] = include_bytes!("../../assets/actors.pk3");
const SEED: u32 = 1813;
#[derive(Copy, Clone, PartialEq, Eq)]
enum Screen {
    Menu,
    Controls,
    Maps,
    Playing,
    Peek,
}
#[derive(Copy, Clone, PartialEq, Eq)]
enum Start {
    Play,
    Import,
    CheckBundle,
}
struct Import {
    pack: Vfs,
    maps: Vec<String>,
    selected: usize,
}
struct Desktop {
    window: Arc<Window>,
    gpu: Renderer,
    ctx: egui::Context,
    gui: egui_winit::State,
    paint: egui_wgpu::Renderer,
    ui: Interface,
    screen: Screen,
    return_to: Screen,
    clock: Clock,
    session: Option<Session>,
    actors: Vfs,
    import: Option<Import>,
    audio: Option<Audio>,
    focused: bool,
}
fn bundled(name: &str, bytes: &[u8]) -> Result<Vfs, String> {
    let mut pack = Vfs::default();
    pack.mount(name, bytes.to_vec())?;
    Ok(pack)
}
impl Desktop {
    fn new(window: Arc<Window>) -> Result<Self, String> {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let surface = instance
            .create_surface(window.clone())
            .map_err(|e| e.to_string())?;
        let gpu = pollster::block_on(Renderer::from_surface(
            &instance,
            surface,
            size.width,
            size.height,
        ))?;
        let ctx = egui::Context::default();
        let gui = egui_winit::State::new(
            ctx.clone(),
            egui::ViewportId::ROOT,
            window.as_ref(),
            Some(window.scale_factor() as f32),
            None,
            Some(gpu.limit() as usize),
        );
        let paint = egui_wgpu::Renderer::new(&gpu.device, gpu.format(), None, 1, false);
        let mut ui = Interface::new(&ctx);
        let audio = Audio::new()
            .map_err(|err| {
                ui.audio_status = err;
            })
            .ok();
        let actors = bundled("temblor-actors.pk3", ACTORS)?;
        Ok(Self {
            window,
            gpu,
            ctx,
            gui,
            paint,
            ui,
            screen: Screen::Menu,
            return_to: Screen::Menu,
            clock: Clock::new(),
            session: None,
            actors,
            import: None,
            audio,
            focused: true,
        })
    }
    fn capture(&self) -> Result<(), String> {
        if !self.focused {
            return Err("Focus the Temblor window and try again.".into());
        }
        self.window
            .set_cursor_grab(CursorGrabMode::Locked)
            .or_else(|_| self.window.set_cursor_grab(CursorGrabMode::Confined))
            .map_err(|e| format!("Mouse capture failed: {e}"))?;
        self.window.set_cursor_visible(false);
        Ok(())
    }
    fn pause(&mut self) {
        if let Some(s) = &mut self.session {
            s.game.release_controls();
        }
        self.screen = Screen::Menu;
        self.clock = Clock::new();
        let _ = self.window.set_cursor_grab(CursorGrabMode::None);
        self.window.set_cursor_visible(true);
        if let Some(audio) = &mut self.audio {
            audio.pause();
        }
    }
    fn start(&mut self, mode: Start) -> Result<(), String> {
        let loaded = if mode == Start::Import || self.session.is_none() {
            let mut default_pack;
            let (pack, map) = if mode == Start::Import {
                let it = self.import.as_mut().ok_or("Select a PK3 archive first.")?;
                (&mut it.pack, it.maps[it.selected].clone())
            } else {
                default_pack = bundled("temblor-arena.pk3", ARENA)?;
                let name = default_pack
                    .maps()
                    .first()
                    .ok_or("The bundled archive contains no maps.")?
                    .to_string();
                (&mut default_pack, name)
            };
            let speakers = session::speakers(pack, &map)?;
            let ambience = self
                .audio
                .as_ref()
                .map(|a| a.prepare(pack, &speakers))
                .transpose()?;
            let next = Session::load(&self.gpu, pack, &mut self.actors, &map, SEED)?;
            Some((next, ambience))
        } else {
            None
        };
        // The unattended archive check renders in a window without a player.
        if mode != Start::CheckBundle {
            self.capture()?;
        }
        if let Some((next, ambience)) = loaded {
            self.session = Some(next);
            if let (Some(a), Some(loops)) = (&mut self.audio, ambience) {
                a.replace(loops);
            }
            self.import = None;
            self.ui.reset_hud();
        }
        let game = &mut self.session.as_mut().expect("loaded match").game;
        if game.winner.is_some() {
            game.reset();
            self.ui.reset_hud();
        }
        game.set_bot_level(self.ui.level);
        self.clock = Clock::new();
        self.screen = Screen::Playing;
        if let Some(a) = &self.audio {
            a.resume();
        }
        Ok(())
    }
    fn choose_files(&mut self) -> Result<(), String> {
        let Some(paths) = rfd::FileDialog::new()
            .set_parent(self.window.as_ref())
            .set_title("Choose PK3 archives")
            .add_filter("Quake III packages", &["pk3"])
            .pick_files()
        else {
            return Ok(());
        };
        self.import = Some(read_import(paths)?);
        self.screen = Screen::Maps;
        Ok(())
    }
    fn action(&mut self, action: Action) {
        self.ui.error.clear();
        let result = match action {
            Action::Play => self.start(Start::Play),
            Action::Import => self.start(Start::Import),
            Action::ChooseFiles => self.choose_files(),
            Action::Controls => {
                self.screen = Screen::Controls;
                Ok(())
            }
            Action::Peek => {
                if self.session.is_some() {
                    self.return_to = self.screen;
                    if self.screen == Screen::Playing {
                        self.pause();
                    }
                    self.ui.peek = Default::default();
                    self.screen = Screen::Peek;
                }
                Ok(())
            }
            Action::Back if self.screen == Screen::Peek => {
                self.screen = self.return_to;
                if self.screen == Screen::Playing {
                    self.screen = Screen::Menu;
                    self.start(Start::Play)
                } else {
                    Ok(())
                }
            }
            Action::Back => {
                self.import = None;
                self.screen = Screen::Menu;
                Ok(())
            }
        };
        if let Err(e) = result {
            self.ui.error = e;
        }
        self.window.request_redraw();
    }
    /// Returns true once the window surface has presented a frame.
    fn redraw(&mut self) -> Result<bool, String> {
        let size = self.window.inner_size();
        if size.width == 0 || size.height == 0 {
            return Ok(false);
        }
        let mut alpha = 1.;
        if self.screen == Screen::Playing {
            let g = &mut self.session.as_mut().unwrap().game;
            alpha = self.clock.advance(g, Instant::now());
            if let Some(audio) = &mut self.audio {
                audio.update(g, self.ui.volume);
            }
            for e in g.events.drain(..) {
                let own = e["actor"] == 0;
                match e["kind"].as_str() {
                    Some("pain") if !own => self.ui.hit_until = g.time + 150,
                    Some("frag") => {
                        self.ui.feed = if own {
                            "You fragged the bot"
                        } else {
                            "Bot fragged you"
                        }
                        .into();
                        self.ui.feed_until = g.time + 1500;
                    }
                    Some("pickup") if own => {
                        self.ui.feed = e["detail"].as_str().unwrap_or("").replace('_', " ");
                        self.ui.feed_until = g.time + 1500;
                    }
                    _ => {}
                }
            }
            if g.winner.is_some() {
                self.pause();
                alpha = 1.;
            }
        }
        let Some(frame) = self.gpu.acquire()? else {
            self.window.request_redraw();
            return Ok(false);
        };
        let input = self.gui.take_egui_input(&self.window);
        let mut action = None;
        let output = self.ctx.run(input, |ctx| {
            let mut unused = 0;
            let (maps, index) = match self.import.as_mut() {
                Some(i) => (i.maps.as_slice(), &mut i.selected),
                None => (&[][..], &mut unused),
            };
            action = self.ui.show(
                ctx,
                self.screen,
                self.session.as_ref(),
                maps,
                index,
                self.clock.scores(),
            );
        });
        if self.screen != Screen::Playing {
            self.gui
                .handle_platform_output(&self.window, output.platform_output);
        }
        let view = frame.texture.create_view(&Default::default());
        let mut enc = self.gpu.device.create_command_encoder(&Default::default());
        if let Some(s) = &self.session {
            self.gpu.draw(&s.scene, &s.game, alpha, &view, &mut enc);
        }
        let screen = ScreenDescriptor {
            size_in_pixels: [frame.texture.width(), frame.texture.height()],
            pixels_per_point: output.pixels_per_point,
        };
        let shapes = self.ctx.tessellate(output.shapes, output.pixels_per_point);
        for (id, delta) in &output.textures_delta.set {
            self.paint
                .update_texture(&self.gpu.device, &self.gpu.queue, *id, delta);
        }
        let extra = self.paint.update_buffers(
            &self.gpu.device,
            &self.gpu.queue,
            &mut enc,
            &shapes,
            &screen,
        );
        {
            let pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Desktop interface"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: if self.session.is_some() {
                            wgpu::LoadOp::Load
                        } else {
                            wgpu::LoadOp::Clear(wgpu::Color::BLACK)
                        },
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            self.paint
                .render(&mut pass.forget_lifetime(), &shapes, &screen);
        }
        self.gpu
            .queue
            .submit(extra.into_iter().chain([enc.finish()]));
        self.window.pre_present_notify();
        frame.present();
        for id in output.textures_delta.free {
            self.paint.free_texture(&id);
        }
        if let Some(action) = action {
            self.action(action);
        }
        Ok(true)
    }
    fn event(&mut self, ev: &WindowEvent) {
        if self.screen != Screen::Playing {
            let response = self.gui.on_window_event(&self.window, ev);
            if response.repaint {
                self.window.request_redraw();
            }
        }
        match ev {
            WindowEvent::Focused(f) => {
                self.focused = *f;
                if !f {
                    if self.screen == Screen::Playing {
                        self.pause();
                    } else if self.screen == Screen::Peek && self.return_to == Screen::Playing {
                        self.return_to = Screen::Menu;
                    }
                }
                self.window.request_redraw();
            }
            WindowEvent::Resized(s) if s.width > 0 && s.height > 0 => {
                self.gpu.resize(
                    s.width.min(self.gpu.limit()),
                    s.height.min(self.gpu.limit()),
                );
                self.window.request_redraw();
            }
            WindowEvent::KeyboardInput { event, .. } if !event.repeat => {
                let PhysicalKey::Code(key) = event.physical_key else {
                    return;
                };
                let down = event.state == ElementState::Pressed;
                if down && key == KeyCode::Escape {
                    if self.screen == Screen::Playing {
                        self.pause();
                        self.window.request_redraw();
                    } else {
                        self.action(Action::Back);
                    }
                } else if down && key == KeyCode::KeyP {
                    match self.screen {
                        Screen::Playing | Screen::Controls | Screen::Menu => {
                            self.action(Action::Peek)
                        }
                        Screen::Peek => self.action(Action::Back),
                        _ => {}
                    }
                } else if self.screen == Screen::Playing {
                    self.clock.push(Input::Key(key, down));
                }
            }
            WindowEvent::MouseInput {
                state,
                button: MouseButton::Left,
                ..
            } if self.screen == Screen::Playing => self
                .clock
                .push(Input::Fire(*state == ElementState::Pressed)),
            WindowEvent::MouseWheel { delta, .. } if self.screen == Screen::Playing => {
                let y = match delta {
                    MouseScrollDelta::LineDelta(_, y) => *y,
                    MouseScrollDelta::PixelDelta(p) => p.y as f32,
                };
                if y != 0. {
                    self.clock.push(Input::Wheel(if y < 0. { 1 } else { -1 }));
                }
            }
            _ => {}
        }
    }
}
fn read_import(paths: Vec<PathBuf>) -> Result<Import, String> {
    let mut pack = Vfs::default();
    let mut total = 0u64;
    for path in paths {
        let name = path
            .file_name()
            .and_then(|p| p.to_str())
            .ok_or("Invalid archive name")?;
        let size = path.metadata().map_err(|e| format!("{name}: {e}"))?.len();
        total = total.saturating_add(size);
        if size > 600_000_000 || total > 850_000_000 {
            return Err("Selected archives exceed the memory budget".into());
        }
        pack.mount(
            name,
            std::fs::read(&path).map_err(|e| format!("{name}: {e}"))?,
        )?;
    }
    let maps: Vec<_> = pack.maps().into_iter().map(str::to_owned).collect();
    if maps.is_empty() {
        return Err("No maps found. Choose a PK3 containing a .bsp in its maps/ folder.".into());
    }
    Ok(Import {
        pack,
        maps,
        selected: 0,
    })
}
#[derive(Default)]
struct App {
    check_bundle: bool,
    desktop: Option<Desktop>,
    error: Option<String>,
}
impl ApplicationHandler for App {
    fn resumed(&mut self, ev: &ActiveEventLoop) {
        if self.desktop.is_some() {
            return;
        }
        let window = ev.create_window(
            Window::default_attributes()
                .with_title("Temblor")
                .with_inner_size(LogicalSize::new(1100, 700))
                .with_min_inner_size(LogicalSize::new(540, 400)),
        );
        match window
            .map_err(|e| e.to_string())
            .and_then(|w| Desktop::new(Arc::new(w)))
        {
            Ok(d) => {
                d.window.request_redraw();
                self.desktop = Some(d);
            }
            Err(e) => {
                self.error = Some(e);
                ev.exit();
            }
        }
    }
    fn window_event(&mut self, ev: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        let Some(d) = &mut self.desktop else { return };
        match event {
            WindowEvent::CloseRequested => ev.exit(),
            WindowEvent::RedrawRequested => match d.redraw() {
                Ok(true) if self.check_bundle => {
                    if d.session.is_some() {
                        d.gpu.device.poll(wgpu::Maintain::Wait);
                        println!("Rendered the bundled arena and actors.");
                        ev.exit();
                    } else if let Err(e) = d.start(Start::CheckBundle) {
                        self.error = Some(e);
                        ev.exit();
                    }
                }
                Err(e) => {
                    self.error = Some(e);
                    ev.exit();
                }
                _ => {}
            },
            _ => d.event(&event),
        }
    }
    fn device_event(&mut self, _: &ActiveEventLoop, _: DeviceId, event: DeviceEvent) {
        if let Some(d) = &mut self.desktop {
            if d.screen == Screen::Playing {
                if let DeviceEvent::MouseMotion { delta } = event {
                    let scale = -0.0022 * d.ui.sensitivity;
                    d.clock
                        .push(Input::Look(delta.0 as f32 * scale, delta.1 as f32 * scale));
                }
            }
        }
    }
    fn about_to_wait(&mut self, _: &ActiveEventLoop) {
        if let Some(d) = &self.desktop {
            if d.screen == Screen::Playing || d.ctx.has_requested_repaint() {
                d.window.request_redraw();
            }
        }
    }
}
fn main() -> Result<(), String> {
    let event_loop = EventLoop::new().map_err(|e| e.to_string())?;
    let mut app = App {
        check_bundle: std::env::args_os()
            .skip(1)
            .any(|arg| arg == "--check-bundle"),
        ..Default::default()
    };
    event_loop.run_app(&mut app).map_err(|e| e.to_string())?;
    app.error.map_or(Ok(()), Err)
}
