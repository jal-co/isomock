@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var fieldSampler: sampler;

@fragment
fn renderField(@location(0) uv: vec2f) -> @location(0) vec4f {
  let strength = textureSampleLevel(field, fieldSampler, uv, 0.0).r;
  let ink = vec3f(0.078, 0.12, 0.22);
  let impulse = vec3f(0.20, 0.90, 1.00);
  let halo = smoothstep(0.015, 0.84, strength);
  let alpha = halo;
  // ImageData / Toolcraft target-readback consumes straight, not premultiplied RGBA.
  return vec4f(select(vec3f(0.0), mix(ink, impulse, halo), alpha > 0.0), alpha);
}
