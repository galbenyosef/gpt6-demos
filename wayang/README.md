# Wyang

Wyang is a proposed Rust desktop app for turning a picture and a written prompt into an animated parallax wallpaper. You choose a variation, preview its movement, then apply it on macOS or Ubuntu GNOME on Wayland.

This directory contains the initial Cargo package, named `wyang`, and the [product and implementation specification](specs/001-spec-animated-wallpaper-gen.md). The editor and desktop integrations are planned.

## OpenAI configuration

For development, set `OPENAI_API_KEY` in your shell or in `wayang/.env`. If you already have that file, keep it. To start a fresh configuration, run `cp -n example.env .env` from `wayang/`, then fill in the empty key locally. The [example configuration](example.env) is safe to commit. Git ignores the local `.env`.

The editor will give exported environment variables precedence over matching entries in the working directory's `.env`. Set `OPENAI_IMAGE_MODEL` to override the default image model. Only generation requires an API key.
