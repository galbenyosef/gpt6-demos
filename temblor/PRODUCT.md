# Temblor

Temblor is a Rust-based engine for Quake III Arena maps. Both the default browser demo and the native desktop application bundle the OpenArena map *Trial by Error*.

## Platform

Desktop Chromium with pointer lock, Web Audio and WebGPU. The native Linux and macOS window uses captured mouse input, desktop audio and GPU rendering.

## Stack

One Rust simulation and wgpu arena renderer serve the static WebAssembly browser release and the winit desktop application.

## Player

A player opens Temblor, enters an independently authored arena and fights a local opponent to five frags. The bundled map works immediately. Owners can select local Quake III Arena archives. The arena and both scores must remain legible during movement.
