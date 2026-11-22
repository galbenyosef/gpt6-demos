// SPDX-License-Identifier: GPL-2.0-or-later
use egui::{
    epaint::{Mesh, Shape},
    Color32, FontId, Pos2, Rect, Sense, Stroke, Ui, Vec2,
};
use glam::Vec3;
use temblor::session::Session;

pub struct Peek {
    angle: f32,
    tilt: f32,
    zoom: f32,
}
impl Default for Peek {
    fn default() -> Self {
        Self {
            angle: -0.88,
            tilt: 0.72,
            zoom: 1.,
        }
    }
}
impl Peek {
    pub fn show(&mut self, ui: &mut Ui, s: &Session) {
        let height = (ui.available_height() - 8.).max(100.);
        let (rect, response) = ui.allocate_exact_size(
            egui::vec2(ui.available_width(), height),
            Sense::click_and_drag(),
        );
        if response.dragged() {
            let d = ui.input(|i| i.pointer.delta());
            self.angle += d.x * 0.008;
            self.tilt += d.y * 0.008;
        }
        ui.input(|i| {
            if response.hovered() {
                self.zoom *= (i.smooth_scroll_delta.y * 0.002).exp();
            }
            if i.key_pressed(egui::Key::ArrowLeft) {
                self.angle -= 0.12
            }
            if i.key_pressed(egui::Key::ArrowRight) {
                self.angle += 0.12
            }
            if i.key_pressed(egui::Key::ArrowUp) {
                self.tilt += 0.1
            }
            if i.key_pressed(egui::Key::ArrowDown) {
                self.tilt -= 0.1
            }
            if i.key_pressed(egui::Key::Plus) || i.key_pressed(egui::Key::Equals) {
                self.zoom *= 1.16
            }
            if i.key_pressed(egui::Key::Minus) {
                self.zoom /= 1.16
            }
        });
        self.tilt = self.tilt.clamp(0.15, 1.47);
        self.zoom = self.zoom.clamp(0.22, 6.);
        let actors = &s.game.actors;
        let center = (actors[0].body.pos + actors[1].body.pos) * 0.5;
        let (sa, ca) = self.angle.sin_cos();
        let (st, ct) = self.tilt.sin_cos();
        let project = |p: Vec3| {
            let d = p - center;
            let along = ca * d.x + sa * d.y;
            (
                egui::vec2(-sa * d.x + ca * d.y, along * st - d.z * ct),
                along * ct + d.z * st,
            )
        };
        let half = project(actors[0].body.pos).0.abs();
        let scale = self.zoom
            * ((rect.width() - 58.) / (half.x * 2. + 520.))
                .min((rect.height() - 50.) / (half.y * 2. + 400.))
                .max(0.01);
        let screen = |p: Vec3| {
            let (v, depth) = project(p);
            (rect.center() + v * scale, depth)
        };
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 3., Color32::from_rgb(17, 23, 23));
        let mut faces = Vec::new();
        let top = actors[0].body.pos.z.max(actors[1].body.pos.z) + 65.;
        for tri in s.scene.peek_mesh.as_chunks::<14>().0 {
            let normal = Vec3::from_slice(&tri[9..12]);
            if (ca * normal.x + sa * normal.y) * ct + normal.z * st < -0.05 {
                continue;
            }
            let off = s.game.offsets[tri[13] as usize];
            let offset = Vec3::new(off[0], off[1], off[2]);
            let points: [(Pos2, f32); 3] =
                std::array::from_fn(|i| screen(Vec3::from_slice(&tri[i * 3..i * 3 + 3]) + offset));
            let xy = points.map(|v| v.0);
            if rect.intersects(Rect::from_points(&xy)) {
                let z = (tri[2] + tri[5] + tri[8]) / 3. + offset.z;
                faces.push((
                    points.iter().map(|p| p.1).sum::<f32>() / 3.,
                    xy,
                    normal.z,
                    (1. - (z - top) / 190.).clamp(0.12, 1.),
                    tri[12] as u8,
                ));
            }
        }
        faces.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
        let mut mesh = Mesh::default();
        for (depth, points, normal_z, layer, mask) in faces {
            let fade = layer * (1. - depth.abs() / 1500.).clamp(0.17, 1.);
            let (tint, outline, fill_alpha, edge_alpha) = if normal_z > 0.92 {
                ([141, 202, 183], [178, 228, 203], 51., 166.)
            } else if normal_z > 0.15 {
                ([224, 182, 123], [243, 214, 163], 82., 166.)
            } else {
                ([153, 183, 191], [157, 176, 172], 23., 82.)
            };
            let color = |[r, g, b]: [u8; 3], alpha: f32| {
                Color32::from_rgba_unmultiplied(r, g, b, (alpha * fade) as u8)
            };
            let fill = color(tint, fill_alpha);
            let edge = color(outline, edge_alpha);
            let base = mesh.vertices.len() as u32;
            for p in points {
                mesh.colored_vertex(p, fill)
            }
            mesh.add_triangle(base, base + 1, base + 2);
            for i in 0..3 {
                if mask & (1 << i) == 0 {
                    continue;
                }
                let a = points[i];
                let b = points[(i + 1) % 3];
                let n = (b - a).normalized().rot90() * 0.45;
                let base = mesh.vertices.len() as u32;
                for p in [a - n, b - n, b + n, a + n] {
                    mesh.colored_vertex(p, edge)
                }
                mesh.add_triangle(base, base + 1, base + 2);
                mesh.add_triangle(base, base + 2, base + 3);
            }
        }
        painter.add(Shape::mesh(mesh));
        for (i, actor) in actors.iter().enumerate() {
            let (p, _) = screen(actor.body.pos);
            let (color, label, shape) = if i == 0 {
                let yaw = actor.body.yaw;
                let dir = (screen(actor.body.pos + Vec3::new(yaw.cos(), yaw.sin(), 0.) * 20.).0
                    - p)
                    .normalized();
                (
                    super::ORANGE,
                    "You",
                    vec![
                        p + dir * 11.,
                        p - dir * 7. + dir.rot90() * 6.,
                        p - dir * 7. - dir.rot90() * 6.,
                    ],
                )
            } else {
                (
                    Color32::from_rgb(89, 216, 226),
                    "Bot",
                    vec![
                        p - Vec2::Y * 8.,
                        p + Vec2::X * 7.,
                        p + Vec2::Y * 8.,
                        p - Vec2::X * 7.,
                    ],
                )
            };
            painter.add(Shape::convex_polygon(
                shape,
                color,
                Stroke::new(1.5_f32, Color32::BLACK),
            ));
            let text = painter.layout_no_wrap(label.into(), FontId::proportional(15.), color);
            let at = p + egui::vec2(12., -text.size().y * 0.5);
            painter.rect_filled(
                Rect::from_min_size(at, text.size()).expand(2.),
                2.,
                Color32::from_black_alpha(220),
            );
            painter.galley(at, text, color);
        }
    }
}
