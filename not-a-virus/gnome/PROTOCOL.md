# Private GNOME bridge, version 1

Only the extension and its child use stdin/stdout. There is no socket, public endpoint, service, shell command string, GTK import in Shell, or second simulation engine. The helper resolves bundled packs beside its executable and user packs from XDG data directories. Runtime is offline.

Each request and response is a UTF-8 JSON object followed by newline, including the newline at most 65,536 bytes. EOF terminates the helper and drops its private session. Truncated, oversized, unknown-field or invalid JSON requests terminate it with one stderr error. Valid operations with invalid values return `error` and preserve committed state. All requests carry a strictly increasing positive JavaScript-safe integer `seq`; responses echo it. Numbers are finite and geometry is bounded to ±1,000,000 logical units. Frame dimensions are positive and bounded, crops stay within the atlas, and generations/filenames are validated before rendering.

| Request `type` | Additional fields | Success response |
|---|---|---|
| `hello` | `version:1`, `pack`, `size` (1/1.5/2), `paused` | `asset_ready` plus protocol `version` and `build` |
| `select_pack` | `id` | `asset_ready` |
| `commit_pack` | `generation` | `committed` with `generation`, `id` |
| `discard_pack` | `generation` | `ack` |
| `sample` | `sample` object below | `frame` |
| `list_packs` | `offset` | `packs` array (24 per page), `next` offset or null |
| `set_size` | `size` (1/1.5/2) | `ack` |
| `set_paused` | `paused` | `ack` |
| `reload_packs` | — | `ack` |
| `shutdown` | — | `ack`, then EOF |

`error` carries `message`. Discovery uses bundled-first, sorted user-folder order. Missing saved pack falls back to `default` (gatita). Failed selection or staging does not replace the committed engine or texture.

`asset_ready` contains `generation`, `id`, `name`, `filter`, `session` (`session-` plus random alphanumeric token), `token` (`atlas-GENERATION.rgba`), `width`, `height`, and `bytes`. Dimensions are 1…4096 and length is exactly width × height × 4. The extension reads at most that length plus one sentinel byte from its pinned session under `$XDG_RUNTIME_DIR/notavirus/`. Pixels are straight RGBA8, top-down, stride width × 4; `St.ImageContent.set_bytes` receives `Cogl.PixelFormat.RGBA_8888`. Upload occurs once per pack; recurring samples carry no pixels. The renderer caches the last frame and mutates actor geometry/filtering only when it changes. The extension uploads, then acknowledges with `commit_pack`, then displays the new texture and persists ID. Upload failure discards staging. Only one pending candidate exists; staging files are removed on commit/discard. Runtime/session directories are owned, 0700, non-symlink; files are 0600. A held flock lease protects active sessions from stale cleanup.

`sample` contains `dt` seconds, `pointer:[x,y]`, `monitor:[x,y,width,height]`, `work:[x,y,width,height]`, `monitor_id`, `monitor_generation`, `device_scale`, `visible`, and `reset`. Coordinates are Shell logical top-left coordinates. The adapter translates to monitor-local bottom-left core coordinates and reverses that translation for `frame.rect`. `crop` separately converts the core's bottom-left UV to top-left normalized UV. `mirror_offset` preserves the pack anchor; `flip`, `filter`, and diagnostic `phase` complete a frame. `quiet_for` is a validated 0…0.075-second rest scheduling hint derived by Rust from the current core phase and frame boundary; it is zero during chase/transitions. `frame` also echoes pack `generation` and `monitor_generation`.

One extension timeout caps sampling at roughly 60 Hz (17 ms); one request may be outstanding. Busy sampling does not queue work. When the pointer is unchanged, the Rust rest hint can defer a sample, while the Shell still checks the pointer every 17 ms. New pointer movement, control or layout changes bypass the hint. The 75 ms bound leaves one poll of slack below the core’s 100 ms elapsed cap; JavaScript does not advance frames or choose phases. Each control has only one replaceable latest operation in a bounded-key map; operations and complete stage/commit transactions are serialized. Elapsed time comes from submitted samples, capped at 100 ms; the unchanged core subdivides to at most 1/120 second. Pause/hidden/relocation reset time and velocity samples. Paused and hidden states send no periodic simulation requests; a zero-time geometry update is allowed after a layout, size or visibility change. Stopped/disabled has no helper or sprite. Separate controller/bridge lifetimes and generations reject late responses.

A 10-second request deadline handles a stalled child. Crash or malformed output hides the sprite and offers Restart; no crash loop. Disable disconnects signals, cancels reads/texture work, removes actors/timers, closes input and asynchronously reaps the child. An outstanding/stalled child is force-exited. Abrupt sessions are safely reclaimed after the grace period on a later start.

`notavirus-gnome import FILE.petpack` is a separate one-shot CLI used only from preferences. It takes an advisory import lock, discovers reserved IDs, uses the existing bounded atomic installer, and outputs `{"id":"installed-id"}` on success. The preferences process then publishes the requested ID and import revision through GSettings. `applied-import-revision` is advanced only after the extension commits the texture, including imports performed while stopped.
