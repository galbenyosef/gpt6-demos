// SPDX-License-Identifier: GPL-2.0-or-later
use std::{
    collections::{HashSet, VecDeque},
    time::{Duration, Instant},
};
use temblor::game::Game;
use winit::keyboard::KeyCode;

const STEP: Duration = Duration::from_millis(8);
const MAX_DEBT: Duration = Duration::from_millis(120);

pub enum Input {
    Key(KeyCode, bool),
    Fire(bool),
    Look(f32, f32),
    Wheel(i32),
}

pub struct Clock {
    wall: Instant,
    pending: VecDeque<(Instant, Input)>,
    held: HashSet<KeyCode>,
    firing: bool,
    choice: usize,
}
impl Clock {
    pub fn new() -> Self {
        Self {
            wall: Instant::now(),
            pending: VecDeque::new(),
            held: HashSet::new(),
            firing: false,
            choice: 0,
        }
    }
    pub fn push(&mut self, event: Input) {
        self.pending.push_back((Instant::now(), event));
    }
    pub fn scores(&self) -> bool {
        self.held.contains(&KeyCode::Tab)
    }
    pub fn advance(&mut self, game: &mut Game, now: Instant) -> f32 {
        if now.duration_since(self.wall) > MAX_DEBT {
            self.wall = now - MAX_DEBT;
        }
        while self.wall + STEP <= now && game.winner.is_none() {
            self.wall += STEP;
            let (mut dx, mut dy, mut pressed) = (0., 0., 0);
            while self
                .pending
                .front()
                .is_some_and(|(time, _)| *time <= self.wall)
            {
                match self.pending.pop_front().unwrap().1 {
                    Input::Look(x, y) => {
                        dx += x;
                        dy += y;
                    }
                    Input::Fire(down) => {
                        self.firing = down;
                        if down {
                            pressed |= 4;
                        }
                    }
                    Input::Key(key, true) => {
                        self.held.insert(key);
                        if key == KeyCode::Space {
                            pressed |= 1;
                        }
                        let guns = [
                            KeyCode::Digit1,
                            KeyCode::Digit2,
                            KeyCode::Digit3,
                            KeyCode::Digit4,
                            KeyCode::Digit5,
                            KeyCode::Digit6,
                            KeyCode::Digit7,
                            KeyCode::Digit8,
                            KeyCode::Digit9,
                        ];
                        if let Some(i) = guns.iter().position(|k| *k == key) {
                            self.choice = i + 1;
                        }
                    }
                    Input::Key(key, false) => {
                        self.held.remove(&key);
                    }
                    Input::Wheel(step) => {
                        let a = &game.actors[0];
                        let mut gun = if self.choice == 0 { a.gun } else { self.choice };
                        for _ in 1..a.owned.len() {
                            gun = (gun as i32 + step).rem_euclid(a.owned.len() as i32) as usize;
                            if a.owned[gun] {
                                self.choice = gun;
                                break;
                            }
                        }
                    }
                }
            }
            let held = |k| self.held.contains(&k) as u8;
            let buttons = pressed
                | held(KeyCode::Space)
                | held(KeyCode::KeyC) << 1
                | (self.firing as u8) << 2;
            game.input(
                held(KeyCode::KeyW) as f32 - held(KeyCode::KeyS) as f32,
                held(KeyCode::KeyD) as f32 - held(KeyCode::KeyA) as f32,
                dx,
                dy,
                buttons,
                self.choice,
            );
            if game.actors[0].gun == self.choice {
                self.choice = 0;
            }
        }
        (now.duration_since(self.wall).as_secs_f32() / STEP.as_secs_f32()).min(1.)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::collections::BTreeMap;

    #[test]
    fn recorded_duel_matches_browser() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../tests/desktop-replay.json")).unwrap();
        let mut pack = super::super::bundled("arena.pk3", super::super::ARENA).unwrap();
        let name = pack.maps()[0].to_owned();
        let map = temblor::bsp::Map::parse(&pack.read(&name).unwrap()).unwrap();
        let mut game = Game::new(&map, fixture["seed"].as_u64().unwrap() as u32).unwrap();
        let aas = name.replace(".bsp", ".aas");
        game.areas = Some(temblor::aas::Areas::parse(&pack.read(&aas).unwrap()).unwrap());

        let mut clock = Clock::new();
        let start = clock.wall;
        for row in fixture["inputs"].as_array().unwrap() {
            let at = start + Duration::from_millis(row[0].as_u64().unwrap());
            let event = match row[1].as_str().unwrap() {
                "look" => Input::Look(
                    row[2].as_f64().unwrap() as f32 * -0.0022,
                    row[3].as_f64().unwrap() as f32 * -0.0022,
                ),
                "Fire" => Input::Fire(row[2].as_bool().unwrap()),
                name => {
                    let key = match name {
                        "KeyW" => KeyCode::KeyW,
                        "Space" => KeyCode::Space,
                        "Digit1" => KeyCode::Digit1,
                        "Digit2" => KeyCode::Digit2,
                        _ => panic!("unknown replay key {name}"),
                    };
                    Input::Key(key, row[2].as_bool().unwrap())
                }
            };
            clock.pending.push_back((at, event));
        }
        let mut now = start;
        let mut counts = BTreeMap::new();
        for frame in fixture["frameMs"].as_array().unwrap().iter().cycle() {
            now += Duration::from_millis(frame.as_u64().unwrap());
            clock.advance(&mut game, now);
            for e in game.events.drain(..) {
                let kind = e["kind"].as_str().unwrap();
                if matches!(kind, "pickup" | "shot" | "frag") {
                    let key = format!("{}/{kind}/{}", e["actor"], e["detail"].as_str().unwrap());
                    *counts.entry(key).or_insert(0_u32) += 1;
                }
            }
            if game.winner.is_some() {
                break;
            }
            assert!(game.time < 600000, "recorded match did not finish");
        }
        let scores = [game.actors[0].score, game.actors[1].score];
        assert_eq!(
            json!({"scores": scores, "counts": counts}),
            fixture["expected"]
        );
    }
}
