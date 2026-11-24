use anyhow::Result;
use eframe::egui::{self, Color32, RichText, Vec2, vec2};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, mpsc},
    time::{Duration, Instant},
};
use wyang::{
    artwork,
    desktop::{self, Display, Status},
    gpu::{Canvas, Renderer},
    project::{self, Playback, Project, SOURCE},
    provider::{Batch, Config, Fixtures, Job, Provider},
    scene::{self, Motion, Pose, Settings},
};

const SURFACE: Color32 = Color32::from_rgb(35, 39, 41);
const GROUND: Color32 = Color32::from_rgb(23, 27, 29);
const ACCENT: Color32 = Color32::from_rgb(245, 196, 125);
const INK: Color32 = Color32::from_rgb(34, 29, 22);
const MUTED: Color32 = Color32::from_rgb(176, 184, 184);
const SAMPLE: &[u8] = include_bytes!("../assets/hamburg-harbor.jpg");

enum Event {
    Loaded(u64, Result<Option<Project>>),
    Finished(Result<Option<String>>),
    Saved(u64, Result<Option<PathBuf>>),
    Generated(Job),
    Host(Status),
}
#[derive(Clone)]
struct Sender {
    tx: mpsc::Sender<Event>,
    ctx: egui::Context,
}
impl Sender {
    fn send(&self, event: Event) {
        if self.tx.send(event).is_ok() {
            self.ctx.request_repaint();
        }
    }
    fn spawn(&self, work: impl FnOnce() -> Event + Send + 'static) {
        let out = self.clone();
        std::thread::spawn(move || out.send(work()));
    }
}
pub struct Editor {
    project: Option<Project>,
    canvas: Canvas,
    thumbs: HashMap<String, egui::TextureHandle>,
    provider: Option<Arc<dyn Provider>>,
    fixture: bool,
    model: String,
    config_error: Option<String>,
    tx: Sender,
    rx: mpsc::Receiver<Event>,
    serial: u64,
    project_id: u64,
    load_id: u64,
    loading: bool,
    busy: bool,
    batch: Option<Batch>,
    count: usize,
    status: Status,
    displays: Vec<Display>,
    window: Arc<winit::window::Window>,
    next_probe: Instant,
    probing: bool,
    note: String,
    failed: bool,
    compare: bool,
    actual: bool,
    framing: bool,
    motion: Motion,
    keyboard: Option<[f32; 2]>,
    last: Instant,
}
fn frame(color: Color32, pad: i8) -> egui::Frame {
    egui::Frame::new().fill(color).inner_margin(pad)
}
fn title(ui: &mut egui::Ui, text: &str) {
    ui.label(RichText::new(text).strong().size(18.));
}
fn primary(text: &str) -> egui::Button<'_> {
    egui::Button::new(RichText::new(text).strong().color(INK))
        .fill(ACCENT)
        .min_size(vec2(90., 32.))
}
fn load(path: PathBuf) -> Result<Project> {
    if path.is_dir() {
        Project::open(&path)
    } else if path.file_name().is_some_and(|n| n == "project.json") {
        Project::open(path.parent().unwrap_or(Path::new(".")))
    } else {
        Project::import(&path)
    }
}
impl Editor {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        config: Result<Config>,
        fixtures: Option<PathBuf>,
        open: Option<PathBuf>,
    ) -> Self {
        let ctx = &cc.egui_ctx;
        ctx.set_theme(egui::Theme::Dark);
        ctx.global_style_mut(|s| {
            s.text_styles
                .insert(egui::TextStyle::Body, egui::FontId::proportional(14.));
            s.text_styles
                .insert(egui::TextStyle::Button, egui::FontId::proportional(14.));
            s.text_styles
                .insert(egui::TextStyle::Small, egui::FontId::proportional(12.));
            s.visuals.widgets.noninteractive.fg_stroke.color = Color32::from_rgb(209, 214, 214);
            s.visuals.panel_fill = SURFACE;
            s.visuals.window_fill = SURFACE;
            s.visuals.extreme_bg_color = GROUND;
            s.visuals.selection.bg_fill = Color32::from_rgb(100, 77, 48);
            s.visuals.selection.stroke = egui::Stroke::new(1.5, ACCENT);
            s.visuals.widgets.inactive.weak_bg_fill = Color32::from_rgb(55, 60, 62);
            s.visuals.widgets.active.fg_stroke.color = ACCENT;
            s.spacing.item_spacing = vec2(8., 8.);
            s.spacing.button_padding = vec2(10., 6.);
        });
        let (tx, rx) = mpsc::channel();
        let tx = Sender {
            tx,
            ctx: ctx.clone(),
        };
        let fixture = fixtures.is_some();
        let mut model = String::new();
        let result = config.and_then(|c| {
            model = c.model.clone();
            if !c.ready() {
                return Ok(None);
            }
            if let Some(dir) = fixtures {
                model = format!("fixture/{model}");
                return Ok(Some(Arc::new(Fixtures(dir)) as Arc<dyn Provider>));
            }
            Ok(c.client()?.map(|p| Arc::new(p) as Arc<dyn Provider>))
        });
        let (provider, config_error) = match result {
            Ok(p) => (p, None),
            Err(e) => (None, Some(e.to_string())),
        };
        tx.spawn(move || {
            Event::Loaded(
                1,
                (|| {
                    let p = if let Some(path) = open {
                        load(path)?
                    } else {
                        Project::from_bytes("Hamburg harbor.jpg".into(), SAMPLE.to_vec())?
                    };
                    Ok(Some(p))
                })(),
            )
        });
        Self {
            window: cc.winit_window().unwrap().clone(),
            project: None,
            canvas: Canvas::new(cc.wgpu_render_state.clone().unwrap()),
            thumbs: Default::default(),
            tx,
            rx,
            model,
            config_error,
            provider,
            fixture,
            serial: 1,
            project_id: 0,
            load_id: 1,
            loading: true,
            busy: false,
            batch: None,
            count: 3,
            status: Status::default(),
            displays: vec![],
            probing: false,
            next_probe: Instant::now(),
            note: String::new(),
            failed: false,
            compare: false,
            actual: false,
            framing: false,
            motion: Default::default(),
            keyboard: None,
            last: Instant::now(),
        }
    }
    fn notify(&mut self, msg: String, failed: bool) {
        self.note = msg;
        self.failed = failed;
    }
    fn events(&mut self) {
        while let Ok(ev) = self.rx.try_recv() {
            match ev {
                Event::Loaded(id, res) if id == self.load_id => {
                    self.loading = false;
                    match res {
                        Ok(Some(p)) => {
                            if let Some(b) = &mut self.batch {
                                b.cancel();
                            }
                            self.batch = None;
                            self.thumbs.clear();
                            self.motion = Default::default();
                            let bad = p.unavailable.len();
                            self.project = Some(p);
                            self.project_id = id;
                            self.notify(if bad>0{format!("{bad} unavailable variation(s). Select an available image below.")}else{String::new()},bad>0);
                        }
                        Ok(None) => {}
                        Err(e) => self.notify(format!("{e:#}"), true),
                    }
                }
                Event::Loaded(..) => {}
                Event::Finished(res) => {
                    self.busy = false;
                    self.next_probe = Instant::now();
                    match res {
                        Ok(Some(m)) => self.notify(m, false),
                        Ok(None) => {}
                        Err(e) => self.notify(format!("{e:#}"), true),
                    }
                }
                Event::Saved(id, res) => {
                    self.busy = false;
                    match res {
                        Ok(Some(path)) => {
                            if self.project_id == id
                                && let Some(p) = &mut self.project
                            {
                                p.directory = Some(path.clone());
                            }
                            self.notify(format!("Saved project to {}", path.display()), false);
                        }
                        Ok(None) => {}
                        Err(e) => self.notify(format!("{e:#}"), true),
                    }
                }
                Event::Generated(job) => {
                    if self.batch.as_mut().is_some_and(|b| b.accept(&job)) {
                        match job.result {
                            Ok((c, g)) => {
                                if let Some(p) = &mut self.project {
                                    p.add(c, g);
                                }
                                self.note.clear();
                            }
                            Err(e) => self.notify(e.to_string(), true),
                        }
                    }
                }
                Event::Host(s) => {
                    self.status = s;
                    self.probing = false;
                }
            }
        }
    }
    fn import(&mut self, path: Option<PathBuf>, project: bool) {
        self.serial += 1;
        self.load_id = self.serial;
        let id = self.serial;
        self.loading = true;
        self.tx.spawn(move || {
            let path = path.or_else(|| {
                if project {
                    rfd::FileDialog::new()
                        .set_title("Open Wyang project")
                        .pick_folder()
                } else {
                    rfd::FileDialog::new()
                        .add_filter("Images", &["png", "jpeg", "jpg", "webp"])
                        .pick_file()
                }
            });
            Event::Loaded(id, path.map(load).transpose())
        });
    }
    fn generate(&mut self, retry: bool) {
        let (Some(p), Some(provider)) = (self.project.clone(), self.provider.clone()) else {
            return;
        };
        if self.batch.as_ref().is_some_and(|b| b.active) {
            return;
        }
        self.serial += 1;
        if retry {
            if self
                .batch
                .as_mut()
                .is_none_or(|b| b.retry(self.serial).is_err())
            {
                return;
            }
        } else {
            self.batch = Batch::new(
                self.serial,
                self.count,
                p.manifest.prompt.clone(),
                self.model.clone(),
            )
            .ok();
        }
        let Some(batch) = self.batch.clone() else {
            return;
        };
        let out = self.tx.clone();
        self.note.clear();
        std::thread::spawn(move || batch.run(&*provider, &p, |j| out.send(Event::Generated(j))));
    }
    fn finish(&mut self, work: impl FnOnce() -> Result<Option<String>> + Send + 'static) {
        self.busy = true;
        self.tx.spawn(move || Event::Finished(work()));
    }
    fn target(&self) -> Display {
        let id = self
            .project
            .as_ref()
            .map(|p| p.manifest.display.as_str())
            .unwrap_or("");
        self.displays
            .iter()
            .find(|d| d.id == id)
            .or(self.displays.first())
            .cloned()
            .unwrap_or(Display {
                id: "preview".into(),
                name: "Preview".into(),
                size: [1920, 1080],
                scale: 1.,
            })
    }
    fn toolbar(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(vec2(30., 30.), egui::Sense::hover());
            let p = ui.painter();
            let o = rect.min;
            for offset in [0., 6., 12.] {
                p.line_segment(
                    [o + vec2(2., 8. + offset), o + vec2(13., 3. + offset)],
                    (2., ACCENT),
                );
                p.line_segment(
                    [o + vec2(13., 3. + offset), o + vec2(26., 8. + offset)],
                    (2., ACCENT),
                );
            }
            ui.label(RichText::new("Wyang").size(24.).strong());
            ui.separator();
            ui.label(RichText::new("Wallpaper studio").color(MUTED));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui
                    .add_enabled(
                        !self.busy && self.project.is_some(),
                        egui::Button::new("Export still"),
                    )
                    .clicked()
                {
                    let p = self.project.as_ref().unwrap();
                    let display = self.target();
                    let settings = p.settings(&display.id);
                    let image = p.chosen().pixels.clone();
                    let (device, queue) = self.canvas.device();
                    self.finish(move || {
                        let Some(path) = rfd::FileDialog::new()
                            .set_file_name("wallpaper.png")
                            .add_filter("PNG", &["png"])
                            .save_file()
                        else {
                            return Ok(None);
                        };
                        let png = Renderer::new(&device, &queue, &image).capture(
                            display.size,
                            settings,
                            Pose::default(),
                        )?;
                        project::atomic_write(&path, &artwork::png(&png)?)?;
                        Ok(Some(format!(
                            "Exported {} × {} still to {}",
                            display.size[0],
                            display.size[1],
                            path.display()
                        )))
                    });
                }
                if ui
                    .add_enabled(
                        !self.busy && self.project.is_some(),
                        egui::Button::new("Save project"),
                    )
                    .clicked()
                {
                    let p = self.project.clone().unwrap();
                    let id = self.project_id;
                    self.busy = true;
                    self.tx.spawn(move || {
                        Event::Saved(
                            id,
                            (|| {
                                let Some(path) = p.directory.clone().or_else(|| {
                                    rfd::FileDialog::new()
                                        .set_title("Save Wyang project directory")
                                        .set_file_name("Wallpaper.wyang")
                                        .save_file()
                                }) else {
                                    return Ok(None);
                                };
                                p.save(&path)?;
                                Ok(Some(path))
                            })(),
                        )
                    });
                }
                if ui
                    .add_enabled(!self.loading, egui::Button::new("Open project"))
                    .clicked()
                {
                    self.import(None, true);
                }
            });
        });
    }
    fn inspector(&mut self, ui: &mut egui::Ui) {
        title(ui, "Source image");
        if let Some(p) = &self.project {
            ui.label(&p.manifest.source_name);
            ui.small(format!(
                "{} × {} pixels",
                p.source.pixels.width(),
                p.source.pixels.height()
            ));
        }
        if ui
            .add_enabled(!self.loading, egui::Button::new("Open image…"))
            .clicked()
        {
            self.import(None, false);
        }
        ui.add_space(7.);
        ui.separator();
        ui.add_space(4.);
        title(ui, "Describe your edit");
        let active = self.batch.as_ref().is_some_and(|b| b.active);
        let mut can_generate = false;
        if let Some(p) = &mut self.project {
            let label = ui.label("Prompt");
            ui.add(
                egui::TextEdit::multiline(&mut p.manifest.prompt)
                    .desired_rows(3)
                    .desired_width(f32::INFINITY)
                    .hint_text("Keep the boats and skyline. Make it blue hour."),
            )
            .labelled_by(label.id);
            can_generate = !p.manifest.prompt.trim().is_empty();
        }
        ui.horizontal(|ui| {
            ui.label("Variations");
            for n in 1..=4 {
                ui.selectable_value(&mut self.count, n, n.to_string());
            }
        });
        let service = if self.fixture {
            "Local fixtures"
        } else {
            "OpenAI"
        };
        if let Some(p) = &self.project {
            ui.small(format!(
                "{service} · {} and the prompt above · {} edits",
                p.manifest.source_name, self.count
            ));
        }
        if ui
            .add_enabled(
                can_generate && self.provider.is_some() && !active && !self.loading,
                primary("Generate"),
            )
            .clicked()
        {
            self.generate(false);
        }
        if self.provider.is_none() {
            ui.label(
                RichText::new(
                    self.config_error
                        .as_deref()
                        .unwrap_or("Set OPENAI_API_KEY to enable generation."),
                )
                .small()
                .color(ACCENT),
            );
        }
        if let Some(b) = &self.batch {
            let (ready, total, active) = (b.ready, b.total, b.active);
            ui.label(format!("{ready} of {total} ready"));
            if active {
                if ui.button("Cancel").clicked() {
                    self.batch.as_mut().unwrap().cancel();
                    self.notify(
                        "Cancelled. A submitted request may still incur usage.".into(),
                        false,
                    );
                }
            } else if ready < total && ui.button("Retry unfinished edits").clicked() {
                self.generate(true);
            }
        }
        ui.add_space(8.);
        ui.separator();
        ui.add_space(4.);
        let display = self.target();
        if let Some(p) = &mut self.project {
            let mut s = p.settings(&display.id);
            title(ui, "Motion");
            let mut percent = s.strength * 100.;
            let label = ui.label("Motion strength");
            ui.add(
                egui::Slider::new(&mut percent, 0.0..=1.0)
                    .fixed_decimals(2)
                    .suffix("%"),
            )
            .labelled_by(label.id)
            .on_hover_text(
                "Maximum foreground displacement as a fraction of the display's short edge",
            );
            s.strength = percent / 100.;
            ui.checkbox(&mut s.ambient, "Ambient drift");
            ui.add_space(4.);
            ui.collapsing("Framing", |ui| {
                ui.checkbox(&mut self.framing, "Drag to reposition crop");
                ui.add(egui::Slider::new(&mut s.focal[0], 0.0..=1.0).text("Horizontal"));
                ui.add(egui::Slider::new(&mut s.focal[1], 0.0..=1.0).text("Vertical"));
            });
            ui.collapsing("Depth", |ui| {
                ui.label("Horizon in the image");
                let mut h = s.horizon * 100.;
                ui.add(egui::Slider::new(&mut h, 0.0..=99.0).suffix("%"));
                s.horizon = h / 100.;
            });
            if ui.button("Reset adjustments").clicked() {
                s = Settings::default();
                self.motion = Default::default();
            }
            if s != p.settings(&display.id) {
                p.set_settings(&display.id, s);
            }
        }
    }
    fn strip(&mut self, ui: &mut egui::Ui) {
        let Some(p) = &mut self.project else { return };
        ui.horizontal(|ui| {
            title(ui, "Variations");
            ui.small(format!("{} generated", p.manifest.variants.len()));
        });
        egui::ScrollArea::horizontal()
            .id_salt("strip")
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let mut ids = vec![(SOURCE.to_owned(), "Original".to_owned())];
                    ids.extend(
                        p.manifest
                            .variants
                            .iter()
                            .enumerate()
                            .map(|(i, v)| (v.id.clone(), format!("Edit {}", i + 1))),
                    );
                    for (id, label) in ids {
                        let selected = p.manifest.selected == id;
                        let art = if id == SOURCE {
                            Some(&p.source)
                        } else {
                            p.candidates.get(&id).map(|c| &c.art)
                        };
                        if let Some(art) = art {
                            let t = self.thumbs.entry(id.clone()).or_insert_with(|| {
                                let thumb = &art.thumbnail;
                                ui.ctx().load_texture(
                                    &id,
                                    egui::ColorImage::from_rgba_unmultiplied(
                                        [thumb.width() as usize, thumb.height() as usize],
                                        thumb,
                                    ),
                                    Default::default(),
                                )
                            });
                            let image = egui::Image::new((t.id(), vec2(50., 34.)))
                                .maintain_aspect_ratio(true);
                            let r = ui.add(
                                egui::Button::image_and_text(image, &label)
                                    .selected(selected)
                                    .min_size(vec2(105., 42.)),
                            );
                            if r.clicked() {
                                p.manifest.selected = id;
                                self.motion = Default::default();
                            }
                            if r.gained_focus() {
                                r.scroll_to_me(None);
                            }
                        } else {
                            ui.add_enabled(
                                false,
                                egui::Button::new(format!("{label} · unavailable")),
                            )
                            .on_disabled_hover_text(&p.unavailable[&id]);
                        }
                    }
                });
            });
    }
    fn footer(&mut self, ui: &mut egui::Ui) {
        let display = self.target();
        let active = self.status.active.contains(&display.id);
        ui.horizontal_wrapped(|ui| {
            ui.label("Display");
            egui::ComboBox::from_id_salt("display")
                .selected_text(&display.name)
                .show_ui(ui, |ui| {
                    for d in &self.displays {
                        if ui.selectable_label(display.id == d.id, &d.name).clicked()
                            && let Some(p) = &mut self.project
                        {
                            p.manifest.display = d.id.clone();
                        }
                    }
                });
            ui.small(format!("{} × {}", display.size[0], display.size[1]));
            if ui
                .add_enabled(
                    self.project.is_some() && !self.busy && self.status.available(),
                    primary("Apply to display"),
                )
                .clicked()
            {
                let p = self.project.clone().unwrap();
                let d = display.clone();
                self.finish(move || {
                    let id = Playback::stage(&project::playback_root()?, &p, &d.id)?;
                    desktop::apply(&id, &d.id)?;
                    Ok(Some(format!("Wallpaper active on {}", d.name)))
                });
            }
            if active
                && ui
                    .add_enabled(!self.busy, egui::Button::new("Stop wallpaper"))
                    .clicked()
            {
                self.finish(move || {
                    desktop::stop(&display.id)?;
                    Ok(Some(format!("Wallpaper stopped on {}", display.name)))
                });
            }
        });
        if !self.status.reason.is_empty() {
            ui.small(&self.status.reason);
        }
        if self.busy {
            ui.label("Working…");
        }
        if !self.note.is_empty() {
            ui.label(RichText::new(&self.note).color(if self.failed { ACCENT } else { MUTED }));
        }
    }
    fn preview(&mut self, ui: &mut egui::Ui) {
        let target = self.target();
        let Some(p) = &mut self.project else {
            ui.centered_and_justified(|ui| {
                ui.label(if self.loading {
                    "Opening image…"
                } else {
                    "Open or drop a PNG, JPEG or WebP image"
                })
            });
            return;
        };
        let mut s = p.settings(&target.id);
        ui.horizontal_wrapped(|ui| {
            title(ui, "Preview");
            ui.separator();
            ui.selectable_value(&mut s.motion, false, "Still");
            ui.selectable_value(&mut s.motion, true, "Motion");
            if ui
                .add_enabled(
                    s.motion,
                    egui::Button::new(if s.held_pose.is_some() {
                        "Resume"
                    } else {
                        "Pause"
                    }),
                )
                .clicked()
            {
                s.held_pose = if s.held_pose.is_some() {
                    None
                } else {
                    Some(self.motion.pose)
                };
            }
            ui.toggle_value(&mut self.actual, "Actual size");
            let r = ui.add_enabled(
                p.manifest.selected != SOURCE,
                egui::Button::new("View original"),
            );
            self.compare = r.is_pointer_button_down_on()
                || (r.has_focus()
                    && ui.input(|i| i.key_down(egui::Key::Space) || i.key_down(egui::Key::Enter)));
        });
        if s != p.settings(&target.id) {
            p.set_settings(&target.id, s);
        }
        ui.add_space(6.);
        let art = if self.compare { &p.source } else { p.chosen() };
        let extent = [art.pixels.width(), art.pixels.height()];
        let crop = scene::crop(extent, target.size, s.focal);
        let ppp = ui.ctx().pixels_per_point();
        let available = ui.available_size().max(vec2(1., 1.));
        let aspect = target.size[0] as f32 / target.size[1] as f32;
        let w = available.x.min(available.y * aspect);
        let size = if self.actual {
            vec2(
                crop.span[0] * extent[0] as f32,
                crop.span[1] * extent[1] as f32,
            ) / ppp
        } else {
            vec2(w, w / aspect)
        };
        let pixels = art.pixels.clone();
        let mut paint = |ui: &mut egui::Ui| {
            let (rect, r) = ui.allocate_exact_size(size, egui::Sense::click_and_drag());
            r.widget_info(|| {
                egui::WidgetInfo::labeled(
                    egui::WidgetType::Image,
                    true,
                    "Wallpaper preview. Use arrow keys to inspect motion.",
                )
            });
            if r.clicked() {
                r.request_focus();
            }
            let pointer = r.hover_pos().map(|pos| {
                [
                    (pos.x - rect.left()) * 2. / size.x - 1.,
                    (pos.y - rect.top()) * 2. / size.y - 1.,
                ]
            });
            if ui.input(|i| i.pointer.delta() != Vec2::ZERO) {
                self.keyboard = None;
            }
            if r.has_focus() {
                ui.input(|i| {
                    for (key, point) in [
                        (egui::Key::ArrowLeft, [-1., 0.]),
                        (egui::Key::ArrowRight, [1., 0.]),
                        (egui::Key::ArrowUp, [0., -1.]),
                        (egui::Key::ArrowDown, [0., 1.]),
                        (egui::Key::Home, [0.; 2]),
                    ] {
                        if i.key_pressed(key) {
                            self.keyboard = Some(point);
                        }
                    }
                });
            }
            if self.framing && r.dragged() {
                let drag = r.drag_delta() / size;
                s.focal = [
                    (crop.center[0] - drag.x * crop.span[0])
                        .clamp(crop.bounds[0], 1. - crop.bounds[0]),
                    (crop.center[1] - drag.y * crop.span[1])
                        .clamp(crop.bounds[1], 1. - crop.bounds[1]),
                ];
                p.set_settings(&target.id, s);
            }
            let now = Instant::now();
            let dt = (now - self.last).as_secs_f32();
            self.last = now;
            if self.motion.step(
                s,
                self.keyboard.or(pointer).unwrap_or([0.; 2]),
                dt,
                false,
                self.status.reduced,
            ) {
                ui.ctx().request_repaint_after(Duration::from_millis(33));
            }
            let resolution = [
                (size.x * ppp).round().max(1.) as u32,
                (size.y * ppp).round().max(1.) as u32,
            ];
            match self
                .canvas
                .frame(&pixels, target.size, resolution, s, self.motion.pose)
            {
                Ok(id) => {
                    ui.painter().image(
                        id,
                        rect,
                        egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1., 1.)),
                        Color32::WHITE,
                    );
                }
                Err(e) => {
                    self.note = e.to_string();
                    self.failed = true;
                }
            }
        };
        if self.actual {
            egui::ScrollArea::both()
                .id_salt("pixel-inspection")
                .show(ui, paint);
        } else {
            ui.vertical_centered(|ui| {
                ui.add_space((available.y - size.y) * 0.5);
                paint(ui);
            });
        }
    }
}
impl eframe::App for Editor {
    fn ui(&mut self, ui: &mut egui::Ui, _: &mut eframe::Frame) {
        self.events();
        if Instant::now() >= self.next_probe && !self.probing {
            self.probing = true;
            self.next_probe = Instant::now() + Duration::from_secs(2);
            self.tx.spawn(|| Event::Host(desktop::status()));
        }
        self.displays = if self.status.displays.is_empty() {
            desktop::monitors(&self.window)
        } else {
            self.status.displays.clone()
        };
        ui.ctx().request_repaint_after(Duration::from_secs(2));
        if let Some(path) =
            ui.input(|i| i.raw.dropped_files.first().map(|f| f.path().to_path_buf()))
        {
            self.import(Some(path), false);
        }
        egui::Panel::top("toolbar")
            .frame(frame(SURFACE, 12))
            .show(ui, |ui| self.toolbar(ui));
        egui::Panel::left("inspector")
            .exact_size(269.)
            .resizable(false)
            .frame(frame(SURFACE, 17))
            .show(ui, |ui| {
                egui::ScrollArea::vertical()
                    .id_salt("controls")
                    .show(ui, |ui| self.inspector(ui));
            });
        egui::Panel::bottom("finish")
            .frame(frame(SURFACE, 12))
            .show(ui, |ui| self.footer(ui));
        egui::Panel::bottom("variations")
            .frame(frame(GROUND, 14))
            .show(ui, |ui| self.strip(ui));
        egui::CentralPanel::default()
            .frame(frame(GROUND, 16))
            .show(ui, |ui| self.preview(ui));
    }
}
