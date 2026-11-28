import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  evaluateClipMask,
  evaluateClipTransform,
  maskAnimatablePath,
  maskPointLeaf,
  setAnimatableValue,
  type MaskAnimatableLeaf,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { Clip, ResolvedClipMask } from "../project/types";
import { findClip, useEditorStore } from "../store/editorStore";
import "./PreviewMaskOverlay.css";

type DragKind =
  | "move"
  | "rotate"
  | "gap"
  | "scale"
  | "feather"
  | "cornerRadius"
  | "vertex";

type DragState = {
  kind: DragKind;
  startClientX: number;
  startClientY: number;
  before: ResolvedClipMask;
  startAngle?: number;
  vertexIndex?: number;
};

type Props = {
  stageRef: React.RefObject<HTMLDivElement | null>;
};

function MoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4h6M12 2v6M4 9v6M2 12h6M15 20H9M12 22v-6M20 15V9M22 12h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M19.5 12a7.5 7.5 0 0 0-12.4-5.66"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 3.8v3.6h3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function rotatePoint(
  x: number,
  y: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * On-canvas mask gizmos for video/image clips (white handles).
 */
export function PreviewMaskOverlay({ stageRef }: Props) {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const activeMaskId = useEditorStore((s) => s.activeMaskId);
  const maskInspectorOpen = useEditorStore((s) => s.maskInspectorOpen);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const tracks = useEditorStore((s) => s.project.tracks);
  const layoutW = useEditorStore((s) => s.project.width);
  const layoutH = useEditorStore((s) => s.project.height);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const fps = useEditorStore((s) => s.project.fps);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragState | null>(null);
  const tracksBeforeRef = useRef(tracks);

  const selected = selectedClipId
    ? findClip(tracks, selectedClipId)
    : null;

  const overlayClip =
    selected &&
    (selected.clip.kind === "video" || selected.clip.kind === "image") &&
    selected.clip.masksEnabled &&
    (selected.clip.masks?.length ?? 0) > 0 &&
    maskInspectorOpen &&
    !selected.track.locked &&
    !selected.track.hidden &&
    !isPlaying &&
    clipLocalMs(playheadMs, selected.clip) !== null
      ? selected.clip
      : null;

  const storedMask = useMemo(() => {
    if (!overlayClip?.masks?.length) return null;
    const found = overlayClip.masks.find((m) => m.id === activeMaskId);
    return found ?? overlayClip.masks[0]!;
  }, [overlayClip, activeMaskId]);

  const mask: ResolvedClipMask | null = useMemo(() => {
    if (!overlayClip || !storedMask) return null;
    const local = clipLocalMs(playheadMs, overlayClip);
    if (local === null) return null;
    return evaluateClipMask(storedMask, local);
  }, [overlayClip, storedMask, playheadMs]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setStageSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(stage);
    const rect = stage.getBoundingClientRect();
    setStageSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, [stageRef]);

  const geometry = useMemo(() => {
    if (!overlayClip || !mask || stageSize.w < 2 || stageSize.h < 2) {
      return null;
    }
    const local = clipLocalMs(playheadMs, overlayClip);
    if (local === null) return null;
    const t = evaluateClipTransform(overlayClip, local);
    const sx = stageSize.w / Math.max(1, layoutW);
    const sy = stageSize.h / Math.max(1, layoutH);
    const scaleX = t.uniformScale !== false ? t.scaleX : t.scaleX;
    const scaleY = t.uniformScale !== false ? t.scaleX : t.scaleY;

    // Mask rides with clip: center = clip center + rotated/scaled mask position
    const localPos = rotatePoint(
      mask.position.x * scaleX,
      mask.position.y * scaleY,
      t.rotation,
    );
    const centerX = stageSize.w / 2 + t.x * sx + localPos.x * sx;
    const centerY = stageSize.h / 2 + t.y * sy + localPos.y * sy;
    const rotation = t.rotation + mask.rotationDeg;

    const sizeW = (mask.size?.w ?? 400) * scaleX * sx;
    const sizeH = (mask.size?.h ?? 400) * scaleY * sy;
    const gap = (mask.stripGap ?? layoutH * 0.3) * scaleY * sy;

    return {
      centerX,
      centerY,
      rotation,
      sizeW,
      sizeH,
      gap,
      scaleX,
      scaleY,
      sx,
      sy,
      clipRotation: t.rotation,
      transform: t,
      localMs: local,
    };
  }, [overlayClip, mask, stageSize, layoutW, layoutH, playheadMs]);

  const writeMaskLeaf = useCallback(
    (
      clip: Clip,
      maskId: string,
      leaf: MaskAnimatableLeaf,
      value: number,
      localMs: number,
    ) => {
      const patch = setAnimatableValue(
        clip,
        maskAnimatablePath(maskId, leaf),
        value,
        localMs,
        fps,
      );
      patchClipLive(clip.id, patch);
    },
    [fps, patchClipLive],
  );

  const beginGesture = useCallback(() => {
    tracksBeforeRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
  }, []);

  const endGesture = useCallback(() => {
    if (!dragRef.current) return;
    const before = tracksBeforeRef.current;
    const after = useEditorStore.getState().project.tracks;
    commitTracksTransition(before, after, "Mask");
    dragRef.current = null;
  }, [commitTracksTransition]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !overlayClip || !mask || !geometry) return;
      const { sx, sy, scaleX, scaleY, clipRotation, localMs } = geometry;
      const mid = mask.id;

      if (drag.kind === "move") {
        const dxScreen = e.clientX - drag.startClientX;
        const dyScreen = e.clientY - drag.startClientY;
        const dxLayout = dxScreen / sx / Math.max(1e-6, scaleX);
        const dyLayout = dyScreen / sy / Math.max(1e-6, scaleY);
        const local = rotatePoint(dxLayout, dyLayout, -clipRotation);
        writeMaskLeaf(
          overlayClip,
          mid,
          "position.x",
          drag.before.position.x + local.x,
          localMs,
        );
        const latest = findClip(
          useEditorStore.getState().project.tracks,
          overlayClip.id,
        )?.clip;
        if (latest) {
          writeMaskLeaf(
            latest,
            mid,
            "position.y",
            drag.before.position.y + local.y,
            localMs,
          );
        }
        return;
      }

      if (drag.kind === "rotate") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const ax = Math.atan2(
          e.clientY - (rect.top + geometry.centerY),
          e.clientX - (rect.left + geometry.centerX),
        );
        const start = drag.startAngle ?? ax;
        const deltaDeg = ((ax - start) * 180) / Math.PI;
        writeMaskLeaf(
          overlayClip,
          mid,
          "rotationDeg",
          drag.before.rotationDeg + deltaDeg,
          localMs,
        );
        return;
      }

      if (drag.kind === "gap") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - (rect.left + geometry.centerX);
        const my = e.clientY - (rect.top + geometry.centerY);
        const local = rotatePoint(mx, my, -geometry.rotation);
        if (mask.type === "split") {
          const dxScreen = e.clientX - drag.startClientX;
          const dyScreen = e.clientY - drag.startClientY;
          const dxLayout = dxScreen / sx / Math.max(1e-6, scaleX);
          const dyLayout = dyScreen / sy / Math.max(1e-6, scaleY);
          const localDelta = rotatePoint(dxLayout, dyLayout, -clipRotation);
          writeMaskLeaf(
            overlayClip,
            mid,
            "position.x",
            drag.before.position.x + localDelta.x,
            localMs,
          );
          const latest = findClip(
            useEditorStore.getState().project.tracks,
            overlayClip.id,
          )?.clip;
          if (latest) {
            writeMaskLeaf(
              latest,
              mid,
              "position.y",
              drag.before.position.y + localDelta.y,
              localMs,
            );
          }
        } else {
          const gap = Math.max(
            2,
            (Math.abs(local.y) * 2) / sy / Math.max(1e-6, scaleY),
          );
          writeMaskLeaf(overlayClip, mid, "stripGap", gap, localMs);
        }
        return;
      }

      if (drag.kind === "scale") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - (rect.left + geometry.centerX);
        const my = e.clientY - (rect.top + geometry.centerY);
        const local = rotatePoint(mx, my, -geometry.rotation);
        const w = Math.max(
          8,
          (Math.abs(local.x) * 2) / sx / Math.max(1e-6, scaleX),
        );
        const h = Math.max(
          8,
          (Math.abs(local.y) * 2) / sy / Math.max(1e-6, scaleY),
        );
        writeMaskLeaf(overlayClip, mid, "size.w", w, localMs);
        const latest = findClip(
          useEditorStore.getState().project.tracks,
          overlayClip.id,
        )?.clip;
        if (latest) {
          writeMaskLeaf(latest, mid, "size.h", h, localMs);
        }
        return;
      }

      if (drag.kind === "feather") {
        const dy = e.clientY - drag.startClientY;
        const feather = Math.min(
          100,
          Math.max(0, drag.before.feather - dy * 0.25),
        );
        writeMaskLeaf(overlayClip, mid, "feather", feather, localMs);
        return;
      }

      if (drag.kind === "cornerRadius") {
        const dx = e.clientX - drag.startClientX;
        const cornerRadius = Math.min(
          100,
          Math.max(0, (drag.before.cornerRadius ?? 0) + dx * 0.25),
        );
        writeMaskLeaf(overlayClip, mid, "cornerRadius", cornerRadius, localMs);
        return;
      }

      if (drag.kind === "vertex" && drag.vertexIndex != null) {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - (rect.left + geometry.centerX);
        const my = e.clientY - (rect.top + geometry.centerY);
        const local = rotatePoint(mx, my, -geometry.rotation);
        const sizeWLayout = Math.max(1e-6, drag.before.size?.w ?? 400);
        const sizeHLayout = Math.max(1e-6, drag.before.size?.h ?? 400);
        // Screen local → normalized ±0.5 (half size in layout, then / size)
        const nx =
          local.x / sx / Math.max(1e-6, scaleX) / (sizeWLayout / 2);
        const ny =
          local.y / sy / Math.max(1e-6, scaleY) / (sizeHLayout / 2);
        const idx = drag.vertexIndex;
        writeMaskLeaf(overlayClip, mid, maskPointLeaf(idx, "x"), nx, localMs);
        const latest = findClip(
          useEditorStore.getState().project.tracks,
          overlayClip.id,
        )?.clip;
        if (latest) {
          writeMaskLeaf(latest, mid, maskPointLeaf(idx, "y"), ny, localMs);
        }
      }
    },
    [geometry, mask, overlayClip, stageRef, writeMaskLeaf],
  );

  useEffect(() => {
    const onUp = () => endGesture();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endGesture, onPointerMove]);

  const startDrag = (
    kind: DragKind,
    e: ReactPointerEvent,
    extra?: Partial<DragState>,
  ) => {
    if (!mask) return;
    e.preventDefault();
    e.stopPropagation();
    beginGesture();
    const rect = stageRef.current?.getBoundingClientRect();
    let startAngle: number | undefined;
    if (kind === "rotate" && rect && geometry) {
      startAngle = Math.atan2(
        e.clientY - (rect.top + geometry.centerY),
        e.clientX - (rect.left + geometry.centerX),
      );
    }
    dragRef.current = {
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      before: {
        ...mask,
        position: { ...mask.position },
        size: mask.size ? { ...mask.size } : undefined,
      },
      startAngle,
      ...extra,
    };
  };

  if (!overlayClip || !mask || !geometry) return null;

  const { centerX, centerY, rotation, sizeW, sizeH, gap } = geometry;
  const isStrip = mask.type === "filmstrip" || mask.type === "split";
  const isClosed =
    mask.type === "circle" ||
    mask.type === "rectangle" ||
    mask.type === "stars" ||
    mask.type === "heart" ||
    mask.type === "text" ||
    mask.type === "custom";
  const isCustom = mask.type === "custom" && (mask.points?.length ?? 0) >= 3;

  const halfGap = (mask.type === "filmstrip" ? gap : 40) / 2;
  const lineLen = Math.max(stageSize.w, stageSize.h) * 1.5;

  const movePos = rotatePoint(-halfGap - 36, -halfGap - 8, rotation);
  const rotPos = rotatePoint(halfGap + 36, halfGap + 8, rotation);
  const pillA = rotatePoint(0, -halfGap, rotation);
  const pillB = rotatePoint(0, halfGap, rotation);

  return (
    <div className="preview-mask" aria-hidden>
      <div
        className="preview-mask__layer"
        style={{
          transform: `translate(${centerX}px, ${centerY}px) rotate(${rotation}deg)`,
          transformOrigin: "0 0",
        }}
      >
        {isStrip && (
          <svg
            width={lineLen}
            height={lineLen}
            style={{
              position: "absolute",
              left: -lineLen / 2,
              top: -lineLen / 2,
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <line
              x1={0}
              y1={lineLen / 2 - (mask.type === "filmstrip" ? halfGap : 0)}
              x2={lineLen}
              y2={lineLen / 2 - (mask.type === "filmstrip" ? halfGap : 0)}
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="1.5"
            />
            {mask.type === "filmstrip" && (
              <line
                x1={0}
                y1={lineLen / 2 + halfGap}
                x2={lineLen}
                y2={lineLen / 2 + halfGap}
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="1.5"
              />
            )}
          </svg>
        )}

        {isClosed && !isCustom && (
          <div
            style={{
              position: "absolute",
              left: -sizeW / 2,
              top: -sizeH / 2,
              width: sizeW,
              height: sizeH,
              border: "1.5px solid rgba(255,255,255,0.95)",
              borderRadius:
                mask.type === "circle"
                  ? "50%"
                  : `${((mask.cornerRadius ?? 0) / 100) * Math.min(sizeW, sizeH) * 0.5}px`,
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          />
        )}

        {isCustom && mask.points && (
          <svg
            width={sizeW}
            height={sizeH}
            style={{
              position: "absolute",
              left: -sizeW / 2,
              top: -sizeH / 2,
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <polygon
              points={mask.points
                .map(
                  (p) =>
                    `${sizeW / 2 + p.x * (sizeW / 2)},${sizeH / 2 + p.y * (sizeH / 2)}`,
                )
                .join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>

      {/* Handles in stage space (not nested in rotated layer for simpler hit testing) */}
      <button
        type="button"
        className="preview-mask__handle"
        style={{
          left: centerX + movePos.x,
          top: centerY + movePos.y,
        }}
        title="Move mask"
        aria-label="Move mask"
        onPointerDown={(e) => startDrag("move", e)}
      >
        <MoveIcon />
      </button>

      <button
        type="button"
        className="preview-mask__handle"
        style={{
          left: centerX + rotPos.x,
          top: centerY + rotPos.y,
        }}
        title="Rotate mask"
        aria-label="Rotate mask"
        onPointerDown={(e) => startDrag("rotate", e)}
      >
        <RotateIcon />
      </button>

      {mask.type === "filmstrip" && (
        <>
          <button
            type="button"
            className="preview-mask__pill"
            style={{ left: centerX + pillA.x, top: centerY + pillA.y }}
            title="Adjust strip"
            aria-label="Adjust strip gap"
            onPointerDown={(e) => startDrag("gap", e)}
          />
          <button
            type="button"
            className="preview-mask__pill"
            style={{ left: centerX + pillB.x, top: centerY + pillB.y }}
            title="Adjust strip"
            aria-label="Adjust strip gap"
            onPointerDown={(e) => startDrag("gap", e)}
          />
        </>
      )}

      {mask.type === "split" && (
        <button
          type="button"
          className="preview-mask__pill"
          style={{ left: centerX + pillA.x, top: centerY + pillA.y }}
          title="Adjust split"
          aria-label="Adjust split"
          onPointerDown={(e) => startDrag("gap", e)}
        />
      )}

      {isClosed && !isCustom && (
        <>
          {(
            [
              [-sizeW / 2, -sizeH / 2],
              [sizeW / 2, -sizeH / 2],
              [-sizeW / 2, sizeH / 2],
              [sizeW / 2, sizeH / 2],
            ] as const
          ).map(([lx, ly], i) => {
            const p = rotatePoint(lx, ly, rotation);
            return (
              <button
                key={i}
                type="button"
                className="preview-mask__corner"
                style={{ left: centerX + p.x, top: centerY + p.y }}
                title="Scale mask"
                aria-label="Scale mask"
                onPointerDown={(e) => startDrag("scale", e)}
              />
            );
          })}
        </>
      )}

      {isCustom &&
        mask.points!.map((pt, i) => {
          const lx = pt.x * (sizeW / 2);
          const ly = pt.y * (sizeH / 2);
          const p = rotatePoint(lx, ly, rotation);
          return (
            <button
              key={`v-${i}`}
              type="button"
              className="preview-mask__corner"
              style={{ left: centerX + p.x, top: centerY + p.y }}
              title={`Move point ${i + 1}`}
              aria-label={`Move point ${i + 1}`}
              onPointerDown={(e) =>
                startDrag("vertex", e, { vertexIndex: i })
              }
            />
          );
        })}

      {isCustom && (
        <>
          {(
            [
              [-sizeW / 2, -sizeH / 2],
              [sizeW / 2, sizeH / 2],
            ] as const
          ).map(([lx, ly], i) => {
            const p = rotatePoint(lx, ly, rotation);
            return (
              <button
                key={`scale-${i}`}
                type="button"
                className="preview-mask__pill"
                style={{ left: centerX + p.x, top: centerY + p.y }}
                title="Scale mask"
                aria-label="Scale mask"
                onPointerDown={(e) => startDrag("scale", e)}
              />
            );
          })}
        </>
      )}

      {(mask.type === "rectangle" || mask.type === "stars") && (
        <button
          type="button"
          className="preview-mask__feather"
          style={{
            left:
              centerX +
              rotatePoint(sizeW / 2 - 18, -sizeH / 2 + 18, rotation).x,
            top:
              centerY +
              rotatePoint(sizeW / 2 - 18, -sizeH / 2 + 18, rotation).y,
          }}
          title="Round corners"
          aria-label="Round corners"
          onPointerDown={(e) => startDrag("cornerRadius", e)}
        >
          ⌝
        </button>
      )}

      <button
        type="button"
        className="preview-mask__feather"
        style={{
          left:
            centerX +
            rotatePoint(0, (isStrip ? halfGap : sizeH / 2) + 28, rotation).x,
          top:
            centerY +
            rotatePoint(0, (isStrip ? halfGap : sizeH / 2) + 28, rotation).y,
        }}
        title="Feather"
        aria-label="Feather"
        onPointerDown={(e) => startDrag("feather", e)}
      >
        ⇄
      </button>
    </div>
  );
}
