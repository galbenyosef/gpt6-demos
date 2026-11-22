// SPDX-License-Identifier: GPL-2.0-or-later
pub mod aas;
#[cfg(any(test, feature = "native-renderer", target_arch = "wasm32"))]
mod batches;
mod bot;
#[cfg(target_arch = "wasm32")]
mod browser;
pub mod bsp;
pub mod collision;
pub mod content;
pub mod draw;
pub mod game;
pub mod inventory;
pub mod material;
pub mod md3;
pub mod models;
pub mod movement;
pub mod mover;
pub mod nav;
#[cfg(any(target_arch = "wasm32", feature = "native-renderer"))]
mod peek;
#[cfg(any(target_arch = "wasm32", feature = "native-renderer"))]
pub mod renderer;
#[cfg(any(target_arch = "wasm32", feature = "native-renderer"))]
pub mod session;
