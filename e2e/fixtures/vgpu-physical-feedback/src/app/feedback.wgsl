struct SimulationParams {
  size: vec2u,
  impulse: f32,
  decay: f32,
  reset: f32,
  time: f32,
}

@group(0) @binding(0) var previousField: texture_2d<f32>;
@group(0) @binding(1) var nextField: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> simulation: SimulationParams;

fn sampleField(point: vec2i) -> f32 {
  let maximum = vec2i(simulation.size) - vec2i(1);
  return textureLoad(previousField, clamp(point, vec2i(0), maximum), 0).r;
}

@compute @workgroup_size(8, 8)
fn simulate(@builtin(global_invocation_id) globalId: vec3u) {
  if (any(globalId.xy >= simulation.size)) {
    return;
  }
  let point = vec2i(globalId.xy);
  let uv = (vec2f(globalId.xy) + vec2f(0.5)) / vec2f(simulation.size);
  let delta = uv - vec2f(0.5);
  let seed = simulation.impulse * exp(-dot(delta, delta) * 92.0);
  var previous = 0.0;
  if (simulation.reset < 0.5) {
    previous = (
      sampleField(point) * 4.0 +
      sampleField(point + vec2i(1, 0)) +
      sampleField(point + vec2i(-1, 0)) +
      sampleField(point + vec2i(0, 1)) +
      sampleField(point + vec2i(0, -1))
    ) / 8.0;
  }
  let pulse = seed * (0.82 + 0.18 * cos(simulation.time * 6.2831853));
  let field = clamp(max(previous * simulation.decay, pulse), 0.0, 1.0);
  textureStore(nextField, point, vec4f(field, 0.0, 0.0, 1.0));
}
