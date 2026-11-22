// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    bsp::Map,
    content::Vfs,
    game::Game,
    material::Palette,
    renderer::{Renderer, Scene},
};
use serde_json::Value;

pub struct Session {
    pub scene: Scene,
    pub game: Game,
    pub info: Value,
}
impl Session {
    pub fn load(
        gpu: &Renderer,
        packs: &mut Vfs,
        actors: &mut Vfs,
        name: &str,
        seed: u32,
    ) -> Result<Self, String> {
        let m = Map::parse(&packs.read(name)?)?;
        let mut palette = Palette::load(&m, packs)?;
        let mut game = Game::new(&m, seed)?;
        let aas = name.trim_end_matches(".bsp").to_owned() + ".aas";
        if packs.origin(&aas).is_some() {
            game.areas = Some(crate::aas::Areas::parse(&packs.read(&aas)?)?);
        }
        let assets = crate::models::Actors::load(actors, &mut palette)?;
        let scene = gpu.upload(&m, &palette, assets)?;
        let mut info = crate::inventory::report(&m, &palette, packs, name);
        info["textureSizes"] = palette
            .layers
            .iter()
            .map(|l| (l.name.clone(), serde_json::json!(l.image.dimensions())))
            .collect::<serde_json::Map<String, _>>()
            .into();
        info["nodes"] = game.nav.points.len().into();
        Ok(Self { scene, game, info })
    }
}

#[derive(serde::Serialize)]
pub struct Speaker {
    pub file: String,
    pub origin: String,
    pub pos: [f32; 3],
    pub flags: i32,
}

pub fn speakers(packs: &mut Vfs, map: &str) -> Result<Vec<Speaker>, String> {
    let m = crate::bsp::Map::parse(&packs.read(map)?)?;
    let mut sources = Vec::new();
    for e in &m.entities {
        if e["classname"] != "target_speaker" {
            continue;
        }
        let Some(name) = e.get("noise") else { continue };
        if name.starts_with('*') {
            continue;
        }
        let key = crate::content::path(name)?;
        let stem = key.trim_end_matches(".wav").trim_end_matches(".ogg");
        let path = [key.clone(), format!("{stem}.wav"), format!("{stem}.ogg")]
            .into_iter()
            .find(|p| packs.origin(p).is_some())
            .ok_or_else(|| format!("Missing map sound {name}"))?;
        sources.push(Speaker {
            origin: packs.origin(&path).unwrap().to_owned(),
            file: path,
            pos: crate::bsp::origin(e).to_array(),
            flags: e
                .get("spawnflags")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
        });
    }
    Ok(sources)
}
