import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { layoutPointToSourceUV } from "../compositor/removeBgSample";
import { evaluateClipTransform } from "../engine/animatable";
import { sourceMsAtLocal } from "../engine/speedRemap";
import { clipLocalMs } from "../engine/time";
import { createDefaultRemoveBg } from "../project/removeBgDefaults";
import { findClip, useEditorStore } from "../store/editorStore";
import { samplePreviewSourcePixel } from "./previewWorkerClient";
import "./PreviewRemoveBgEyedropper.css";

type Props = {
  stageRef: RefObject<HTMLDivElement | null>;
};

/**
 * Click-to-sample overlay while Remove BG eyedropper is active.
 * Samples decoded source frame (pre-adjust / pre-mask).
 */
export function PreviewRemoveBgEyedropper({ stageRef }: Props) {
  const clipId = useEditorStore((s) => s.removeBgEyedropperClipId);
  const setRemoveBgEyedropperClipId = useEditorStore(
    (s) => s.setRemoveBgEyedropperClipId,
  );
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const tracks = useEditorStore((s) => s.project.tracks);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const layoutW = useEditorStore((s) => s.project.width);
  const layoutH = useEditorStore((s) => s.project.height);
  const fps = useEditorStore((s) => s.project.fps);
  const previewFitMode = useEditorStore((s) => s.previewFitMode);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const [busy, setBusy] = useState(false);

  const selected = clipId ? findClip(tracks, clipId) : null;
  const active =
    selected &&
    (selected.clip.kind === "video" || selected.clip.kind === "image") &&
    selected.clip.mediaId &&
    selected.clip.removeBg?.enabled &&
    !selected.track.locked
      ? selected
      : null;

  useEffect(() => {
    if (!clipId) return;
    if (!active) setRemoveBgEyedropperClipId(null);
  }, [clipId, active, setRemoveBgEyedropperClipId]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRemoveBgEyedropperClipId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setRemoveBgEyedropperClipId]);

  const onPointerDown = useCallback(
    async (e: ReactPointerEvent) => {
      if (!active || busy) return;
      e.preventDefault();
      e.stopPropagation();

      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const sx = layoutW / rect.width;
      const sy = layoutH / rect.height;
      const layoutX = (e.clientX - rect.left) * sx;
      const layoutY = (e.clientY - rect.top) * sy;

      const clip = active.clip;
      const media = mediaIndex.find((m) => m.id === clip.mediaId);
      const srcW =
        media?.width && media.width > 0 ? media.width : layoutW;
      const srcH =
        media?.height && media.height > 0 ? media.height : layoutH;

      const local = clipLocalMs(playheadMs, clip);
      if (local === null) return;
      const transform = evaluateClipTransform(clip, local);
      const fit = previewFitMode === "full" ? "cover" : "contain";
      const uv = layoutPointToSourceUV({
        layoutX,
        layoutY,
        layoutW,
        layoutH,
        srcW,
        srcH,
        fit,
        transform,
        crop: clip.crop,
      });
      if (!uv || !clip.mediaId) return;

      const sourceMs = sourceMsAtLocal(clip, local, fps);

      setBusy(true);
      try {
        const rgb = await samplePreviewSourcePixel({
          assetId: clip.mediaId,
          sourceMs,
          u: uv.u,
          v: uv.v,
        });
        const before = structuredClone(
          useEditorStore.getState().project.tracks,
        );
        const base = clip.removeBg ?? createDefaultRemoveBg();
        patchClipLive(clip.id, {
          removeBg: {
            ...base,
            enabled: true,
            color: {
              ...base.color,
              keyColor: [rgb.r, rgb.g, rgb.b],
            },
          },
        });
        const after = useEditorStore.getState().project.tracks;
        commitTracksTransition(before, after, "Remove BG");
        setRemoveBgEyedropperClipId(null);
      } catch (err) {
        console.warn("Remove BG eyedropper sample failed", err);
      } finally {
        setBusy(false);
      }
    },
    [
      active,
      busy,
      stageRef,
      layoutW,
      layoutH,
      mediaIndex,
      playheadMs,
      previewFitMode,
      fps,
      patchClipLive,
      commitTracksTransition,
      setRemoveBgEyedropperClipId,
    ],
  );

  if (!active) return null;

  return (
    <div
      className="preview-remove-bg-eyedropper"
      onPointerDown={(e) => void onPointerDown(e)}
      role="presentation"
      title="Click to sample key color · Esc to cancel"
    />
  );
}
