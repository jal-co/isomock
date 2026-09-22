import { getToolcraftMaskSupport } from "../core/numerics";
import { TOOLCRAFT_MAX_MASKS, type EvaluatedToolcraftMasks } from "../contracts";

/** Renderer-independent typed uniform data. vec2 arrays are flattened for uniform2fv. */
export type ToolcraftWebGLMaskUniforms = Readonly<{
  enabled: number; count: number;
  centers: Float32Array; radii: Float32Array; rotations: Float32Array;
  widths: Float32Array; opacities: Float32Array; metrics: Float32Array;
}>;

export function createToolcraftWebGLMaskUniforms(masks: EvaluatedToolcraftMasks): ToolcraftWebGLMaskUniforms {
  if (masks.items.length > TOOLCRAFT_MAX_MASKS) throw new Error("Soft ellipse masks exceed the supported maximum of 16.");
  const active = masks.items.filter(item => item.enabled);
  const uniforms = {
    enabled: masks.enabled ? 1 : 0, count: active.length,
    centers: new Float32Array(TOOLCRAFT_MAX_MASKS * 2), radii: new Float32Array(TOOLCRAFT_MAX_MASKS * 2), rotations: new Float32Array(TOOLCRAFT_MAX_MASKS * 2),
    widths: new Float32Array(TOOLCRAFT_MAX_MASKS), opacities: new Float32Array(TOOLCRAFT_MAX_MASKS), metrics: new Float32Array(TOOLCRAFT_MAX_MASKS),
  };
  active.forEach((item, index) => {
    getToolcraftMaskSupport(item);
    uniforms.centers.set([item.center.x, item.center.y], index * 2);
    uniforms.radii.set([item.radiusX, item.radiusY], index * 2);
    const angle = item.rotationDegrees * Math.PI / 180;
    uniforms.rotations.set([Math.cos(angle), Math.sin(angle)], index * 2);
    uniforms.widths[index] = item.edge.width;
    uniforms.opacities[index] = item.opacity;
    uniforms.metrics[index] = item.edge.metric === "normalized-radius" ? 1 : 0;
  });
  return uniforms;
}

/** q is app-local, top-left CSS pixels, independent of render window and backing density.
 * Call toolcraftMaskCoverage(q) before compositing the app background and finite clip.
 * Premultiplied foreground multiplies rgba by coverage; straight alpha multiplies alpha only.
 */
export const TOOLCRAFT_WEBGL_MASK_GLSL = `
#define TOOLCRAFT_MAX_MASKS ${TOOLCRAFT_MAX_MASKS}
uniform int uToolcraftMasksEnabled;
uniform int uToolcraftMaskCount;
uniform vec2 uToolcraftMaskCenters[TOOLCRAFT_MAX_MASKS];
uniform vec2 uToolcraftMaskRadii[TOOLCRAFT_MAX_MASKS];
uniform vec2 uToolcraftMaskRotations[TOOLCRAFT_MAX_MASKS];
uniform float uToolcraftMaskWidths[TOOLCRAFT_MAX_MASKS];
uniform float uToolcraftMaskOpacities[TOOLCRAFT_MAX_MASKS];
uniform float uToolcraftMaskMetrics[TOOLCRAFT_MAX_MASKS];
float toolcraftMaskCoverage(vec2 q) {
  if (uToolcraftMasksEnabled == 0 || uToolcraftMaskCount == 0) return 1.0;
  float outside = 1.0;
  for (int i = 0; i < TOOLCRAFT_MAX_MASKS; i++) {
    if (i >= uToolcraftMaskCount) break;
    vec2 v = q - uToolcraftMaskCenters[i];
    vec2 e = uToolcraftMaskRadii[i];
    float w = uToolcraftMaskWidths[i];
    float support = max(e.x, e.y) * (1.0 + (uToolcraftMaskMetrics[i] > 0.5 ? w : w / min(e.x, e.y)));
    if (abs(v.x) > support || abs(v.y) > support) continue;
    vec2 r = uToolcraftMaskRotations[i];
    vec2 p = vec2(r.x * v.x + r.y * v.y, -r.y * v.x + r.x * v.y);
    float g = length(p / e);
    float shape;
    if (uToolcraftMaskMetrics[i] > 0.5) {
      shape = w <= 0.00001 ? (g <= 1.0 ? 1.0 : 0.0) : 1.0 - smoothstep(1.0 - w, 1.0 + w, g);
    } else {
      float majorRadius = max(e.x, e.y);
      float gradient = g < 0.0001 ? 1.0 : length((p / e) / g / (e / majorRadius));
      float d = g < 0.0001 ? -min(e.x, e.y) : (g - 1.0) * majorRadius / gradient;
      shape = w <= 0.0 ? (d <= 0.0 ? 1.0 : 0.0) : 1.0 - smoothstep(-w, w, d);
    }
    outside *= 1.0 - shape * uToolcraftMaskOpacities[i];
  }
  return 1.0 - outside;
}
`;

export function bindToolcraftWebGLMaskUniforms(gl: WebGLRenderingContext | WebGL2RenderingContext, program: WebGLProgram, masks: EvaluatedToolcraftMasks): void {
  const u = createToolcraftWebGLMaskUniforms(masks);
  gl.uniform1i(gl.getUniformLocation(program, "uToolcraftMasksEnabled"), u.enabled);
  gl.uniform1i(gl.getUniformLocation(program, "uToolcraftMaskCount"), u.count);
  gl.uniform2fv(gl.getUniformLocation(program, "uToolcraftMaskCenters[0]"), u.centers);
  gl.uniform2fv(gl.getUniformLocation(program, "uToolcraftMaskRadii[0]"), u.radii);
  gl.uniform2fv(gl.getUniformLocation(program, "uToolcraftMaskRotations[0]"), u.rotations);
  gl.uniform1fv(gl.getUniformLocation(program, "uToolcraftMaskWidths[0]"), u.widths);
  gl.uniform1fv(gl.getUniformLocation(program, "uToolcraftMaskOpacities[0]"), u.opacities);
  gl.uniform1fv(gl.getUniformLocation(program, "uToolcraftMaskMetrics[0]"), u.metrics);
}
