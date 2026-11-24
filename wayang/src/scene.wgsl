struct Scene {
    center: vec2<f32>,
    span: vec2<f32>,
    offset: vec2<f32>,
    horizon: f32,
    padding: f32,
}
@group(0) @binding(0) var art: texture_2d<f32>;
@group(0) @binding(1) var linear_filter: sampler;
@group(0) @binding(2) var<uniform> scene: Scene;

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
    let sample_color = textureSample(art, linear_filter, uv + depth * scene.offset);
    return vec4<f32>(sample_color.rgb * sample_color.a, 1.0);
}
