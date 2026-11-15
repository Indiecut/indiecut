import { useEffect, useMemo, useRef, useState } from "react";
import { clampFadeMs, effectiveAudioMix } from "../audio/audioMix";
import type { PeaksDocument } from "../media/peaks";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { Clip, MediaAssetRef } from "../project/types";

type Props = {
  clip: Clip;
  asset: MediaAssetRef | undefined;
  projectPath: string;
  pxPerSec: number;
  visibleStartMs: number;
  visibleEndMs: number;
};

const peaksCache = new Map<string, PeaksDocument>();

async function loadPeaks(
  projectPath: string,
  peaksPath: string,
): Promise<PeaksDocument | null> {
  const key = `${projectPath}::${peaksPath}`;
  const cached = peaksCache.get(key);
  if (cached) return cached;
  if (!window.indiecut) return null;
  const abs = resolveMediaAbsolutePath({ projectPath, storedPath: peaksPath });
  const bytes = await window.indiecut.fs.readFile(abs);
  const text = new TextDecoder().decode(bytes);
  const doc = JSON.parse(text) as PeaksDocument;
  if (!doc || !Array.isArray(doc.peaks) || typeof doc.peaksPerSecond !== "number") {
    return null;
  }
  peaksCache.set(key, doc);
  return doc;
}

/**
 * Canvas waveform for audio clips — samples precomputed peaks for the
 * visible portion of [inMs, outMs].
 */
export function WaveformClip({
  clip,
  asset,
  projectPath,
  pxPerSec,
  visibleStartMs,
  visibleEndMs,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<PeaksDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = asset?.peaksPath;
    if (!projectPath || !path) {
      setPeaks(null);
      return;
    }
    void loadPeaks(projectPath, path)
      .then((doc) => {
        if (!cancelled) setPeaks(doc);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, asset?.peaksPath]);

  const widthPx = useMemo(() => {
    const span = Math.max(0, visibleEndMs - visibleStartMs);
    return Math.max(1, Math.ceil((span / 1000) * pxPerSec));
  }, [visibleStartMs, visibleEndMs, pxPerSec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const height = 28;
    canvas.width = Math.max(1, Math.floor(widthPx * dpr));
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthPx, height);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, height / 2 - 0.5, widthPx, 1);

    if (!peaks || peaks.peaks.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(asset?.name ?? "Audio", 6, height / 2 + 3);
      return;
    }

    const pps = Math.max(1, peaks.peaksPerSecond);
    const mid = height / 2;
    const amp = height * 0.42;
    const mix = effectiveAudioMix(clip);
    const { fadeInMs, fadeOutMs } = clampFadeMs(
      clip.durationMs,
      mix.fadeInMs,
      mix.fadeOutMs,
    );

    // One vertical bar per canvas pixel column.
    for (let x = 0; x < widthPx; x++) {
      const localMs = visibleStartMs + (x / pxPerSec) * 1000;
      const sourceMs = clip.inMs + localMs;
      const peakIdx = Math.min(
        peaks.peaks.length - 1,
        Math.max(0, Math.floor((sourceMs / 1000) * pps)),
      );
      let mag = Math.min(1, Math.abs(peaks.peaks[peakIdx] ?? 0));
      // Fade ramps: taper amplitude at ends.
      if (fadeInMs > 0 && localMs < fadeInMs) {
        mag *= localMs / fadeInMs;
      }
      if (fadeOutMs > 0 && localMs > clip.durationMs - fadeOutMs) {
        const into = localMs - (clip.durationMs - fadeOutMs);
        mag *= Math.max(0, 1 - into / fadeOutMs);
      }
      const h = Math.max(1, mag * amp);
      ctx.fillStyle = "rgba(230, 240, 255, 0.85)";
      ctx.fillRect(x, mid - h, 1, h * 2);
    }

    // Diagonal fade affordance overlays
    if (fadeInMs > 0) {
      const w = Math.min(widthPx, (fadeInMs / 1000) * pxPerSec);
      const startX = ((0 - visibleStartMs) / 1000) * pxPerSec;
      if (w > 0 && startX < widthPx) {
        ctx.beginPath();
        ctx.moveTo(startX, height);
        ctx.lineTo(startX + w, 0);
        ctx.lineTo(startX + w, height);
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fill();
      }
    }
    if (fadeOutMs > 0) {
      const w = Math.min(widthPx, (fadeOutMs / 1000) * pxPerSec);
      const endLocal = clip.durationMs;
      const endX = ((endLocal - visibleStartMs) / 1000) * pxPerSec;
      const startFadeX = endX - w;
      if (w > 0 && endX > 0) {
        ctx.beginPath();
        ctx.moveTo(startFadeX, 0);
        ctx.lineTo(endX, height);
        ctx.lineTo(startFadeX, height);
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fill();
      }
    }
  }, [
    peaks,
    widthPx,
    pxPerSec,
    visibleStartMs,
    clip.inMs,
    clip.durationMs,
    clip.audio,
    asset?.name,
  ]);

  const offsetPx = (visibleStartMs / 1000) * pxPerSec;

  return (
    <div className="timeline-panel__waveform" style={{ marginLeft: offsetPx }}>
      <canvas ref={canvasRef} aria-hidden />
      <span className="timeline-panel__clip-label timeline-panel__clip-label--overlay">
        {asset?.name ?? "Audio"}
      </span>
    </div>
  );
}
