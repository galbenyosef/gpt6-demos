# InfiniCave — Game specification

Status: implementation-ready product and technical specification.

## 1. Product definition

InfiniCave is a single-player browser game built with HTML, TypeScript, and Three.js. The player pilots a small armed helicopter through a finite underground cave system, operates ancient machinery, survives hazards, and reaches the cave's heart to complete an expedition.

The reference is John Vanderaart's *Eindeloos*, especially the side view, tiny helicopter within a large environment, interconnected chambers, brick-lined tunnels, natural caverns, mechanical gates, and final heart chamber. InfiniCave uses original art, audio, interface, and generated layouts. It should evoke the reference's exploration and spatial challenges with modern lighting, animation, responsive controls, and readable scenery.

The title describes the ability to create many expeditions. Every individual expedition has a bounded map, an attainable objective, and a definite ending.

### Required outcomes

- The game itself generates deterministic cave maps from a seed and recorded generation settings.
- Every accepted map is finite, traversable by the actual helicopter collider, and completable under the game's progression rules.
- Players can create and retain multiple independent game contexts.
- Players can save, close the game, load a context, and continue with their map and progress intact.
- Completing one context does not overwrite or automatically start another.

### Initial scope and defaults

- Desktop browsers with keyboard and optional gamepad controls; touch flight controls are deferred.
- A side-on, orthographic camera and two-dimensional gameplay plane inside a Three.js scene: a 2.5D game.
- Static hosting, local persistence, and downloadable saves; no account or server dependency.
- One complete biome family, three map sizes, and one balanced default difficulty.
- No multiplayer, infinite terrain streaming, crafting, fuel management, or permadeath in the initial release.
- Gameplay begins only after generation, validation, and the initial context save succeed.

## 2. Player experience

### Primary loop

1. Create an expedition or continue an existing one.
2. Explore passages and reveal the local map.
3. Reach checkpoints, activate relays, and open permanent gates.
4. Fight or avoid enemies and negotiate mechanical hazards.
5. Activate every required relay and enter the heart chamber.
6. Disable the heart to complete the expedition.

Exploration and precise flying should matter more than relentless combat. The player can stop, hover, inspect a passage, retreat, and plan another approach. Required objectives must be understandable without external instructions or a memorized route.

### Screens and navigation

**Home / expeditions:** show Continue for the most recently played context, New Expedition, a list of saved expeditions, and Import Save. Each context card shows its name, map size, last-played date, elapsed play time, relay progress, and active/completed status. Card actions are Play, Rename, Export, and Delete. Deletion requires confirmation identifying that expedition.

**New Expedition:** accept an optional name, optional seed, and Small / Standard / Large size. Default to Standard and generate a fresh seed when none is supplied. Display an estimated expedition length. Create opens a generation progress view and then the saved starting area. Existing contexts remain intact. Cancel returns to the list without creating a partial context.

**In game:** show hull health, required relay progress, next objective, checkpoint feedback, and a brief save indicator. Keep the cave visually dominant. A pause menu provides Resume, Save, Map, Controls, Settings, Export Save, Return to Checkpoint, and Save & Exit.

**Map:** show explored chambers, discovered passages, activated checkpoints, and discovered objective markers. Do not reveal hidden passages before discovery. Distinguish unexplored exits from solid walls. Opening the map pauses gameplay.

**Completion:** show a short heart shutdown sequence, an explicit Expedition Complete screen, elapsed time, deaths, and exploration percentage. Offer Return to Expeditions and New Expedition. Preserve the completed context and allow its map and statistics to be inspected; post-completion free flight is deferred.

### Controls

| Action | Keyboard default | Gamepad default |
| --- | --- | --- |
| Fly horizontally / vertically | WASD or arrow keys | Left stick / D-pad |
| Fire | Space | Right trigger |
| Interact | E | South face button |
| Map | M | North face button |
| Pause / resume | Escape | Menu button |

Diagonal input is normalized. Analog input uses a configurable dead zone. Controls are remappable, and simultaneous movement, fire, and interaction must work. Prevent browser scrolling for game controls only while the game surface has focus. Pause on focus loss or when the document becomes hidden; clear held inputs on pause and resume.

## 3. World and visual design

The cave combines engineered ruins with natural underground formations:

- Brick-lined horizontal tunnels, deep shafts, switchbacks, and broad diagonal passages.
- Irregular caverns with stalactites, rock islands, broken masonry, and pools or distant mineral glow used as scenery.
- Mechanical chambers with sliding barriers, gates, relay machinery, and safe waiting alcoves.
- Distinct entrance, checkpoint, relay, and heart rooms that are immediately recognizable.
- Optional branches and loops that reward exploration without hiding mandatory progress behind unmarked secrets.

Use dark blue-black open space, warm rust and stone walls, restrained cyan machinery, and amber hazard warnings. Enemies, interactable objects, scenery, and projectiles need distinct silhouettes. Colour supplements shape and motion cues.

Three.js renders extruded cave walls, a three-dimensional helicopter, animated machinery, particles, and shallow background layers. Gameplay uses X/Y; decorative depth uses Z. The camera follows the craft with a small dead zone and bounded look-ahead, clamped to map limits. Camera settings must not expose outside-world geometry or let foreground scenery obscure necessary collision boundaries.

Solid silhouettes must match collision boundaries. Decorative protrusions that appear dangerous must either collide consistently or be visually placed behind the flight plane. Dim areas cannot conceal unavoidable hazards. Offer reduced screen shake, reduced flashing, and disabled decorative camera movement.

The helicopter has rotor animation, directional facing, mild visual banking, muzzle flashes, and readable damage feedback. Banking and rotor blades do not change its gameplay collider.

## 4. Flight, combat, and progression

### Flight model

Use responsive acceleration, bounded speed, and damping toward a stable hover when input is released. There is no mandatory gravity compensation or fuel depletion. The helicopter can face left or right; vertical movement preserves its last horizontal facing.

Use one documented circular collision footprint for generation clearance and runtime physics. Continuous or swept collision checks prevent tunnelling through walls at maximum speed. Sliding along walls is allowed. Ordinary wall contact blocks movement without draining health, making tight exploration forgiving; marked hazards and enemy attacks cause damage.

### Health and recovery

Start with 100 hull health. Damage gives brief invulnerability with readable feedback so overlapping hits cannot immediately consume the full health bar. Checkpoints restore health and become the active recovery location when interacted with.

At zero health, restore the active checkpoint snapshot, reset velocity and projectiles, grant a short spawn protection period, and increment the expedition death count. Provide unlimited retries. The entrance is the initial checkpoint. Return to Checkpoint performs the same rollback without incrementing deaths and warns that progress since that checkpoint will be lost.

### Weapons and enemies

The helicopter fires in its facing direction. Ammunition is unlimited; a fire cooldown limits the rate. Initial enemies include a slow pursuing drone, a patrol drone, and a stationary directional emitter. Flying enemies must respect walls and cannot spawn inside the craft or its checkpoint safety area.

Use a finite, seeded enemy roster. Enemy placement and patrol definitions belong to the generated map. Enemies do not respawn continuously during an attempt. Restoring a checkpoint restores the enemy state recorded at that checkpoint.

### Relays, gates, and hazards

Required relays permanently open their associated progression gates. Interactions need proximity and a clear prompt. Gates never consume keys or require expendable resources. Mandatory relays must be accessible before the gates they unlock, and no required switch may close the player's only remaining route.

Initial moving hazards use a small library of validated patterns: retracting barriers, periodic electrical beams, and sliding blocks on bounded tracks. Each required crossing has a safe waiting area and a crossing window comfortably longer than the time needed to traverse it. Optional harder routes may offer shortcuts, never the sole path to completion.

### Heart objective

The final chamber remains inaccessible until the required relays are active. Its entrance becomes permanently open when the last relay activates. The chamber contains the cave's glowing heart inside a mechanical enclosure.

The player interacts with a clearly marked shutdown control after navigating the chamber's validated hazard sequence. The heart shuts down, hazards deactivate, and the game records completion before showing results. Do not require ammunition, remaining consumables, or a hidden interaction to finish.

## 5. Finite deterministic map generation

### Reproducibility contract

The same normalized seed, generator version, content version, and generation settings produce the same canonical world document: geometry, topology, identifiers, placements, patrols, hazard patterns, and initial states.

- Use an explicitly selected, versioned seeded PRNG with defined integer arithmetic.
- Do not use `Math.random()`, clock time, object enumeration accidents, or frame timing for generation decisions.
- Normalize user seeds with a documented rule: Unicode NFC, trim surrounding whitespace, preserve case; blank input requests a new random seed. Store the resulting seed verbatim.
- Generate automatic seeds with the browser's cryptographic random API, then use the deterministic generator normally.
- Derive separate random streams for topology, geometry, entities, and decoration so cosmetic changes do not accidentally rearrange progression.
- Use stable sorting and stable entity IDs. Quantize collision geometry and serialize in a canonical order for hashing.
- A context UUID and creation timestamp are independent metadata and do not influence its map.

Generation determinism does not imply cross-device, bit-identical input replays. Save/resume correctness is a separate requirement using persisted simulation state.

### Initial map budgets

These are starting design targets; maximum bounds are hard limits and room counts include optional rooms.

| Size | Room target | Required relays | Maximum bounds, world units | Target first completion |
| --- | --- | --- | --- | --- |
| Small | 12–16 | 2 | 240 × 180 | 10–15 minutes |
| Standard | 22–30 | 3 | 400 × 300 | 20–30 minutes |
| Large | 36–48 | 4 | 600 × 450 | 35–50 minutes |

Define one world unit as approximately the helicopter body's length. Passage clearance is based on the actual collision diameter plus a safety margin. Required routes use at least two collision diameters of clear width, with wider turning pockets where acceleration or hazards need them. A fully enclosed outer boundary prevents escape beyond the map.

### Generation pipeline

1. **Build the mission graph.** Create an entrance, an ordered set of required relay stages, and a final chamber. Assign each mandatory gate an explicit prerequisite. Include checkpoints before major hazard sequences and after progression stages.
2. **Add exploration.** Attach optional branches and a bounded number of loops. Tag edges with progression requirements; optional connectivity cannot bypass mandatory relay requirements or strand the player behind a gate.
3. **Embed within bounds.** Place rooms and route corridors on an integer layout grid. Reserve clearance, wall thickness, door approaches, and checkpoint safety areas. Reject overlapping or out-of-bounds layouts.
4. **Construct collision geometry.** Carve corridors and rooms. Apply seeded cave shaping without shrinking reserved traversable space. Preserve the mission graph's connections and gate boundaries.
5. **Place gameplay content.** Choose compatible hazard templates and deterministic enemies. Keep entrance, checkpoints, and interaction approaches safe. Limit combined hazards and enemies according to room budgets.
6. **Validate the world.** Run the checks below against the collision representation used by the game, not just the abstract room graph.
7. **Decorate.** Add visual detail without modifying validated collision geometry or obscuring routes. Derive the canonical map hash and create the initial checkpoint/runtime state.
8. **Persist atomically.** Store the completed world and initial state as a new context, then enable Play.

### Required validation and bounded failure handling

A map is accepted only when all of the following hold:

- Every room, corridor, spawn, entity, and objective lies within finite bounds.
- Flood-fill or navigation search on collider-inflated geometry confirms actual clearance, including corners and door openings.
- Progression search over `(reachable region, activated relay bitset)` reaches all required relays and the heart in legal order. It detects key/switch cycles and inaccessible prerequisites.
- Optional loops do not accidentally bypass gates in the physical geometry.
- Every required interactable has a reachable interaction position with sufficient collider clearance.
- Every checkpoint has a safe spawn and a path to the remaining objective from the checkpoint's progression state.
- Mandatory timed hazards use proven crossing templates, including safe waiting positions, adequate open duration, and no unsafe combinations. Simulate representative crossings using the real movement/collision rules and account for hazard phase; static connectivity alone is insufficient.
- Required enemy encounters cannot block a one-way route permanently. No required action consumes a finite resource.
- A witness route records rooms, prerequisites, and validated hazard crossings from entrance to completion for diagnostics.

Use a maximum of 32 deterministic candidate attempts, with attempt seeds derived from the original seed and attempt index. If they fail, select a versioned, prevalidated fallback layout for the chosen size, with seed-dependent decoration. Never retry indefinitely or publish an invalid map. Verify the fallback after assembly as well; on an unexpected validator failure, show a recoverable generation error without creating a context.

Generation can run in a worker and reports phases to the UI. Do not select a fallback based on elapsed wall time, which would break determinism across devices. The initial performance target is under three seconds for Standard on the reference desktop device, to be measured during implementation.

## 6. Contexts, saving, and loading

### Context ownership

A game context is one independent expedition. It owns its identity, immutable generated world, latest saved runtime state, checkpoint snapshot, discovery state, and statistics. Creating a new context never modifies another. The same seed can create multiple contexts with identical maps and independent progress.

### Storage

Use IndexedDB for contexts and transactional saves. Reserve localStorage, if used, for small noncritical preferences. Store the generated world as well as its seed: a future generator update must not silently change an existing expedition.

Keep the newest valid save and one previous valid revision per context. Context list metadata and its save revision must commit together. A successful Saved indicator appears only after the transaction commits. If storage fails or reaches quota, keep the running game and last good save intact, show a clear retry/export action, and never report success.

### Save policy

- Manual Save captures a consistent simulation tick and briefly displays Saved.
- Autosave every 30 seconds of active play, after checkpoint activation, after a progression gate/relay change, and at completion.
- Pause-menu Save & Exit waits for a successful commit before returning to the context list. If saving fails, stay paused and offer Retry, Export, or explicitly Exit Without Saving.
- Save on document visibility loss when possible, but do not rely on unload callbacks for durability. Abrupt closure may lose progress since the last committed save, at most the autosave interval during successful normal operation.
- Serialize saves per context. Coalesce pending autosaves so an older snapshot cannot overwrite a newer revision.
- Only one tab may write a context. Use a context-scoped browser lock or equivalent ownership mechanism; a second tab can inspect the list but must not silently play/write that context concurrently.

### Persisted state

| Group | Required fields |
| --- | --- |
| Identity | Context UUID, display name, created/updated/last-played timestamps |
| Compatibility | Save schema, simulation version, generator version, content version |
| Generation | Normalized seed, size/settings, accepted attempt or fallback ID, canonical world hash |
| World | Bounds, collision geometry, rooms/connections, stable entity definitions, objective dependencies, initial placements |
| Player | Position, velocity, facing, health, damage protection timer, weapon cooldown |
| Simulation | Tick, simulation time, gameplay PRNG states, gate states, hazard phases, enemy positions/health/AI state/timers, active projectiles |
| Progress | Activated relays, active checkpoint ID, explored map, collected optional items, current objective, status |
| Recovery | Complete checkpoint snapshot, checkpoint discovery/progression state |
| Statistics | Active play time, deaths, optional discoveries, completion time |
| Integrity | Monotonic revision, payload checksum, previous valid revision reference |

Pause time, menus, and background time do not advance simulation timers. Settings such as volume and controls are global preferences. Held input, GPU objects, audio playback handles, workers, and transient decorative particles are not save data.

The latest save resumes the exact recorded gameplay state, including motion, enemies, and hazard timing. Loading initially shows a paused Ready to Continue overlay so the player can orient themselves; input starts cleared. Cosmetic particles may be reconstructed. Checkpoint recovery is intentionally different: it restores the earlier checkpoint gameplay snapshot. Active play time and death totals remain cumulative across checkpoint retries.

### Load and compatibility procedure

1. Read and validate the newest committed revision and checksum. If it is corrupt, offer the previous valid revision with an explanation of the rollback.
2. Apply explicitly supported save migrations to a copy. Leave the source intact until the migrated save commits.
3. Validate version support, finite numeric ranges, IDs, references, bounds, and player placement. Load the stored world without regenerating it from the seed.
4. Rebuild rendering, collision, and simulation objects; restore gameplay timers and random streams before the first tick.
5. Present Ready to Continue. Resume only on player action.

An unsupported future schema or simulation version produces a clear error without overwriting the file. Original generator code need not remain installed to load a supported stored world, but its schema and simulation semantics must be supported or migrated. Never silently regenerate an incompatible context.

### Import and export

Export a self-contained JSON file containing the world, latest state, checkpoint snapshot, metadata, and integrity fields. Exclude cached graphics and external asset URLs. Set and enforce bounded import size and entity counts; an initial file-size limit is 25 MiB.

Validate imported data as untrusted structured data, including finite coordinates and safe identifiers. Render names as text and never evaluate imported code. Import creates a new local context UUID by default, preserving a source ID for provenance; it cannot overwrite an existing expedition. A malformed, truncated, oversized, or incompatible file leaves stored contexts unchanged.

## 7. Technical structure

Implement as an independent app, proposed location `infinicave/`, with TypeScript, Three.js, HTML/CSS overlays, and a Bun-compatible development/build workflow. Pin actual dependency versions when implementing. The output is static assets served over HTTP(S).

Separate modules for:

- **Domain:** serializable world, entity, context, and progression types.
- **Generation:** seeded streams, graph layout, geometry construction, templates, validators, and canonical hashing; usable in a worker without the renderer.
- **Simulation:** fixed 60 Hz tick, movement, collision, combat, hazards, AI, and progression. Rendering never owns gameplay state.
- **Rendering:** scene construction, camera, materials, instancing, animation, lighting, and disposable visual effects.
- **Persistence:** IndexedDB, snapshots, revisions, migrations, context locking, and import/export.
- **UI/input/audio:** accessible HTML menus, input mapping, HUD, and audio driven by simulation events.

Use fixed simulation steps with interpolated rendering. Bound catch-up work after frame delays and pause when hidden. Persist the actual simulation clock; never advance enemies or hazards by elapsed real-world time during loading.

Render nearby cave chunks and batch repeated geometry. Chunk culling is a rendering optimization over the complete finite stored world, not ongoing procedural world generation. Changing viewport, graphics quality, or visible chunks must not change simulation outcomes.

Target 60 FPS at 1080p on an agreed integrated-GPU reference laptop, with a lower-effects setting. Establish that device and measure performance during implementation. Dispose of scene resources when switching contexts; repeated switches must not leak GPU objects, event listeners, audio nodes, or workers.

Use positional rotor, weapon, machine, and enemy sounds, with separate music/effects volume and mute controls. Start audio only after a user gesture. All gameplay-essential audio cues also have visible equivalents.

## 8. Acceptance criteria and verification

### Generation and playability

- Identical generation inputs produce identical canonical world hashes across repeated runs, supported browsers, and worker/nonworker execution.
- A fixed corpus of at least 1,000 seeds for each map size passes structural and progression validation, including fallback paths. This is regression evidence; every newly generated map must still validate at runtime.
- Deliberately malformed fixtures demonstrate detection of narrow passages, disconnected goals, switches behind their own gates, gate-bypassing loops, unsafe checkpoints, and impossible timed crossings.
- Deterministic retry exhaustion reaches a validated fallback in bounded work.
- Human playtesting completes at least three seeds per size without debug movement, invulnerability, external maps, or undocumented controls. Review difficulty and readability in addition to automated reachability.

### Persistence

- Create contexts A and B, make distinct progress in each, reload the browser, and verify both retain their own worlds and states.
- Save mid-flight near an enemy and moving hazard. Load paused, resume, and verify position, velocity, health, projectiles, AI state, cooldowns, and hazard phase match the snapshot.
- Compare one subsequent controlled simulation step before and after a save round trip using the same input; gameplay fields agree within documented numeric tolerances.
- Kill the craft after a relay or checkpoint change and verify rollback follows the recorded checkpoint rules while cumulative deaths/time remain correct.
- Export, clear a test storage profile, import, and continue the same expedition.
- Verify corrupt/latest-save recovery, migration, unsupported-version rejection, duplicate import, quota failure, interrupted transactions, and simultaneous tabs. No case silently overwrites a valid context or falsely reports Saved.
- Changing the current generator version does not alter an existing stored map.

### Complete game

- A new player can create a context, learn controls, reach a checkpoint, activate all relays, reach the heart, and see a persisted completion screen.
- All maps have enclosing boundaries, usable checkpoints, a legal progression route, and a final objective.
- Unlimited retries and checkpoint return prevent resource depletion or accidental entrapment from permanently ruining an expedition.
- Focus loss pauses safely; menus work with keyboard navigation; text remains readable; colour is never the only essential cue.
- Standard-size gameplay meets the measured performance target, and repeated save/load/context-switch cycles do not accumulate resources.

## 9. Delivery sequence

1. **Flight prototype:** original cave visuals, camera, helicopter controls, collision, and a small handcrafted start-to-heart route.
2. **Deterministic worlds:** seeded finite topology, geometry, progression gates, validation, witness routes, retries, and fallbacks.
3. **Complete gameplay:** checkpoints, relays, enemies, validated hazards, map discovery, heart shutdown, and results.
4. **Persistent expeditions:** context browser, atomic saves, checkpoint snapshots, exact resume, revisions, import/export, and compatibility handling.
5. **Release verification:** seed corpus, manual completion runs, browser checks, persistence fault cases, accessibility, and performance tuning.

The initial release is complete only when a generated expedition can be saved midway, loaded later, and finished, while multiple other stored expeditions remain independently playable.
