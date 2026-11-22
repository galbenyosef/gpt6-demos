// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{peek::Peek, Screen};
use egui::{self, Align2, Color32, FontId, Id, Pos2, Rect, RichText, Stroke, Ui, Vec2};
use temblor::{game::NAMES, session::Session};

pub const ORANGE: Color32 = Color32::from_rgb(255, 120, 70);
const INK: Color32 = Color32::from_rgb(246, 242, 232);
const MUTED: Color32 = Color32::from_rgb(197, 196, 182);
const LEVELS: [&str; 6] = [
    "0 · Explore",
    "1 · Rookie",
    "2 · Easy",
    "3 · Standard",
    "4 · Veteran",
    "5 · Expert",
];

pub enum Action {
    Play,
    Controls,
    ChooseFiles,
    Import,
    Back,
    Peek,
}
pub struct Interface {
    pub level: u8,
    pub sensitivity: f32,
    pub volume: f32,
    pub error: String,
    pub audio_status: String,
    image: egui::TextureHandle,
    pub peek: Peek,
    pub hit_until: u32,
    pub feed_until: u32,
    pub feed: String,
}
impl Interface {
    pub fn new(ctx: &egui::Context) -> Self {
        let mut style = (*ctx.style()).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.override_text_color = Some(INK);
        style.visuals.panel_fill = Color32::from_rgb(23, 27, 25);
        style.visuals.selection.bg_fill = Color32::from_rgb(121, 60, 37);
        style.visuals.widgets.hovered.bg_stroke = Stroke::new(1.5_f32, ORANGE);
        style.spacing.item_spacing = egui::vec2(10., 10.);
        style.spacing.button_padding = egui::vec2(15., 9.);
        style
            .text_styles
            .insert(egui::TextStyle::Body, FontId::proportional(16.));
        style
            .text_styles
            .insert(egui::TextStyle::Button, FontId::proportional(16.));
        ctx.set_style(style);
        let img = image::load_from_memory(include_bytes!(
            "../../assets/source/levelshots/oa_rpg3dm2.jpg"
        ))
        .expect("bundled levelshot")
        .into_rgba8();
        let color = egui::ColorImage::from_rgba_unmultiplied(
            [img.width() as usize, img.height() as usize],
            img.as_raw(),
        );
        Self {
            level: 3,
            sensitivity: 1.,
            volume: 0.65,
            error: String::new(),
            audio_status: String::new(),
            image: ctx.load_texture("Trial by Error", color, egui::TextureOptions::LINEAR),
            peek: Peek::default(),
            hit_until: 0,
            feed_until: 0,
            feed: String::new(),
        }
    }
    fn level_picker(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.label("Bot level");
            egui::ComboBox::from_id_salt("bot-level")
                .width(145.)
                .selected_text(LEVELS[self.level as usize])
                .show_ui(ui, |ui| {
                    for (n, label) in LEVELS.iter().enumerate() {
                        ui.selectable_value(&mut self.level, n as u8, *label);
                    }
                });
        });
    }
    pub fn reset_hud(&mut self) {
        self.hit_until = 0;
        self.feed_until = 0;
        self.feed.clear();
    }
    pub fn show(
        &mut self,
        ctx: &egui::Context,
        screen: Screen,
        session: Option<&Session>,
        maps: &[String],
        selected: &mut usize,
        scores: bool,
    ) -> Option<Action> {
        let mut action = None;
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                let rect = ui.max_rect();
                let name = session
                    .and_then(|s| {
                        s.info["title"]
                            .as_str()
                            .filter(|title| !title.is_empty())
                            .or_else(|| s.info["map"].as_str())
                    })
                    .unwrap_or("Trial by Error");
                if screen == Screen::Playing {
                    if let Some(session) = session {
                        self.hud(ui, rect, session, name, scores);
                    }
                    return;
                }
                if session.is_none() {
                    let aspect = rect.aspect_ratio() / self.image.aspect_ratio();
                    let crop = egui::vec2(aspect.min(1.), aspect.recip().min(1.));
                    let uv = Rect::from_center_size(Pos2::new(0.5, 0.5), crop);
                    ui.painter()
                        .image(self.image.id(), rect, uv, Color32::from_rgb(116, 121, 113));
                }
                let shade = if screen == Screen::Menu { 148 } else { 195 };
                ui.painter()
                    .rect_filled(rect, 0., Color32::from_black_alpha(shade));
                let inset = (rect.width() * 0.055).clamp(18., 66.);
                let mut content = rect.shrink2(Vec2::new(inset, 18.));
                if screen == Screen::Peek {
                    ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
                        ui.horizontal(|ui| {
                            ui.heading("Peek");
                            ui.label(name);
                            if ui.button("Close  [P]").clicked() {
                                action = Some(Action::Back);
                            }
                        });
                        let hint = "Drag or use arrows to orbit   ·   Scroll or use + / − to zoom   ·   WASD to move after closing";
                        ui.label(RichText::new(hint).color(MUTED));
                        if let Some(session) = session {
                            self.peek.show(ui, session);
                        }
                    });
                    return;
                }
                content.min.y += (content.height() * 0.19).min(110.);
                ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
                    let heading = match screen {
                        Screen::Menu => match session.map(|s| s.game.winner) {
                            None => "TEMBLOR",
                            Some(None) => "Paused",
                            Some(Some(0)) => "You win",
                            Some(Some(_)) => "Bot wins",
                        },
                        Screen::Controls => "Controls",
                        Screen::Maps => "Local game files",
                        _ => unreachable!(),
                    };
                    let size = if screen == Screen::Menu {
                        (content.width() * 0.108).clamp(46., 96.)
                    } else {
                        36.
                    };
                    ui.label(RichText::new(heading).size(size).strong().italics());
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, true])
                        .show(ui, |ui| {
                            action = match screen {
                                Screen::Menu => self.menu(ui, name, session),
                                Screen::Controls => self.controls(ui, session.is_some()),
                                Screen::Maps => Self::map_picker(ui, maps, selected),
                                _ => unreachable!(),
                            };
                            if !self.error.is_empty() {
                                ui.colored_label(ORANGE, &self.error);
                            }
                            if !self.audio_status.is_empty() {
                                ui.colored_label(MUTED, &self.audio_status);
                            }
                        });
                });
            });
        action
    }
    fn menu(&mut self, ui: &mut Ui, name: &str, session: Option<&Session>) -> Option<Action> {
        let subtitle = match session {
            Some(s) => format!(
                "{name}   /   You {}  –  {} Bot",
                s.game.actors[0].score, s.game.actors[1].score
            ),
            None => format!("{name}   /   One on one   /   First to five"),
        };
        ui.label(RichText::new(subtitle).size(21.).color(MUTED));
        ui.add_space(10.);
        self.level_picker(ui);
        let label = match session {
            None => "Play",
            Some(s) if s.game.winner.is_some() => "Rematch",
            _ => "Resume",
        };
        ui.horizontal_wrapped(|ui| {
            if primary(ui, label) {
                return Some(Action::Play);
            }
            if ui.button("Controls").clicked() {
                return Some(Action::Controls);
            }
            ui.button("Load local game files")
                .clicked()
                .then_some(Action::ChooseFiles)
        })
        .inner
    }
    fn controls(&mut self, ui: &mut Ui, loaded: bool) -> Option<Action> {
        self.level_picker(ui);
        ui.add(egui::Slider::new(&mut self.sensitivity, 0.2..=3.).text("Mouse sensitivity"));
        ui.add(egui::Slider::new(&mut self.volume, 0.0..=1.).text("Volume"));
        ui.label("W A S D    Move       Mouse    Aim       Left click    Fire");
        ui.label("Space    Jump       C    Crouch       1–9 / Wheel    Weapon");
        ui.label("Tab    Scores       Esc    Pause       P    Peek");
        ui.horizontal(|ui| {
            if ui
                .add_enabled(loaded, egui::Button::new("Peek  [P]"))
                .clicked()
            {
                return Some(Action::Peek);
            }
            ui.button("Back").clicked().then_some(Action::Back)
        })
        .inner
    }
    fn map_picker(ui: &mut Ui, maps: &[String], selected: &mut usize) -> Option<Action> {
        ui.label("Choose a map from your selected PK3s.");
        egui::ComboBox::from_id_salt("maps")
            .width(280.)
            .selected_text(&maps[*selected])
            .show_ui(ui, |ui| {
                for (i, map) in maps.iter().enumerate() {
                    ui.selectable_value(selected, i, map);
                }
            });
        ui.horizontal_wrapped(|ui| {
            if primary(ui, "Play selected map") {
                return Some(Action::Import);
            }
            if ui.button("Choose PK3 archives").clicked() {
                return Some(Action::ChooseFiles);
            }
            ui.button("Back").clicked().then_some(Action::Back)
        })
        .inner
    }
    fn hud(&self, ui: &Ui, rect: Rect, s: &Session, name: &str, scores: bool) {
        let g = &s.game;
        let a = &g.actors[0];
        let p = ui.painter();
        let inner = rect.shrink(22.);
        let label = |id: &str, anchor: Align2, pos: Pos2, text: String| {
            egui::Area::new(Id::new(id))
                .pivot(anchor)
                .fixed_pos(pos)
                .interactable(false)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(Color32::from_black_alpha(187))
                        .inner_margin(9)
                        .show(ui, |ui| {
                            ui.add(
                                egui::Label::new(RichText::new(text).strong().size(17.)).extend(),
                            );
                        });
                });
        };
        label(
            "map",
            Align2::LEFT_TOP,
            inner.left_top(),
            format!("{name}   {:02}:{:02}", g.time / 60000, (g.time / 1000) % 60),
        );
        label(
            "score",
            Align2::RIGHT_TOP,
            inner.right_top(),
            format!("You {}   /   Bot {}", a.score, g.actors[1].score),
        );
        label(
            "health",
            Align2::LEFT_BOTTOM,
            inner.left_bottom(),
            format!("Health {}    Armor {}", a.hp.max(0), a.armor),
        );
        label(
            "weapon",
            Align2::RIGHT_BOTTOM,
            inner.right_bottom(),
            format!(
                "{}    {}",
                NAMES[a.gun],
                if a.gun == 1 {
                    "∞".into()
                } else {
                    a.ammo[a.gun].to_string()
                }
            ),
        );
        let c = rect.center();
        if a.hp > 0 {
            let hit = g.time < self.hit_until;
            let axis = if hit {
                egui::vec2(0.707, 0.707)
            } else {
                Vec2::X
            };
            for d in [axis, -axis, axis.rot90(), -axis.rot90()] {
                p.line_segment(
                    [c + d * 3., c + d * 8.],
                    Stroke::new(2_f32, if hit { ORANGE } else { INK }),
                );
            }
        } else {
            p.text(
                c,
                Align2::CENTER_CENTER,
                "Respawning",
                FontId::proportional(24.),
                INK,
            );
        }
        if g.time < self.feed_until {
            p.text(
                c + egui::vec2(0., 35.),
                Align2::CENTER_TOP,
                &self.feed,
                FontId::proportional(17.),
                INK,
            );
        }
        if scores {
            label(
                "board",
                Align2::CENTER_CENTER,
                c,
                format!(
                    "First to five     You {}    /    Bot {}",
                    a.score, g.actors[1].score
                ),
            );
        }
    }
}
fn primary(ui: &mut Ui, label: &str) -> bool {
    ui.add(
        egui::Button::new(
            RichText::new(label)
                .strong()
                .color(Color32::from_rgb(28, 20, 15)),
        )
        .min_size(egui::vec2(115., 38.))
        .fill(ORANGE),
    )
    .clicked()
}
