/** A real inverse-sampling shader: the wrong sign reproduces texture-offset mirroring. */
export function drawVectorShaderFixture(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  mirrored: boolean,
): () => void {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("Vector shader fixture requires WebGL.");
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed.");
    return shader;
  };
  const vertex = compile(
    gl.VERTEX_SHADER,
    "attribute vec2 position; void main() { gl_Position = vec4(position, 0., 1.); }",
  );
  const fragment = compile(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    uniform vec2 offset;
    void main() {
      vec2 uv = gl_FragCoord.xy / 320.;
      vec2 sampled = uv ${mirrored ? "+" : "-"} offset;
      vec2 distance = abs(sampled - vec2(.5));
      float marker = float(distance.x < .0375 && distance.y < .0375);
      gl_FragColor = vec4(mix(vec3(16./255.), vec3(1., 0., 128./255.), marker), 1.);
    }
  `,
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed.");
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, "offset"), x / 320, -y / 320);
  gl.viewport(0, 0, 320, 320);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return () => {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  };
}
