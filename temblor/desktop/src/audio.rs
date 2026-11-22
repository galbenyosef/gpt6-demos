// SPDX-License-Identifier: GPL-2.0-or-later
use glam::Vec3;
use rodio::{
    buffer::SamplesBuffer, Decoder, OutputStream, OutputStreamHandle, Source, SpatialSink,
};
use std::{collections::HashMap, io::Cursor};
use temblor::{content::Vfs, game::Game, session::Speaker};

struct Voice {
    sink: SpatialSink,
    pos: Vec3,
    gain: f32,
}
pub struct Audio {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    ambient: Vec<Voice>,
    cues: Vec<Voice>,
}
pub struct Ambience(Vec<Voice>);
impl Audio {
    pub fn new() -> Result<Self, String> {
        let (stream, handle) =
            OutputStream::try_default().map_err(|e| format!("Audio output unavailable: {e}"))?;
        Ok(Self {
            _stream: stream,
            handle,
            ambient: vec![],
            cues: vec![],
        })
    }
    fn voice(&self, pos: Vec3, gain: f32) -> Result<Voice, String> {
        let sink = SpatialSink::try_new(&self.handle, [0.; 3], [-1., 0., 0.], [1., 0., 0.])
            .map_err(|e| e.to_string())?;
        sink.pause();
        sink.set_volume(0.);
        Ok(Voice { sink, pos, gain })
    }
    pub fn prepare(&self, pack: &mut Vfs, speakers: &[Speaker]) -> Result<Ambience, String> {
        let mut cache = HashMap::new();
        let mut voices = vec![];
        for s in speakers.iter().filter(|s| s.flags & 1 != 0) {
            if !cache.contains_key(&s.file) {
                let decoder = Decoder::new(Cursor::new(pack.read(&s.file)?))
                    .map_err(|e| format!("{}: {e}", s.file))?;
                cache.insert(s.file.clone(), decoder.convert_samples::<f32>().buffered());
            }
            let voice = self.voice(Vec3::from(s.pos), 0.13)?;
            voice.sink.append(cache[&s.file].clone().repeat_infinite());
            voices.push(voice);
        }
        Ok(Ambience(voices))
    }
    pub fn replace(&mut self, loops: Ambience) {
        self.cues.clear();
        self.ambient = loops.0;
    }
    pub fn pause(&mut self) {
        for v in &self.ambient {
            v.sink.pause()
        }
        self.cues.clear();
    }
    pub fn resume(&self) {
        for v in &self.ambient {
            v.sink.play()
        }
    }
    pub fn update(&mut self, g: &Game, volume: f32) {
        for e in &g.events {
            let (hz, end, duration) = match e["kind"].as_str() {
                Some("shot") if e["detail"] == "Rocket launcher" => (100., 35., 0.092),
                Some("shot") => (170., 35., 0.092),
                Some("impact") => (135., 45., 0.055),
                Some("pickup") => (540., 940., 0.115),
                Some("pain") => (138., 85., 0.11),
                Some("death") => (175., 36., 0.32),
                Some("respawn") => (260., 620., 0.25),
                Some("jump pad") => (180., 720., 0.21),
                Some("intermission") => (440., 880., 0.48),
                _ => continue,
            };
            let pos = Vec3::from_array(std::array::from_fn(|i| {
                e["pos"][i].as_f64().unwrap_or(0.) as f32
            }));
            if let Ok(voice) = self.voice(pos, 0.24) {
                let count = (24000. * duration) as usize;
                let data = (0..count)
                    .map(|i| {
                        let t = i as f32 / 24000.;
                        let u = t / duration;
                        (std::f32::consts::TAU * t * (hz + 0.5 * (end - hz) * u)).sin()
                            * (1. - u).powi(2)
                    })
                    .collect::<Vec<_>>();
                voice.sink.append(SamplesBuffer::new(1, 24000, data));
                self.cues.push(voice);
            }
        }
        self.cues.retain(|v| !v.sink.empty());
        let player = &g.actors[0].body;
        let right = Vec3::new(player.yaw.sin(), -player.yaw.cos(), 0.);
        for v in self.ambient.iter().chain(&self.cues) {
            let offset = v.pos - player.pos;
            let pan = offset.normalize_or_zero().dot(right);
            v.sink.set_emitter_position([pan, 0., 1.]);
            v.sink
                .set_volume(volume * v.gain / (1. + offset.length() / 220.).powi(2));
            v.sink.play();
        }
    }
}
