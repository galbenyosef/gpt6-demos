# Orbital Mechanics Laboratory

## 1. Product Definition

**Orbital Mechanics Laboratory** is an interactive browser-based spacecraft dynamics and mission-planning environment.

It is not primarily a planetarium and not a cinematic visualization. The purpose is to create a technically credible orbital-mechanics application in which the visual result is driven by an actual physics model.

The application must allow a user to:

* inspect planetary and satellite orbits;
* place spacecraft into orbit;
* inspect orbital parameters;
* propagate trajectories through time;
* create impulsive and finite-duration manoeuvres;
* predict future spacecraft trajectories;
* transfer between orbital regimes;
* perform Earth–Moon and Earth–Mars mission scenarios;
* inspect velocities, energies, orbital elements and encounter geometry;
* change reference frames;
* accelerate or reverse simulation time where mathematically possible;
* compare planned versus actual trajectories.

The central design principle is:

> **The visualization must be a representation of the simulation state. It must never substitute for the simulation.**

A trajectory that reaches the Moon must do so because the calculated trajectory intersects the lunar orbital environment, not because the visualization animates the spacecraft toward the Moon.

---

# 2. Technical Baseline

## 2.1 Runtime and Language

Use:

* **Bun** as package manager, development runtime, build orchestrator and test runner;
* **TypeScript** with strict compiler settings;
* modern browser APIs;
* ES modules throughout.

Use the browser as the application runtime. No remote backend is required.

Recommended requirements:

```text
Bun >= 1.x
TypeScript >= 5.x
Three.js >= current stable release
```

Use:

```text
bun install
bun run dev
bun test
bun run build
```

The application must build into a static deployable web application.

---

## 2.2 Rendering

Primary rendering technology:

* **Three.js**

Optional secondary rendering:

* **Canvas 2D**

Three.js should handle:

* celestial bodies;
* spacecraft;
* orbital paths;
* trajectory prediction;
* manoeuvre vectors;
* coordinate axes;
* reference-frame visualization;
* labels anchored in 3D;
* selectable entities;
* camera navigation;
* lighting and spatial context.

Canvas 2D may be used for:

* time-series charts;
* velocity graphs;
* altitude graphs;
* orbital-energy plots;
* manoeuvre timelines;
* compact HUD visualizations.

Ordinary HTML/CSS should be preferred for conventional interface components such as panels, buttons, forms and tables.

Do not render the complete user interface inside WebGL.

---

## 2.3 UI Architecture

Prefer a lightweight architecture.

Do not introduce React, Vue, Angular or another UI framework unless a concrete implementation requirement makes it necessary.

Use:

* TypeScript;
* DOM APIs;
* CSS;
* Three.js;
* optional Canvas 2D;
* browser Web Workers.

The application should demonstrate that a substantial interactive application can be built without hiding its state model behind a large frontend framework.

---

## 2.4 Simulation Isolation

Physics calculations must run independently from rendering.

Recommended model:

```text
Main Thread
│
├── UI
├── Three.js Renderer
├── Camera
├── Interaction
└── Simulation Client
        │
        ▼
Web Worker
│
├── Physics Engine
├── Propagators
├── Manoeuvre Engine
├── Event Detection
├── Prediction Engine
└── Simulation State
```

The renderer may interpolate between simulation states.

Rendering frame rate and physics update rate must not be coupled.

---

## 2.5 Determinism

Given:

* the same initial state;
* the same simulation configuration;
* the same manoeuvres;
* the same time-step configuration;

the simulation must produce equivalent results between runs within numerical tolerance.

Avoid simulation logic based on frame rate.

Any randomness must use an explicitly seeded pseudo-random number generator.

---

# 3. Product Goals

The application should demonstrate several different forms of engineering capability simultaneously:

1. numerical computation;
2. 3D rendering;
3. coordinate transformations;
4. simulation architecture;
5. domain modelling;
6. interactive visualization;
7. trajectory prediction;
8. asynchronous computation;
9. application state management;
10. validation against known orbital-mechanics results.

The demo should remain comprehensible to somebody who does not know orbital mechanics.

The user should be able to cause something visible, such as:

> Increase prograde velocity by 120 m/s.

and immediately see:

* the orbit change;
* the new apoapsis;
* the new periapsis;
* the changed orbital period;
* the new predicted path.

---

# 4. Scope

## 4.1 Initial Celestial System

The initial release must support:

* Sun;
* Earth;
* Moon;
* Mars.

The architecture must not hard-code the simulation to these four bodies.

Bodies should be data-driven.

Example:

```ts
interface CelestialBody {
  id: string;
  name: string;

  massKg: number;
  radiusM: number;

  parentId?: string;

  rotationPeriodS?: number;

  initialState: StateVector;

  visual: {
    texture?: string;
    baseColor?: string;
  };
}
```

Additional bodies should be addable from configuration.

---

# 5. Units and Numerical Conventions

Internally use SI units:

```text
distance       metres
velocity       metres/second
acceleration   metres/second²
mass           kilograms
time           seconds
force          newtons
energy         joules
angle          radians
```

The UI may display:

* km;
* km/s;
* AU;
* hours;
* days;
* degrees.

Conversions must occur at UI boundaries only.

Do not mix display units with physics units.

---

# 6. Core Mathematical Types

Create explicit mathematical primitives.

Example:

```ts
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface StateVector {
  position: Vec3;
  velocity: Vec3;
}

interface OrbitalElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;

  longitudeAscendingNode: number;
  argumentOfPeriapsis: number;
  trueAnomaly: number;

  period?: number;
}
```

Do not use Three.js vectors as canonical physics-domain values.

Provide conversion adapters between simulation mathematics and Three.js objects.

This prevents the rendering engine from becoming part of the domain model.

---

# 7. Coordinate Systems

The application must explicitly model reference frames.

At minimum support:

### Global inertial frame

A simulation-wide inertial coordinate system.

### Body-centred inertial frame

For example:

```text
Earth-centred inertial
Moon-centred inertial
Mars-centred inertial
```

### Body-centred rotating frame

Useful for showing:

* surface-relative motion;
* geostationary orbits;
* launch geometry.

### Spacecraft-local frame

Provide:

```text
prograde
retrograde
normal
antinormal
radial-in
radial-out
```

These vectors must be calculated from spacecraft state.

A manoeuvre expressed as:

```text
+250 m/s prograde
```

must be transformed into the appropriate inertial-vector delta.

---

# 8. Physics Model

## 8.1 Gravity

Use Newtonian gravity:

```text
F = G M m / r²
```

or directly:

```text
a = GM / r²
```

For multiple bodies:

```text
a_total = Σ a_body
```

The physics implementation should operate on `mu = GM` where appropriate.

---

# 9. Propagation Architecture

Use a hybrid propagation architecture.

## 9.1 Keplerian Propagation

When a spacecraft is:

* coasting;
* dominated by one gravitational body;
* sufficiently distant from important secondary perturbations;

the engine may use analytic two-body propagation.

This makes long-duration prediction efficient.

---

## 9.2 Numerical Propagation

Use numerical integration when:

* multiple gravitational bodies matter;
* a spacecraft approaches the Moon;
* thrust is active;
* an encounter is occurring;
* the spacecraft crosses a sphere of influence;
* the trajectory becomes strongly non-Keplerian.

Recommended initial integrator:

**RK4**

The architecture should permit replacement with:

* RKF45;
* Dormand–Prince;
* velocity Verlet;
* another integrator.

Example abstraction:

```ts
interface Integrator {
  step(
    state: DynamicState,
    t: number,
    dt: number,
    derivatives: DerivativeFunction
  ): DynamicState;
}
```

---

# 10. Adaptive Simulation Step

Do not use a single universal simulation timestep.

Approximate examples:

```text
interplanetary coast       300–3600 s
high Earth orbit           30–120 s
low Earth orbit            1–10 s
lunar encounter            0.1–5 s
finite burn                0.01–1 s
```

The simulation engine should reduce the timestep around:

* periapsis;
* atmospheric boundaries;
* manoeuvres;
* encounters;
* SOI transitions;
* collisions.

---

# 11. Sphere of Influence

Calculate approximate sphere-of-influence radius:

```text
r_SOI ≈ a (m / M)^(2/5)
```

Visualize SOIs optionally.

An SOI transition should generate a simulation event:

```ts
interface SimulationEvent {
  time: number;
  type:
    | "SOI_ENTER"
    | "SOI_EXIT"
    | "PERIAPSIS"
    | "APOAPSIS"
    | "COLLISION"
    | "MANEUVER_START"
    | "MANEUVER_END";

  bodyId?: string;
  spacecraftId?: string;
}
```

---

# 12. Spacecraft Model

Example:

```ts
interface Spacecraft {
  id: string;
  name: string;

  dryMassKg: number;
  fuelMassKg: number;

  state: StateVector;

  engine?: Engine;
}
```

Engine:

```ts
interface Engine {
  maxThrustN: number;
  ispSeconds: number;
}
```

Calculate fuel consumption using the rocket equation / mass-flow relationship.

Finite burns must modify:

* velocity;
* fuel mass;
* total spacecraft mass.

---

# 13. Manoeuvres

Support two manoeuvre types.

## 13.1 Impulsive Manoeuvre

Instantaneous delta-v.

Example:

```ts
interface ImpulsiveBurn {
  time: number;

  frame: "INERTIAL" | "LOCAL_ORBITAL";

  deltaV: Vec3;
}
```

---

## 13.2 Finite Burn

Example:

```ts
interface FiniteBurn {
  startTime: number;

  durationS: number;
  throttle: number;

  direction: Vec3;
  frame: "INERTIAL" | "LOCAL_ORBITAL";
}
```

Fuel mass must change continuously during the burn.

---

# 14. Manoeuvre Node Editor

A manoeuvre node should appear directly on the predicted trajectory.

Selecting it exposes six controls:

```text
+ Prograde
- Prograde

+ Normal
- Normal

+ Radial
- Radial
```

Dragging or editing these values immediately recalculates the future trajectory.

Display:

```text
Δv
burn time
new periapsis
new apoapsis
new orbital period
predicted encounter
fuel cost
```

---

# 15. Orbital Elements

For spacecraft orbiting a dominant body, calculate:

* semi-major axis;
* eccentricity;
* inclination;
* longitude of ascending node;
* argument of periapsis;
* true anomaly;
* periapsis altitude;
* apoapsis altitude;
* orbital period;
* specific orbital energy;
* angular momentum.

Display these values live.

---

# 16. Trajectory Prediction

The application must calculate predicted future trajectories.

Do not use Three.js ellipse primitives as the source of truth.

Trajectory visualization must be generated from propagated states.

Prediction may run in a Web Worker.

Example:

```ts
interface TrajectoryPoint {
  t: number;
  position: Vec3;
}
```

Support prediction horizons such as:

```text
1 orbit
6 hours
24 hours
7 days
30 days
1 year
```

Sampling density should adapt to curvature.

---

# 17. Encounter Prediction

Detect likely encounters with:

* Moon;
* Earth;
* Mars.

An encounter panel should show:

```text
Closest approach
Relative velocity
Encounter time
Estimated periapsis
SOI entry
```

If the predicted trajectory enters the Moon's SOI, visually emphasize the encounter.

---

# 18. Time System

Controls:

```text
Pause
1×
10×
100×
1,000×
10,000×
100,000×
```

Longer simulation speeds may cause the engine to switch propagation strategy.

The simulation clock must remain independent of wall-clock time.

Display an explicit mission timestamp.

---

# 19. Three.js Scene

The scene should be visually attractive but restrained.

Use physically meaningful spatial relationships.

Required visual elements:

* Sun;
* planets;
* Moon;
* spacecraft;
* orbit lines;
* predicted trajectory;
* manoeuvre nodes;
* velocity vectors;
* SOI boundaries;
* coordinate axes;
* object labels.

Avoid excessive sci-fi decoration.

---

# 20. Scale Management

Astronomical distances and spacecraft dimensions cannot share one literal rendering scale.

Implement a rendering transformation layer.

The physics model always uses real distances.

The renderer may use:

* nonlinear radius scaling;
* logarithmic distance scaling where appropriate;
* local scene origins;
* camera-relative coordinates.

Clearly distinguish:

```text
simulation coordinates
render coordinates
```

Never modify the physics state to make objects visually convenient.

---

# 21. Floating-Origin Rendering

To avoid floating-point rendering problems at astronomical scales, implement a floating origin.

The currently focused object becomes approximately:

```text
(0, 0, 0)
```

in Three.js rendering space.

All other objects are transformed relative to it.

Physics coordinates remain unchanged.

---

# 22. Camera System

Provide:

### Orbit camera

Rotate around selected object.

### Follow camera

Track selected spacecraft.

### Free camera

Navigate freely.

### Reference-frame camera

Hold the selected reference frame visually stable.

Allow one-click views:

```text
Top
Side
Spacecraft
Earth
Moon
Solar system
```

---

# 23. Selection

Raycast Three.js objects.

Selectable entities:

* celestial body;
* spacecraft;
* manoeuvre node;
* trajectory event.

Selecting an object updates the inspector.

---

# 24. Main Interface

Suggested desktop layout:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Mission   Simulation Time         Speed               Settings │
├──────────────┬──────────────────────────────────────┬───────────┤
│              │                                      │           │
│ Object Tree  │                                      │ Inspector │
│              │            THREE.JS VIEW             │           │
│ Earth        │                                      │ Orbit     │
│ ├ Moon       │                                      │ State     │
│ └ Explorer 1 │                                      │ Maneuver  │
│              │                                      │           │
├──────────────┴──────────────────────────────────────┴───────────┤
│ Timeline / Manoeuvre Plan / Events                             │
└─────────────────────────────────────────────────────────────────┘
```

---

# 25. Inspector

When selecting a spacecraft show:

```text
Position
Velocity
Relative velocity
Altitude
Mass
Remaining fuel

Primary body

Periapsis
Apoapsis
Inclination
Eccentricity
Orbital period

Specific orbital energy
```

---

# 26. Analysis Panel

Provide graphical plots.

At minimum:

### Altitude vs time

### Velocity vs time

### Orbital energy vs time

### Distance to target vs time

Canvas 2D is appropriate here.

Charts should be linked to the simulation timeline.

Moving the cursor over a chart should show the corresponding moment in the trajectory.

---

# 27. Mission Timeline

Show:

```text
T+00:00 Launch state
T+00:42:13 Manoeuvre 1
T+02:31:47 Earth periapsis
T+18:11:02 Moon SOI entry
T+21:14:55 Lunar periapsis
T+21:15:00 Capture burn
```

Clicking an event moves the simulation view to that point.

---

# 28. Required Mission Scenario: Earth Orbit

Provide a preset:

```text
Explorer 1
Earth circular orbit
Altitude: 300 km
Inclination: 28.5°
```

The user should be able to add a prograde burn.

The orbit must visibly and numerically change.

---

# 29. Required Mission Scenario: Earth to Moon

Provide an instructional scenario.

Initial state:

```text
300 km circular Earth orbit
```

Objective:

```text
Enter a 100 km circular lunar orbit.
```

Workflow:

1. inspect current Earth orbit;
2. create translunar injection;
3. observe resulting eccentric Earth orbit;
4. calculate Moon encounter;
5. propagate to lunar SOI;
6. inspect lunar-relative trajectory;
7. perform capture burn;
8. circularize lunar orbit.

Do not automatically force success.

A poorly chosen burn must miss the Moon.

---

# 30. Optional Mission Scenario: Earth to Mars

Provide a simplified Earth-to-Mars transfer.

Functions:

* departure window visualization;
* transfer orbit;
* approximate Hohmann solution;
* Mars encounter prediction.

The user may compare an analytically suggested transfer with manually created manoeuvres.

---

# 31. Transfer Planner

Implement a Hohmann transfer helper.

Inputs:

```text
origin orbit
target orbit
departure time
```

Outputs:

```text
first burn Δv
transfer duration
second burn Δv
total Δv
```

The planner should generate manoeuvre nodes that can then be manually adjusted.

The helper does not bypass the simulation.

---

# 32. Lagrange Point Visualization

For a two-body system such as Earth–Moon, calculate approximate positions of:

```text
L1
L2
L3
L4
L5
```

Display them optionally.

This feature is primarily educational and need not implement high-fidelity station-keeping dynamics.

---

# 33. Physics Debug Overlay

Provide a developer/debug mode showing:

* gravitational acceleration vectors;
* velocity vectors;
* reference-frame axes;
* current timestep;
* active propagator;
* dominant gravitational body;
* integration error estimate where available;
* active SOIs.

This is important because it exposes the internal mechanics rather than presenting the application as a black box.

---

# 34. State Serialization

Mission state must be serializable.

Example:

```ts
interface MissionState {
  version: number;

  epoch: number;

  bodies: CelestialBody[];
  spacecraft: Spacecraft[];
  manoeuvres: Manoeuvre[];

  simulationSettings: SimulationSettings;
}
```

Support:

```text
Save mission
Load mission
Export JSON
Import JSON
Reset scenario
```

Use browser storage for local persistence.

---

# 35. Suggested Module Structure

```text
src/
  app/
    App.ts
    StateStore.ts

  physics/
    constants.ts
    vectors.ts
    gravity.ts
    orbital-elements.ts
    frames.ts
    soi.ts

    integrators/
      Integrator.ts
      RK4.ts

    propagators/
      KeplerPropagator.ts
      NumericalPropagator.ts
      HybridPropagator.ts

  simulation/
    Simulation.ts
    SimulationClock.ts
    EventDetector.ts
    TrajectoryPredictor.ts
    worker.ts

  mission/
    Maneuver.ts
    TransferPlanner.ts
    MissionState.ts
    presets.ts

  rendering/
    SceneRenderer.ts
    FloatingOrigin.ts
    CameraController.ts
    OrbitRenderer.ts
    TrajectoryRenderer.ts
    VectorRenderer.ts
    Selection.ts

  ui/
    Inspector.ts
    Timeline.ts
    MissionPanel.ts
    ManeuverEditor.ts

  charts/
    AltitudeChart.ts
    VelocityChart.ts
    EnergyChart.ts

  persistence/
    MissionSerializer.ts
    LocalStorage.ts

  tests/
```

---

# 36. Performance Requirements

Target:

```text
60 FPS rendering on a typical modern desktop
```

Physics must not block UI interaction.

Trajectory recalculation should normally complete fast enough to feel interactive.

Long calculations should:

* run in a worker;
* expose progress;
* be cancellable when the user modifies the manoeuvre again.

Do not continue calculating obsolete trajectories.

Use a monotonically increasing prediction request ID.

---

# 37. Validation

The simulation must include automated tests.

Use:

```text
bun test
```

with `bun:test`.

---

# 38. Required Physics Tests

## Circular orbit

Given a valid circular orbit:

* radius should remain approximately stable;
* eccentricity should remain near zero;
* energy drift must remain bounded.

---

## Orbital period

Compare calculated orbital period with:

```text
T = 2π √(a³ / μ)
```

---

## Escape velocity

Validate:

```text
v_escape = √(2μ/r)
```

---

## Hohmann transfer

Compare planner output with analytic expected delta-v.

---

## Orbital element conversion

Verify:

```text
state vector
→ orbital elements
→ reconstructed state vector
```

within numerical tolerance.

---

## Frame transformation

Verify reversible transformation between:

```text
inertial
body-centred
spacecraft-local
```

frames.

---

# 39. Numerical Quality Indicators

Expose numerical diagnostics where useful.

Examples:

```text
specific energy drift
angular momentum drift
integration step
prediction error estimate
```

The project should make numerical limitations visible rather than implying perfect precision.

---

# 40. Explicit Non-Goals

The initial version is not intended to be:

* NASA-grade mission-planning software;
* a full ephemeris engine;
* a relativistic simulation;
* an atmospheric fluid-dynamics simulator;
* a launch vehicle design system;
* a commercial astrodynamics package.

Realism should be strong enough that orbital behaviour is mathematically credible.

---

# 41. Visual Quality Requirements

The application should look like a technical scientific instrument.

Prefer:

* dark neutral background;
* sharp typography;
* restrained line rendering;
* clearly differentiated trajectories;
* subtle atmospheric effects;
* strong visual hierarchy.

Avoid excessive:

* bloom;
* lens flares;
* neon;
* particle effects;
* decorative HUD elements.

The visual spectacle should come from the behaviour of the system.

---

# 42. Demonstration Sequence

The application should support a compelling five-minute demonstration.

### Scene 1

Open Earth.

A spacecraft visibly orbits at 300 km.

Display:

```text
Altitude: 300 km
Velocity: ~7.7 km/s
Period: ~90 minutes
```

### Scene 2

Add:

```text
+120 m/s prograde
```

The predicted orbit immediately stretches.

Show the new apoapsis.

### Scene 3

Increase the manoeuvre until the trajectory crosses the Moon's future position.

The Moon encounter indicator appears.

### Scene 4

Accelerate time.

Watch the spacecraft leave low Earth orbit and approach the Moon.

### Scene 5

Switch reference frame from Earth to Moon.

The trajectory changes visually from an Earth transfer orbit into a lunar flyby.

### Scene 6

Apply a retrograde lunar capture burn.

A closed lunar orbit appears.

The demonstration should make clear that every visible change is a consequence of the underlying mechanics.

---

# 43. Definition of Done

The project is complete when:

* it runs locally using Bun;
* it builds as a static application;
* Earth, Moon, Sun and Mars are simulated;
* spacecraft can be created and selected;
* orbital elements are calculated from state vectors;
* trajectories are physically propagated;
* manoeuvres modify those trajectories;
* trajectory prediction operates independently of rendering;
* Earth–Moon transfer is possible;
* incorrect manoeuvres can miss the Moon;
* SOI transitions work;
* multiple reference frames work;
* time acceleration works;
* numerical behaviour is covered by automated tests;
* mission state can be exported and imported;
* Three.js rendering remains responsive during calculation;
* the user can inspect why the spacecraft behaves as it does.

The final product should feel less like an animation and more like a compact interactive astrodynamics laboratory.
