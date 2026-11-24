#[path = "wyang-player/metrics.rs"]
mod metrics;
use anyhow::{Context, Result, ensure};
use eframe::egui;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use wyang::{
    desktop::Input,
    gpu::Canvas,
    project::{Playback, playback_root},
    scene::Motion,
};

struct Player {
    metrics: Option<metrics::Metrics>,
    scene: Playback,
    pixels: Arc<image::RgbaImage>,
    gpu: Canvas,
    motion: Motion,
    input: Arc<Mutex<Option<Input>>>,
    last: Instant,
    next_frame: Instant,
    #[cfg(target_os = "linux")]
    logical: [f32; 2],
    first: bool,
    #[cfg(target_os = "macos")]
    host: wyang::desktop::platform::Host,
}
impl eframe::App for Player {
    fn logic(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        #[cfg(target_os = "macos")]
        if self.host.should_close() {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }
        if self.input.lock().unwrap().is_none() {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }
    }
    fn ui(&mut self, ui: &mut egui::Ui, _: &mut eframe::Frame) {
        #[cfg(target_os = "linux")]
        let input = *self.input.lock().unwrap();
        #[cfg(target_os = "macos")]
        let input = self.host.sample(ui.ctx());
        let Some(input) = input else {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        };
        #[cfg(target_os = "linux")]
        if !input.suspended && input.logical != self.logical {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::MinInnerSize(input.logical.into()));
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::InnerSize(input.logical.into()));
            self.logical = input.logical;
        }
        let now = Instant::now();
        let interval = Duration::from_secs_f64(1.0 / 30.0);
        let mut continuing = false;
        if !input.suspended && now >= self.next_frame {
            continuing = self.motion.step(
                self.scene.settings,
                input.pointer,
                (now - self.last).as_secs_f32(),
                input.paused,
                input.reduced,
            );
            self.last = now;
            self.next_frame += interval;
            if self.next_frame <= now {
                self.next_frame = now + interval;
            }
        } else if !input.suspended {
            // A host event may precede the next animation tick.
            continuing = true;
        }
        if !input.suspended || self.first {
            let before = self.gpu.frames;
            let began = Instant::now();
            if self
                .gpu
                .frame(
                    &self.pixels,
                    input.size,
                    input.size,
                    self.scene.settings,
                    self.motion.pose,
                )
                .is_err()
            {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }
            if before != self.gpu.frames
                && let Some(m) = &mut self.metrics
            {
                m.frame(began, input.size);
            }
        }
        if let Some(id) = self.gpu.texture_id() {
            ui.painter().image(
                id,
                ui.max_rect(),
                egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1., 1.)),
                egui::Color32::WHITE,
            );
        }
        if self.first {
            self.first = false;
            #[cfg(target_os = "linux")]
            println!("ready");
            #[cfg(target_os = "macos")]
            self.host.ready();
        }
        if continuing {
            // egui subtracts one predicted frame from every timed repaint. Wake at
            // the scene deadline so intervening UI passes do not spin the compositor.
            let prediction = ui.input(|i| Duration::from_secs_f32(i.predicted_dt));
            ui.ctx().request_repaint_after(
                self.next_frame.saturating_duration_since(Instant::now()) + prediction,
            );
        }
    }
}
fn main() -> Result<()> {
    ensure!(
        std::env::var_os("OPENAI_API_KEY").is_none(),
        "The player requires a credential-free environment"
    );
    let mut args = std::env::args().skip(1);
    let id = args.next().context("Expected a playback scene ID")?;
    let width: u32 = args.next().context("Missing width")?.parse()?;
    let height: u32 = args.next().context("Missing height")?.parse()?;
    let initial = Input::new([width, height]);
    ensure!(initial.valid(), "Invalid display geometry");
    let (scene, pixels) = Playback::load(&playback_root()?, &id)?;
    ensure!(
        args.next().as_deref() == Some(&scene.display),
        "Scene is for a different display"
    );
    let options = eframe::NativeOptions {
        #[cfg(target_os = "macos")]
        event_loop_builder: Some(Box::new(|builder| {
            use winit::platform::macos::{ActivationPolicy, EventLoopBuilderExtMacOS};
            builder
                .with_activation_policy(ActivationPolicy::Accessory)
                .with_activate_ignoring_other_apps(false);
        })),
        viewport: egui::ViewportBuilder::default()
            .with_title("Wyang wallpaper")
            .with_app_id("org.wyang.Player")
            .with_decorations(false)
            .with_taskbar(false)
            .with_active(false)
            .with_mouse_passthrough(true)
            .with_min_inner_size(if cfg!(target_os = "linux") {
                initial.logical
            } else {
                [1., 1.]
            })
            .with_inner_size(initial.logical)
            .with_clamp_size_to_monitor_size(false),
        ..Default::default()
    };
    eframe::run_native(
        "Wyang wallpaper",
        options,
        Box::new(move |cc| {
            let input = Arc::new(Mutex::new(Some(initial)));
            #[cfg(target_os = "linux")]
            listen_to_shell(input.clone(), cc.egui_ctx.clone());
            #[cfg(target_os = "macos")]
            let host = wyang::desktop::platform::Host::attach(cc, &scene.display, &id)?;
            let state = cc.wgpu_render_state.as_ref().context("GPU unavailable")?;
            let player = Player {
                metrics: metrics::Metrics::new(&state.adapter, &state.device),
                scene,
                pixels,
                gpu: Canvas::new(state.clone()),
                motion: Motion::default(),
                input,
                last: Instant::now(),
                next_frame: Instant::now(),
                first: true,
                #[cfg(target_os = "linux")]
                logical: initial.logical,
                #[cfg(target_os = "macos")]
                host,
            };
            Ok(Box::new(player))
        }),
    )
    .map_err(|e| anyhow::anyhow!("Player could not start: {e}"))
}

#[cfg(target_os = "linux")]
fn listen_to_shell(input: Arc<Mutex<Option<Input>>>, ctx: egui::Context) {
    use std::io::{BufRead, Read};
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin().lock();
        loop {
            let mut line = String::new();
            let Ok(length) = stdin.by_ref().take(4097).read_line(&mut line) else {
                break;
            };
            if !(1..=4096).contains(&length) || !line.ends_with('\n') {
                break;
            }
            let Ok(next) = serde_json::from_str::<Input>(&line) else {
                break;
            };
            if !next.valid() {
                break;
            }
            *input.lock().unwrap() = Some(next);
            ctx.request_repaint();
        }
        *input.lock().unwrap() = None;
        ctx.request_repaint();
    });
}
