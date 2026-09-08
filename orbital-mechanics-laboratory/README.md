# Orbital Mechanics Laboratory

A browser-based astrodynamics workspace built with Bun, strict TypeScript, Three.js and DOM APIs. Physics and prediction run in a Web Worker; no backend or UI framework is required.

## Run

```sh
bun install
bun run dev
```

Open http://localhost:3000. Set `PORT=3017 bun run dev` to use another port. Restart the development server after editing worker modules; browser UI modules support Bun HMR.

```sh
bun test
bun run typecheck
bun run build
```

`dist/` is a static deployment: serve the whole directory over HTTP(S), including `worker.js` and `earth.jpg`. Relative asset URLs support a subdirectory deployment. Opening the HTML with `file://` will not load the module worker.

## Explore

- **Earth orbit:** Explorer 1 starts at 300 km altitude, 28.5° inclination, about 7.73 km/s and a 90.37-minute period. Add a manoeuvre for a default 120 m/s prograde impulse. The predicted apoapsis rises to about 731 km. Go to burn completion to inspect the executed state.
- **Earth → Moon:** begin in a planar, 300 km circular Earth orbit. Choose a 7-day horizon, tune injection and departure time, then use **Fit path** to inspect the transfer. Switch to the Moon frame at encounter and plan a retrograde capture. A missed encounter remains a miss.
- **Worked lunar plan:** the mission brief can load editable, calculated burns: +3108.8374 m/s at T+0 and −816.63254 m/s at T+391870 s. The second burn captures near a 100 km circular lunar orbit. These numbers apply to this preset's epoch, phase and model only. Both burns use ordinary simulation code; there is no trajectory steering or forced capture. The injection executes at the initial timestamp. Select the second flight-plan node and use **Go to burn completion**, then choose **Moon** and the **Orbit** inspector.
- **Earth → Mars:** an optional heliocentric scenario starts just outside Earth's SOI at 1 AU. The Hohmann helper suggests transfer burns to 1.524 AU and shows approximate required/current target phase. This simplified scenario starts after Earth escape; it is not a launch-to-Mars optimiser. Check the computed Mars encounter before accepting an arrival burn.

Click bodies, spacecraft, manoeuvre diamonds or event markers to inspect them. Orbital elements are osculating relative to the current dominant body. Inertial state fields retain SI units. Add spacecraft from the mission explorer. On narrow screens the header menu button opens the explorer.

The green path includes planned manoeuvres; the dashed path is the same current state coasting without future burns. The pale trail records accepted actual states during playback. Orbit paths come from propagated state vectors. Chart hover marks the corresponding trajectory point; clicking the chart or timeline seeks by replay. Changing spacecraft or replaying clears its short rendered history.

Space toggles playback; M creates a manoeuvre. Drag rotates, right-drag pans, and scroll zooms. Free camera additionally supports W/A/S/D and Q/E. Choose body-centred inertial, Earth rotating, global inertial or spacecraft-local frames. Camera and render transformations never modify physics coordinates. **Fit path** frames interplanetary and lunar trajectories without changing their scale.

**Save mission** stores the initial mission and current replay timestamp in browser storage. The overflow menu loads it or imports/exports versioned JSON. JSON includes body configuration, initial spacecraft states, all burns, epoch and simulation settings. Import validates numeric fields, references, body hierarchy and overlapping finite burns before replacing the mission. Reset restores the selected scenario.

## Architecture and numerical model

- `src/physics/math.ts`: independent SI vector/state types; inertial, local orbital and rotating frame transformations. Prograde follows velocity; radial follows position. The basis is nonorthogonal on eccentric orbits and its inverse accounts for this.
- `src/physics/orbits.ts`: orbital elements and reconstruction, universal-variable Kepler propagation for elliptic/parabolic/hyperbolic states, interchangeable RK4 integrator, escape velocity and Hohmann planner.
- `src/mission/`: data-driven hierarchical circular body ephemerides, spacecraft/engine/burn types, presets, SOIs, approximate Lagrange points and validated serialization.
- `src/simulation/Simulation.ts`: hybrid coasting/numerical dynamics, fuel consumption, adaptive step selection, step-resolved events and deterministic replay. Numerical integration runs relative to the dominant body, subtracting its prescribed ephemeris acceleration, while including gravity from every configured body.
- `src/simulation/worker.ts`: asynchronous simulation and curvature-aware trajectory sampling. Display samples are taken from temporary copies between canonical integration steps, so sampling density does not alter the planned orbit. Computation yields in chunks; monotonically increasing prediction IDs and mission generations cancel stale results.
- `src/rendering/SceneRenderer.ts`: Three.js scene, camera-relative/body-relative origins, path geometry, selectable markers, reference layers, vectors and 3D-anchored DOM labels.
- `src/app.ts`, `src/style.css`: application state, inspector, mission timeline, burn editor, planner, charts and persistence UI.

The simulation advances independently of animation frames in fixed clock requests. Timestep caps depend on local dynamical time, altitude, SOI proximity and thrust. Quiet coasts use the analytic solver; finite burns and appreciable perturbations use RK4. Burns are split at exact start/end times. Impulses consume propellant via the rocket equation and finite burns integrate mass flow, capped at available fuel. Reverse time reconstructs the initial mission and replays its burn history rather than integrating thrust backwards.

## Fidelity and limits

This is an educational Newtonian model, not an ephemeris or operational mission-planning system. Sun, Earth, Moon and Mars follow prescribed hierarchical circular orbits, not mutually integrated planetary N-body trajectories or a real dated ephemeris. The displayed epoch is the mission clock origin. The Sun is fixed at the global origin. There is no atmosphere, drag, J2, relativity or surface launch model.

The hybrid threshold defaults to 0.001 relative noncentral acceleration. Analytic coasts intentionally neglect perturbations below it. RK4 adapts its step to physical conditions but has no embedded truncation-error estimator; the diagnostics explicitly say so. Reported energy/angular momentum changes are per step and may include physical perturbations and thrust, not just numerical error. Apsis and SOI events are step-resolved, not root-refined. Closest approach is sampled; encounter periapsis is a two-body estimate at the closest sampled state. Long-horizon display sampling is capped, so it can undersample repeated tight orbits; the integration itself continues with smaller steps. Use short horizons near encounters.

Overlapping finite burns on one spacecraft are rejected. Hohmann node generation requires a nearly circular departure matching the stated origin radius and assumes a shared primary/coplanar circular destination. It does not perform target phasing or optimise capture. Celestial radii are physically scaled; spacecraft/event glyphs and vectors are enlarged for readability. The coordinate axes and equatorial grid are contextual aids. A surface impact stops that spacecraft's integration.

## Validation

`bun test` covers circular orbit radius and energy drift over ten RK4 orbits, period, escape energy, elliptic/parabolic/hyperbolic propagation, element reconstruction, reversible frame transforms, Hohmann delta-v and arrival radius, SOI/ephemeris values, impulse fuel cost, finite thrust and mass flow, fuel exhaustion, collisions, deterministic replay, serialization, multiple spacecraft, worker cancellation, the solar preset, and a successful lunar transfer/capture versus a deliberate miss.

Browser smoke checks cover initial rendering, burn editing/execution, live orbital values, worked lunar planning, reference frames and mission controls. The UI exposes model limitations and numerical diagnostics for inspection.

## Assets

The local Earth texture is from the [Three.js planet texture example](https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg). Three.js uses [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) for mouse/touch camera interaction. Fonts request DM Sans and IBM Plex Mono from Google Fonts, with system fallbacks when offline; physics, textures and application scripts are local.
