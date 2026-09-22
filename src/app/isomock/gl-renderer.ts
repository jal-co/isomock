import type { IsomockCamera } from "./camera";
import type { IsomockSettings } from "./settings";

export const ISOMOCK_MAX_BOKEH_SAMPLES = 64;

const vertexSource = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const fragmentSource = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uTextureSize;
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uTanHalf;
uniform float uAspect;
uniform float uImageWidth;
uniform float uFocusDepth;
uniform float uBlur;
uniform float uSharpBand;
uniform float uGrain;
uniform mat3 uSourceTransform;

out vec4 outColor;

const int MAX_SAMPLES = ${ISOMOCK_MAX_BOKEH_SAMPLES};
const float GOLDEN_ANGLE = 2.39996323;

bool castRay(vec2 pixel, out vec2 uv, out float depth) {
  vec2 ndc = pixel / uResolution * 2.0 - 1.0;
  vec3 direction = uCameraForward
    + uCameraRight * ndc.x * uTanHalf * uAspect
    + uCameraUp * ndc.y * uTanHalf;
  if (abs(direction.z) < 1e-9) return false;
  depth = -uCameraPosition.z / direction.z;
  if (depth <= 0.0) return false;
  vec3 hit = uCameraPosition + direction * depth;
  uv = vec2(hit.x / uImageWidth + 0.5, 0.5 - hit.y);
  return true;
}

vec4 samplePlane(vec2 pixel, float footprintBoost) {
  vec2 uv; float depth;
  vec2 uvX; float depthX;
  vec2 uvY; float depthY;
  if (!castRay(pixel, uv, depth)) return vec4(0.0);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  castRay(pixel + vec2(1.0, 0.0), uvX, depthX);
  castRay(pixel + vec2(0.0, 1.0), uvY, depthY);
  vec2 source = (uSourceTransform * vec3(uv, 1.0)).xy;
  vec2 dx = (uSourceTransform * vec3(uvX - uv, 0.0)).xy * uTextureSize;
  vec2 dy = (uSourceTransform * vec3(uvY - uv, 0.0)).xy * uTextureSize;
  float footprint = max(length(dx), length(dy)) * footprintBoost;
  return textureLod(uTexture, source, log2(max(footprint, 1.0)));
}

float circleOfConfusion(float depth) {
  return uBlur * 0.001 * max(0.0, abs(depth - uFocusDepth) - uSharpBand) * uResolution.y;
}

float grainNoise(vec2 cell) {
  return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv; float depth;
  float radius = castRay(pixel, uv, depth) ? circleOfConfusion(depth) : 0.0;
  radius = max(radius, 0.5);
  int count = min(MAX_SAMPLES, int(ceil(radius * radius * 0.75)) + 4);
  float spacing = radius * sqrt(3.14159265 / float(count));
  vec4 color = vec4(0.0);
  for (int index = 0; index < MAX_SAMPLES; index++) {
    if (index >= count) break;
    float angle = float(index) * GOLDEN_ANGLE;
    float distance = radius * sqrt((float(index) + 0.5) / float(count));
    color += samplePlane(pixel + distance * vec2(cos(angle), sin(angle)), max(spacing, 1.0));
  }
  color /= float(count);
  vec2 grainCell = floor(pixel * 1080.0 / uResolution.y);
  color.rgb += (grainNoise(grainCell) - 0.5) * uGrain * 0.004 * color.a;
  outColor = clamp(color, 0.0, 1.0);
}
`;

export type IsomockSourceTransform = Readonly<{
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
}>;

export function getIsomockDisplayAspect(
  source: Readonly<{ height: number; width: number }>,
  transform: IsomockSourceTransform | undefined,
): number {
  const quarterTurn = transform?.rotationDeg === 90 || transform?.rotationDeg === 270;
  return quarterTurn ? source.height / source.width : source.width / source.height;
}

export function getIsomockSourceMatrix(
  transform: IsomockSourceTransform | undefined,
): Float32Array {
  const map = (u: number, v: number): [number, number] => {
    const fu = transform?.flipHorizontal ? 1 - u : u;
    const fv = transform?.flipVertical ? 1 - v : v;
    switch (transform?.rotationDeg ?? 0) {
      case 90:
        return [fv, 1 - fu];
      case 180:
        return [1 - fu, 1 - fv];
      case 270:
        return [1 - fv, fu];
      default:
        return [fu, fv];
    }
  };
  const origin = map(0, 0);
  const alongU = map(1, 0);
  const alongV = map(0, 1);
  return new Float32Array([
    alongU[0] - origin[0], alongU[1] - origin[1], 0,
    alongV[0] - origin[0], alongV[1] - origin[1], 0,
    origin[0], origin[1], 1,
  ]);
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Isomock could not allocate a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Isomock shader failed: ${gl.getShaderInfoLog(shader) ?? "unknown"}`);
  }
  return shader;
}

export type IsomockRenderInput = Readonly<{
  camera: IsomockCamera;
  height: number;
  settings: IsomockSettings;
  source: ImageBitmap;
  transform: IsomockSourceTransform | undefined;
  width: number;
}>;

export type IsomockGlRenderer = Readonly<{
  clear(width: number, height: number): void;
  dispose(): void;
  render(input: IsomockRenderInput): void;
}>;

export function createIsomockGlRenderer(
  canvas: HTMLCanvasElement,
  options: Readonly<{ disposable: boolean }>,
): IsomockGlRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("Isomock requires WebGL2.");

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Isomock program failed: ${gl.getProgramInfoLog(program) ?? "unknown"}`);
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const texture = gl.createTexture();
  let uploadedSource: ImageBitmap | null = null;

  const upload = (source: ImageBitmap) => {
    if (uploadedSource === source) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    uploadedSource = source;
  };

  const resize = (width: number, height: number) => {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  return {
    clear(width, height) {
      resize(width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      if (options.disposable) gl.getExtension("WEBGL_lose_context")?.loseContext();
      uploadedSource = null;
    },
    render({ camera, height, settings, source, transform, width }) {
      resize(width, height);
      upload(source);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform("uTexture"), 0);
      gl.uniform2f(uniform("uTextureSize"), source.width, source.height);
      gl.uniform2f(uniform("uResolution"), width, height);
      gl.uniform3fv(uniform("uCameraPosition"), camera.position);
      gl.uniform3fv(uniform("uCameraRight"), camera.right);
      gl.uniform3fv(uniform("uCameraUp"), camera.up);
      gl.uniform3fv(uniform("uCameraForward"), camera.forward);
      gl.uniform1f(uniform("uTanHalf"), camera.tanHalf);
      gl.uniform1f(uniform("uAspect"), camera.aspect);
      gl.uniform1f(uniform("uImageWidth"), camera.imageWidth);
      gl.uniform1f(uniform("uFocusDepth"), camera.focusDepth);
      gl.uniform1f(uniform("uBlur"), settings.blur);
      gl.uniform1f(uniform("uSharpBand"), settings.sharpBand);
      gl.uniform1f(uniform("uGrain"), settings.grain);
      gl.uniformMatrix3fv(uniform("uSourceTransform"), false, getIsomockSourceMatrix(transform));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
