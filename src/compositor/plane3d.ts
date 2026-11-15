/**
 * Opt-in 3D plane bake — textured quad with perspective into a stage-sized canvas.
 * Used by preview/export blit when clip.transform3d.enabled.
 *
 * Coordinate system (eye space):
 * - XY in stage pixels, origin at frame center
 * - +Y up (canvas Y is flipped when building the model)
 * - +Z toward camera; plane rests at z=0
 * - Camera at z = +perspective; w = perspective - z
 */

import type { ResolvedTransform, ResolvedTransform3D } from "../engine/animatable";
import { DEFAULT_TRANSFORM3D_PERSPECTIVE } from "../project/types";
import { computeFittedRect, resolveTransform } from "./transform";
import type { CompositorFit } from "./types";

const DEG = Math.PI / 180;

type GlState = {
  canvas: OffscreenCanvas;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buf: WebGLBuffer;
  tex: WebGLTexture;
  uMatrix: WebGLUniformLocation;
  uTex: WebGLUniformLocation;
  aPos: number;
  aUv: number;
  width: number;
  height: number;
};

let glState: GlState | null = null;

const VS = `
attribute vec3 a_pos;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}
`;

const FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}
`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("WebGL shader create failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile error";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function ensureGl(width: number, height: number): GlState | null {
  if (
    glState &&
    glState.width === width &&
    glState.height === height &&
    !glState.gl.isContextLost()
  ) {
    return glState;
  }
  if (glState) {
    try {
      glState.gl.deleteTexture(glState.tex);
      glState.gl.deleteBuffer(glState.buf);
      glState.gl.deleteProgram(glState.program);
    } catch {
      /* ignore */
    }
    glState = null;
  }
  const canvas = new OffscreenCanvas(width, height);
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buf = gl.createBuffer();
  const tex = gl.createTexture();
  if (!buf || !tex) return null;

  const uMatrix = gl.getUniformLocation(program, "u_matrix");
  const uTex = gl.getUniformLocation(program, "u_tex");
  if (!uMatrix || !uTex) return null;

  glState = {
    canvas,
    gl,
    program,
    buf,
    tex,
    uMatrix,
    uTex,
    aPos: gl.getAttribLocation(program, "a_pos"),
    aUv: gl.getAttribLocation(program, "a_uv"),
    width,
    height,
  };
  return glState;
}

function mat4Identity(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r]! * b[c * 4 + 0]! +
        a[1 * 4 + r]! * b[c * 4 + 1]! +
        a[2 * 4 + r]! * b[c * 4 + 2]! +
        a[3 * 4 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

function mat4Translate(x: number, y: number, z: number): Float32Array {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function mat4RotateX(rad: number): Float32Array {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = mat4Identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function mat4RotateY(rad: number): Float32Array {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = mat4Identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function mat4RotateZ(rad: number): Float32Array {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = mat4Identity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/**
 * Pixel-space perspective: at z=0, 1 eye-pixel = 1 screen-pixel.
 * x_ndc = x / (dstW/2), y_ndc = y / (dstH/2), w = P - z.
 */
function mat4PixelPerspective(
  dstW: number,
  dstH: number,
  perspective: number,
): Float32Array {
  const P = perspective;
  const m = new Float32Array(16);
  m[0] = (2 / dstW) * P;
  m[5] = (2 / dstH) * P;
  // w' = P - z  (column-major: w' = m[11]*z + m[15])
  m[11] = -1;
  m[15] = P;
  return m;
}

export type BakePlane3DArgs = {
  source: CanvasImageSource;
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
  layoutW: number;
  layoutH: number;
  fit: CompositorFit;
  transform?: ResolvedTransform | null;
  transform3d: ResolvedTransform3D;
  placement?: "frame" | "native";
  layoutSize?: { width: number; height: number } | null;
};

/**
 * Bake a perspective plane into a transparent stage-sized canvas.
 * Returns null if WebGL is unavailable (caller should fall back to 2D).
 */
export function bakePlane3D(
  args: BakePlane3DArgs,
): { canvas: OffscreenCanvas; width: number; height: number } | null {
  const {
    source,
    srcW,
    srcH,
    dstW,
    dstH,
    layoutW,
    layoutH,
    fit,
    transform,
    transform3d,
    placement = "frame",
    layoutSize,
  } = args;

  const state = ensureGl(dstW, dstH);
  if (!state) return null;
  const { gl, canvas, program, buf, tex, uMatrix, uTex, aPos, aUv } = state;

  const t = resolveTransform(transform);
  const scaleX = t.uniformScale !== false ? t.scaleX : t.scaleX;
  const scaleY = t.uniformScale !== false ? t.scaleX : t.scaleY;
  const mapX = dstW / layoutW;
  const mapY = dstH / layoutH;

  let fitted;
  let applyScaleX = scaleX;
  let applyScaleY = scaleY;
  if (placement === "native") {
    if (layoutSize && layoutSize.width > 0 && layoutSize.height > 0) {
      const nativeW = layoutSize.width * scaleX * mapX;
      const nativeH = layoutSize.height * scaleY * mapY;
      fitted = {
        drawW: nativeW,
        drawH: nativeH,
        dx: (dstW - nativeW) / 2,
        dy: (dstH - nativeH) / 2,
      };
      applyScaleX = 1;
      applyScaleY = 1;
    } else {
      const nativeW = srcW * mapX;
      const nativeH = srcH * mapY;
      fitted = {
        drawW: nativeW,
        drawH: nativeH,
        dx: (dstW - nativeW) / 2,
        dy: (dstH - nativeH) / 2,
      };
    }
  } else {
    fitted = computeFittedRect(srcW, srcH, dstW, dstH, fit);
  }
  if (!fitted) return null;

  const ox = t.x * mapX;
  const oy = t.y * mapY;
  const rot2d = t.rotation * DEG;
  const rx = transform3d.rotateX * DEG;
  const ry = transform3d.rotateY * DEG;
  const rz = transform3d.rotateZ * DEG + rot2d;
  const zOff = transform3d.z;
  const perspective = Math.max(
    120,
    transform3d.perspective || DEFAULT_TRANSFORM3D_PERSPECTIVE,
  );

  // Clamp z so the plane stays in front of the camera.
  const zClamped = Math.min(perspective - 40, Math.max(-perspective, zOff));

  const hw = (fitted.drawW * applyScaleX) / 2;
  const hh = (fitted.drawH * applyScaleY) / 2;
  // Local quad, center origin, +Y up. With UNPACK_FLIP_Y, image top is at v=1.
  const verts = new Float32Array([
    -hw, -hh, 0, 0, 0,
    hw, -hh, 0, 1, 0,
    -hw, hh, 0, 0, 1,
    hw, hh, 0, 1, 1,
  ]);

  gl.viewport(0, 0, dstW, dstH);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  try {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source as TexImageSource,
    );
  } catch {
    return null;
  }
  gl.uniform1i(uTex, 0);

  // Model: Primary XY on the plane, then 3D rotate, then depth.
  // Canvas +Y is down; eye +Y is up → translate by -oy.
  // Order (applied to verts): Txy → R → Tz so position/scale stick to the tilted plane.
  let model = mat4Identity();
  model = mat4Multiply(mat4Translate(ox, -oy, 0), model);
  model = mat4Multiply(mat4RotateX(rx), model);
  model = mat4Multiply(mat4RotateY(ry), model);
  model = mat4Multiply(mat4RotateZ(rz), model);
  model = mat4Multiply(mat4Translate(0, 0, zClamped), model);

  const proj = mat4PixelPerspective(dstW, dstH, perspective);
  const mvp = mat4Multiply(proj, model);

  gl.uniformMatrix4fv(uMatrix, false, mvp);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const out = new OffscreenCanvas(dstW, dstH);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, dstW, dstH);
  ctx.drawImage(canvas, 0, 0);

  return { canvas: out, width: dstW, height: dstH };
}
