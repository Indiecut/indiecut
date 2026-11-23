import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

type Props = {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  /** Primary transform — mirrored on the object plane (editing stays in Primary). */
  offsetX?: number;
  offsetY?: number;
  scaleX?: number;
  scaleY?: number;
  /** Project frame size for mapping pixel offsets into widget local units. */
  frameWidth?: number;
  frameHeight?: number;
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onRotate: (rotateX: number, rotateY: number) => void;
};

const DEG = Math.PI / 180;

type Vec3 = [number, number, number];

function rotX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Head-on view: frame grid is a flat screen (like the preview), not an
 * orbiting 3D slab. Perspective still foreshortens the clip plane when tilted.
 */
function project(
  v: Vec3,
  cx: number,
  cy: number,
  scale: number,
): [number, number, number] {
  const z = v[2] + 4.8;
  const p = 3.7 / Math.max(0.45, z);
  return [cx + v[0] * scale * p, cy - v[1] * scale * p, v[2]];
}

function avgDepth(pts: [number, number, number][]): number {
  let s = 0;
  for (const p of pts) s += p[2];
  return s / Math.max(1, pts.length);
}

/**
 * Grid = fixed 2D video / non-3D composition plane (XY).
 * Red plane = this clip’s 3D orientation + Primary position/scale on that plane.
 * At identity they coincide (straight, aligned).
 */
export function Plane3DWidget({
  rotateX,
  rotateY,
  rotateZ,
  offsetX = 0,
  offsetY = 0,
  scaleX = 1,
  scaleY = 1,
  frameWidth = 1920,
  frameHeight = 1080,
  disabled,
  onDragStart,
  onDragEnd,
  onRotate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    rx: number;
    ry: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 240;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW;
    const h = cssH;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const scale = Math.min(w, h) * 0.3;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#f4f5f7");
    bg.addColorStop(1, "#e6e8ec");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const rx = rotateX * DEG;
    const ry = rotateY * DEG;
    // Negate Z to match Canvas/CSS Y-down degrees (same as bakePlane3D).
    const rz = -rotateZ * DEG;

    // 3D clip plane: local XY offset/scale first, then rotated (matches bakePlane3D).
    const applyPlane = (p: Vec3): Vec3 => rotZ(rotY(rotX(p, rx), ry), rz);
    const proj = (p: Vec3) => project(p, cx, cy, scale);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // —— Frame grid: fixed XY plane = non-3D video layer ——
    const gridHalfW = 1.35;
    const gridHalfH = 0.95;
    const divX = 6;
    const divY = 4;

    const frameCorners = [
      proj([-gridHalfW, -gridHalfH, 0]),
      proj([gridHalfW, -gridHalfH, 0]),
      proj([gridHalfW, gridHalfH, 0]),
      proj([-gridHalfW, gridHalfH, 0]),
    ];

    ctx.beginPath();
    ctx.moveTo(frameCorners[0]![0], frameCorners[0]![1]);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(frameCorners[i]![0], frameCorners[i]![1]);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fill();

    ctx.strokeStyle = "rgba(100, 110, 125, 0.28)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= divX; i++) {
      const t = i / divX;
      const x = -gridHalfW + t * gridHalfW * 2;
      const a = proj([x, -gridHalfH, 0]);
      const b = proj([x, gridHalfH, 0]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    for (let j = 0; j <= divY; j++) {
      const t = j / divY;
      const y = -gridHalfH + t * gridHalfH * 2;
      const a = proj([-gridHalfW, y, 0]);
      const b = proj([gridHalfW, y, 0]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }

    // Frame border (video bounds)
    ctx.beginPath();
    ctx.moveTo(frameCorners[0]![0], frameCorners[0]![1]);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(frameCorners[i]![0], frameCorners[i]![1]);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(60, 70, 85, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font =
      "600 10px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(80, 90, 105, 0.75)";
    const frameLabel = proj([-gridHalfW, -gridHalfH, 0]);
    ctx.fillText("screen", frameLabel[0] + 4, frameLabel[1] - 4);

    // —— Plane R: clip with Primary scale/position on the 3D plane ——
    const baseHw = 0.95;
    const baseHh = 0.68;
    const sx = Math.max(0.05, scaleX);
    const sy = Math.max(0.05, scaleY);
    const hw = baseHw * sx;
    const hh = baseHh * sy;
    const fw = Math.max(1, frameWidth);
    const fh = Math.max(1, frameHeight);
    // Map pixel offsets onto the fixed screen half-extents.
    const lx = (offsetX / fw) * gridHalfW * 2;
    const ly = -(offsetY / fh) * gridHalfH * 2;

    const localCorners: Vec3[] = [
      [-hw + lx, -hh + ly, 0],
      [hw + lx, -hh + ly, 0],
      [hw + lx, hh + ly, 0],
      [-hw + lx, hh + ly, 0],
    ];
    const worldCorners = localCorners.map(applyPlane);
    const screenCorners = worldCorners.map(proj);

    const e1 = [
      worldCorners[1]![0] - worldCorners[0]![0],
      worldCorners[1]![1] - worldCorners[0]![1],
      worldCorners[1]![2] - worldCorners[0]![2],
    ] as Vec3;
    const e2 = [
      worldCorners[3]![0] - worldCorners[0]![0],
      worldCorners[3]![1] - worldCorners[0]![1],
      worldCorners[3]![2] - worldCorners[0]![2],
    ] as Vec3;
    const n = normalize(cross(e1, e2));
    // Camera looks along +Z toward XY; |n[2]| is how face-on the plane is.
    const facing = Math.max(0.35, Math.abs(n[2]));

    ctx.beginPath();
    ctx.moveTo(screenCorners[0]![0], screenCorners[0]![1]);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(screenCorners[i]![0], screenCorners[i]![1]);
    }
    ctx.closePath();

    const planeGrad = ctx.createLinearGradient(
      screenCorners[0]![0],
      screenCorners[0]![1],
      screenCorners[2]![0],
      screenCorners[2]![1],
    );
    const a = 0.32 + facing * 0.28;
    planeGrad.addColorStop(0, `rgba(220, 64, 72, ${a})`);
    planeGrad.addColorStop(1, `rgba(190, 36, 48, ${a + 0.06})`);
    ctx.fillStyle = planeGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(170, 28, 40, 0.92)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(screenCorners[0]![0], screenCorners[0]![1]);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(screenCorners[i]![0], screenCorners[i]![1]);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 190, 190, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const origin = proj(applyPlane([lx, ly, 0]));
    const uTip = proj(applyPlane([lx + Math.min(1.05, hw * 0.85), ly, 0]));
    const vTip = proj(applyPlane([lx, ly + Math.min(0.82, hh * 0.85), 0]));

    const drawArrow = (
      from: [number, number, number],
      to: [number, number, number],
      fill: string,
      stroke: string,
    ) => {
      const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
      const ah = 9;
      const aw = 0.42;

      ctx.lineCap = "round";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(to[0], to[1]);
      ctx.lineTo(
        to[0] - ah * Math.cos(ang - aw),
        to[1] - ah * Math.sin(ang - aw),
      );
      ctx.lineTo(
        to[0] - ah * Math.cos(ang + aw),
        to[1] - ah * Math.sin(ang + aw),
      );
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    };

    const uDepth = avgDepth([origin, uTip]);
    const vDepth = avgDepth([origin, vTip]);
    if (uDepth > vDepth) {
      drawArrow(origin, uTip, "#2fbf5f", "rgba(255,255,255,0.85)");
      drawArrow(origin, vTip, "#6b5cff", "rgba(255,255,255,0.85)");
    } else {
      drawArrow(origin, vTip, "#6b5cff", "rgba(255,255,255,0.85)");
      drawArrow(origin, uTip, "#2fbf5f", "rgba(255,255,255,0.85)");
    }

    ctx.beginPath();
    ctx.arc(origin[0], origin[1], 3.8, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1d24";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const label = (text: string, x: number, y: number, color: string) => {
      ctx.font =
        "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };

    label("vector u", uTip[0] + 8, uTip[1], "#1f8f45");
    label("vector v", vTip[0] + 8, vTip[1], "#4f3fd4");

    let topRight = screenCorners[0]!;
    for (const p of screenCorners) {
      if (p[0] - p[1] > topRight[0] - topRight[1]) topRight = p;
    }
    label("plane R", topRight[0] + 8, topRight[1] - 4, "#b01e2c");
  }, [
    rotateX,
    rotateY,
    rotateZ,
    offsetX,
    offsetY,
    scaleX,
    scaleY,
    frameWidth,
    frameHeight,
  ]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      rx: rotateX,
      ry: rotateY,
    };
    onDragStart?.();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || disabled) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const nextY = Math.min(180, Math.max(-180, drag.ry + dx * 0.45));
    const nextX = Math.min(180, Math.max(-180, drag.rx - dy * 0.45));
    onRotate(nextX, nextY);
  };

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onDragEnd?.();
  };

  return (
    <canvas
      ref={canvasRef}
      className={
        disabled
          ? "plane3d-widget plane3d-widget--disabled"
          : "plane3d-widget"
      }
      aria-label="3D plane orientation relative to 2D frame"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
