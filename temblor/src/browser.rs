// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{content::Vfs, renderer::Renderer, session::Session};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub struct Packages(Vfs);
#[wasm_bindgen]
impl Packages {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Vfs::default())
    }
    pub fn mount(&mut self, name: &str, bytes: Vec<u8>) -> Result<(), String> {
        self.0.mount(name, bytes)
    }
    pub fn sound(&mut self, path: &str) -> Result<Vec<u8>, String> {
        self.0.read(path)
    }
    pub fn speakers(&mut self, map: &str) -> Result<String, String> {
        Ok(serde_json::to_string(&crate::session::speakers(&mut self.0, map)?).unwrap())
    }
    pub fn maps(&self) -> String {
        serde_json::to_string(&self.0.maps()).unwrap()
    }
}
#[wasm_bindgen]
pub struct Engine {
    gpu: Renderer,
    session: Option<Session>,
}
#[wasm_bindgen]
impl Engine {
    pub async fn create(canvas: web_sys::HtmlCanvasElement) -> Result<Engine, JsValue> {
        console_error_panic_hook::set_once();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..Default::default()
        });
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| e.to_string())?;
        let gpu = Renderer::from_surface(&instance, surface, 1280, 720).await.map_err(|err| {
            if err == "No compatible graphics adapter" { String::from("No WebGPU adapter. Check graphics acceleration in chrome://settings/system. On Linux, set chrome://flags/#enable-vulkan to Enabled. Relaunch Chromium and click Play.") } else { err }
        })?;
        Ok(Self { gpu, session: None })
    }
    pub fn load(
        &mut self,
        packs: &mut Packages,
        actors: &mut Packages,
        name: &str,
        seed: u32,
    ) -> Result<String, String> {
        let session = Session::load(&self.gpu, &mut packs.0, &mut actors.0, name, seed)?;
        let report = session.info.to_string();
        self.session = Some(session);
        Ok(report)
    }
    pub fn tick(&mut self, forward: f32, side: f32, dx: f32, dy: f32, buttons: u8, weapon: usize) {
        if let Some(s) = &mut self.session {
            s.game.input(forward, side, dx, dy, buttons, weapon);
        }
    }
    pub fn frame(&mut self, alpha: f32) -> Result<(), String> {
        if let Some(s) = &self.session {
            if let Some(frame) = self.gpu.acquire()? {
                let view = frame.texture.create_view(&Default::default());
                let mut enc = self.gpu.device.create_command_encoder(&Default::default());
                self.gpu.draw(&s.scene, &s.game, alpha, &view, &mut enc);
                self.gpu.queue.submit(Some(enc.finish()));
                frame.present();
            }
        }
        Ok(())
    }
    pub fn surface_limit(&self) -> u32 {
        self.gpu.limit()
    }
    pub fn resize(&mut self, w: u32, h: u32) {
        self.gpu.resize(w, h)
    }
    pub fn snapshot(&self) -> String {
        self.session
            .as_ref()
            .map(|s| s.game.snapshot().to_string())
            .unwrap_or_default()
    }
    pub fn route(&self, x: f32, y: f32, z: f32) -> String {
        let Some(s) = &self.session else {
            return "[]".into();
        };
        let g = &s.game;
        let p = g.actors[0].body.pos;
        let q = glam::Vec3::new(x, y, z);
        if !q.is_finite() {
            return "[]".into();
        }
        let r = g
            .areas
            .as_ref()
            .and_then(|a| a.path(p, q))
            .unwrap_or_else(|| g.nav.path(p, q, &g.world));
        serde_json::to_string(&r.iter().map(|p| p.to_array()).collect::<Vec<_>>()).unwrap()
    }
    pub fn items(&self) -> String {
        let Some(s) = &self.session else {
            return "[]".into();
        };
        serde_json::to_string(&s.game.items.iter().map(|it|serde_json::json!({"class":it.class,"pos":it.pos.to_array(),"next":it.next})).collect::<Vec<_>>()).unwrap()
    }
    pub fn events(&mut self) -> String {
        self.session
            .as_mut()
            .map(|s| serde_json::to_string(&std::mem::take(&mut s.game.events)).unwrap())
            .unwrap_or_else(|| "[]".into())
    }
    /// Discard grounded walking momentum when the browser relinquishes controls.
    /// Airborne motion, projectiles and the match clock stay frozen until resume.
    pub fn release_controls(&mut self) {
        if let Some(s) = &mut self.session {
            s.game.release_controls();
        }
    }
    pub fn set_bot_level(&mut self, level: u8) {
        if let Some(s) = &mut self.session {
            s.game.set_bot_level(level);
        }
    }
    pub fn peek_geometry(&self) -> Vec<f32> {
        self.session
            .as_ref()
            .map(|s| s.scene.peek_mesh.clone())
            .unwrap_or_default()
    }
    pub fn peek_offsets(&self) -> Vec<f32> {
        self.session
            .as_ref()
            .map(|s| s.game.offsets.concat())
            .unwrap_or_default()
    }
    pub fn rematch(&mut self) {
        if let Some(s) = &mut self.session {
            s.game.reset()
        }
    }
}
