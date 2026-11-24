struct Scene {
    center: vec2<f32>,
    span: vec2<f32>,
    offset: vec2<f32>,
    horizon: f32,
    phase: f32,
    aspect: vec2<f32>,
    activity: f32,
    effect: f32,
    mask_info: vec4<f32>,
}
@group(0) @binding(0) var art: texture_2d<f32>;
@group(0) @binding(1) var linear_filter: sampler;
@group(0) @binding(2) var<uniform> scene: Scene;
@group(0) @binding(3) var water_mask: texture_2d<f32>;

const TAU = 6.2831853;

// A cell returns to the same particle after one full rise through four rows.
fn motes(p: vec2<f32>, grid: f32, seed: f32, phase: f32) -> vec2<f32> {
    let pos = p * grid + vec2<f32>(seed, 4.0 * phase + seed);
    let cell = floor(pos);
    let id = vec2<f32>(cell.x, cell.y - 4.0 * floor(cell.y / 4.0));
    let noise = fract(sin(vec3<f32>(
        dot(id, vec2<f32>(41.3, 17.7)) + seed,
        dot(id, vec2<f32>(19.1, 73.9)) + seed,
        dot(id, vec2<f32>(57.2, 37.1)) + seed)) * 4375.71);
    let turn = TAU * (phase + noise.y);
    let center = vec2<f32>(0.5 + 0.22 * sin(turn) + 0.30 * (noise.x - 0.5), 0.22 + 0.56 * noise.y);
    let delta = (fract(pos) - center) * vec2<f32>(1.0, 0.84);
    let radius = 0.010 + 0.016 * noise.z;
    let distance = length(delta) / radius;
    let pulse = (0.75 + 0.25 * sin(2.0 * turn)) * (0.5 + 0.5 * noise.x);
    return pulse * vec2<f32>(exp(-1.5 * distance * distance), exp(-0.12 * distance * distance));
}

struct Vertex {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
    let uv = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return Vertex(vec4<f32>(uv * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0), uv);
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4<f32> {
    let uv = scene.center + (input.uv - 0.5) * scene.span;
    let depth = smoothstep(scene.horizon, 1.0, uv.y);
    var source = uv + depth * scene.offset;
    var shine = 0.0;
    let automatic = scene.effect < 0.5;
    let has_water = scene.mask_info.x > 0.5;
    let water = select(scene.effect == 1.0, has_water, automatic);
    let lights = select(scene.effect == 2.0, !has_water, automatic);
    if scene.activity > 0.0 && water {
        let mask = textureSampleLevel(water_mask, linear_filter, source, 0.0).r;
        let surface = select(smoothstep(scene.horizon, 1.0, uv.y), mask, has_water);
        let t = TAU * scene.phase;
        // Wave fronts compress in the distance. Two crossing swells refract the
        // source reflections at different speeds, and highlights travel with their crests.
        let art_size = vec2<f32>(textureDimensions(art));
        let p = uv * art_size / min(art_size.x, art_size.y);
        let row = p.y * (19.0 - 5.0 * depth);
        let wave = TAU * (row + 0.85 * p.x) - 5.0 * t + 1.15 * sin(9.0 * p.x + 2.0 * t);
        let cross_wave = TAU * (0.57 * row - 1.6 * p.x) + 3.0 * t;
        let swell = 0.68 * sin(wave) + 0.32 * sin(cross_wave);
        let strength = scene.activity * surface * (0.25 + 0.75 * depth);
        let amplitude = strength * scene.span / scene.aspect * vec2<f32>(0.014, 0.005);
        // Feather refraction at source boundaries even at extreme crops.
        let room = max(vec2<f32>(0.0), min(source, 1.0 - source) - 0.5 / vec2<f32>(textureDimensions(art)));
        source += min(amplitude, room) * vec2<f32>(swell, 0.7 * cos(wave) + 0.3 * sin(cross_wave));
        shine = strength * (0.19 * smoothstep(0.42, 0.99, swell) - 0.035);
    }
    let sample_color = textureSampleLevel(art, linear_filter, source, 0.0);
    var color = sample_color.rgb * sample_color.a;
    color += shine * (vec3<f32>(0.25, 0.36, 0.45) + 0.9 * color);
    if scene.activity > 0.0 && lights {
        let pos = input.uv * scene.aspect;
        let far = motes(pos, 6.2, 1.73, scene.phase);
        let near = motes(pos, 3.5, 7.13, scene.phase);
        color = mix(color, vec3<f32>(0.50, 0.84, 1.0), clamp(scene.activity * (far.x + 0.30 * far.y), 0.0, 0.90));
        color = mix(color, vec3<f32>(1.0, 0.77, 0.37), clamp(scene.activity * (near.x + 0.40 * near.y), 0.0, 0.96));
    }
    return vec4<f32>(color, 1.0);
}
