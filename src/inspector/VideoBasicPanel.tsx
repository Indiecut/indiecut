import { useEffect, useMemo, useState } from "react";
import {
  BLEND_MODE_LABELS,
  VIDEO_BLEND_MODES,
} from "../compositor/blend";
import { effectiveSourceSize } from "../compositor/crop";
import {
  alignmentOffsets,
  computeFittedRect,
  type AlignH,
  type AlignV,
} from "../compositor/transform";
import {
  evaluateClipOpacity,
  evaluateClipTransform,
  patchClipTransformValues,
  staticAnimatable,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import {
  IconAlignBottom,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignMiddle,
  IconAlignRight,
  IconAlignTop,
  IconChevronDown,
  IconCrop,
  IconLink,
} from "../icons/Icons";
import { extractAudioFromVideoClip } from "../media/extractAudio";
import type {
  BlendMode,
  Clip,
  MediaAssetRef,
  Track,
} from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { AdjustPanel } from "./AdjustPanel";
import { Clip3DPanel } from "./Clip3DPanel";
import { VideoFilterSection } from "./FxPanels";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { SpeedPanel } from "./SpeedPanel";
import { TransformFields } from "./TransformFields";
import { useClipGestureEdit } from "./useClipGestureEdit";
import { VideoMaskPanel } from "./VideoMaskPanel";
import { VideoRemoveBgPanel } from "./VideoRemoveBgPanel";

type InspectorTab = "Video" | "Speed" | "Adjust" | "3D";
type VideoSubtab = "Primary" | "Remove BG" | "Mask";

type Props = {
  clip: Clip;
  track: Track;
  media: MediaAssetRef | null;
  frameWidth: number;
  frameHeight: number;
  fit: "contain" | "cover";
};

export function VideoBasicPanel({
  clip,
  track,
  media,
  frameWidth,
  frameHeight,
  fit,
}: Props) {
  const [tab, setTab] = useState<InspectorTab>("Video");
  const [subtab, setSubtab] = useState<VideoSubtab>("Primary");
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const localMs = clipLocalMs(playheadMs, clip);
  const transform =
    localMs !== null
      ? evaluateClipTransform(clip, localMs)
      : evaluateClipTransform(clip, 0);
  const blendMode = (clip.blendMode ?? "normal") as BlendMode;
  const opacity =
    localMs !== null
      ? evaluateClipOpacity(clip, localMs)
      : evaluateClipOpacity(clip, 0);
  const [blendUiOn, setBlendUiOn] = useState(
    () => blendMode !== "normal" || opacity < 1 - 1e-4,
  );
  const [blendBodyOpen, setBlendBodyOpen] = useState(true);
  const canExtract =
    clip.kind === "video" &&
    media?.kind === "video" &&
    media.hasAudio !== false &&
    !clip.muteAudio;

  const gesture = useClipGestureEdit(clip.id, "Transform");

  useEffect(() => {
    const local = clipLocalMs(
      useEditorStore.getState().project.playheadMs,
      clip,
    );
    const op =
      local !== null
        ? evaluateClipOpacity(clip, local)
        : evaluateClipOpacity(clip, 0);
    const next =
      (clip.blendMode ?? "normal") !== "normal" || op < 1 - 1e-4;
    setBlendUiOn(next);
    if (next) setBlendBodyOpen(true);
  }, [clip.id]);

  const runExtract = async () => {
    if (locked || extractBusy) return;
    setExtractBusy(true);
    setExtractError(null);
    try {
      await extractAudioFromVideoClip(clip.id);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtractBusy(false);
    }
  };

  const setCropDialogOpen = useEditorStore((s) => s.setCropDialogOpen);

  const fitted = useMemo(() => {
    const rawW = media?.width && media.width > 0 ? media.width : frameWidth;
    const rawH = media?.height && media.height > 0 ? media.height : frameHeight;
    const eff = effectiveSourceSize(rawW, rawH, clip.crop);
    return computeFittedRect(
      eff.width,
      eff.height,
      frameWidth,
      frameHeight,
      fit,
    );
  }, [
    media?.width,
    media?.height,
    frameWidth,
    frameHeight,
    fit,
    clip.crop,
  ]);

  const setAlign = (h?: AlignH, v?: AlignV) => {
    if (!fitted || locked || localMs === null) return;
    const { x, y } = alignmentOffsets(
      fitted,
      transform,
      frameWidth,
      frameHeight,
      h,
      v,
    );
    gesture.commit(
      patchClipTransformValues(clip, { x, y }, localMs, fps),
      "Align",
    );
  };

  return (
    <div className="inspector-video">
      <div className="inspector-video__tabs" role="tablist">
        {(["Video", "Speed", "Adjust", "3D"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={
              tab === name
                ? "inspector-video__tab inspector-video__tab--active"
                : "inspector-video__tab"
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Speed" ? (
        <div className="inspector-video__body">
          <SpeedPanel clip={clip} locked={locked} />
        </div>
      ) : tab === "Adjust" ? (
        <div className="inspector-video__body">
          <AdjustPanel clip={clip} locked={locked} />
        </div>
      ) : tab === "3D" ? (
        <div className="inspector-video__body">
          <Clip3DPanel clip={clip} track={track} />
        </div>
      ) : (
        <>
          <div className="inspector-video__subtabs" role="tablist">
            {(["Primary", "Remove BG", "Mask"] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={subtab === name}
                className={
                  subtab === name
                    ? "inspector-video__subtab inspector-video__subtab--active"
                    : "inspector-video__subtab"
                }
                onClick={() => setSubtab(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="inspector-video__body">
          {subtab === "Remove BG" ? (
            <VideoRemoveBgPanel clip={clip} track={track} />
          ) : subtab === "Mask" ? (
            <VideoMaskPanel
              clip={clip}
              track={track}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
            />
          ) : (
          <>
          <TransformFields clip={clip} locked={locked} maxScalePercent={400} />

          <section className="inspector-section inspector-blend">
            <div className="inspector-blend__head">
              <label className="inspector-blend__enable">
                <input
                  type="checkbox"
                  className="inspector-switch"
                  disabled={locked}
                  checked={blendUiOn}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setBlendUiOn(on);
                    if (on) {
                      setBlendBodyOpen(true);
                    } else {
                      gesture.commit(
                        { blendMode: "normal", opacity: staticAnimatable(1) },
                        "Blend",
                      );
                    }
                  }}
                />
                <span>Blend</span>
              </label>
              <button
                type="button"
                className="inspector-blend__chevron-btn"
                disabled={!blendUiOn}
                aria-expanded={blendUiOn && blendBodyOpen}
                aria-label={blendBodyOpen ? "Collapse blend" : "Expand blend"}
                onClick={() => setBlendBodyOpen((v) => !v)}
              >
                <IconChevronDown
                  size={14}
                  className={
                    blendUiOn && blendBodyOpen
                      ? "inspector-blend__chevron"
                      : "inspector-blend__chevron inspector-blend__chevron--closed"
                  }
                />
              </button>
            </div>
            {blendUiOn && blendBodyOpen && (
              <div className="inspector-blend__body">
                <label className="inspector-field">
                  <span className="inspector-field__label">Mode</span>
                  <select
                    className="inspector-select inspector-blend__mode"
                    disabled={locked}
                    value={blendMode}
                    onChange={(e) => {
                      gesture.commit(
                        { blendMode: e.target.value as BlendMode },
                        "Blend",
                      );
                    }}
                  >
                    {VIDEO_BLEND_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {BLEND_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </label>
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path="opacity"
                  label="Opacity"
                  disabled={locked || localMs === null}
                >
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0}
                    max={100}
                    step={1}
                    disabled={locked || localMs === null}
                    value={Math.round(opacity * 100)}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) => {
                      gesture.ensureBegin();
                      setAnimatableValue(
                        clip.id,
                        "opacity",
                        Number(e.target.value) / 100,
                      );
                    }}
                  />
                  <input
                    type="number"
                    className="inspector-number"
                    disabled={locked || localMs === null}
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(opacity * 100)}
                    onFocus={gesture.begin}
                    onBlur={gesture.end}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      if (!Number.isFinite(pct)) return;
                      gesture.ensureBegin();
                      setAnimatableValue(
                        clip.id,
                        "opacity",
                        Math.min(100, Math.max(0, pct)) / 100,
                      );
                    }}
                  />
                  <span className="inspector-field__unit">%</span>
                </InspectorKeyframeRow>
              </div>
            )}
          </section>

          <VideoFilterSection clip={clip} track={track} />

          {canExtract && (
            <section className="inspector-section">
              <button
                type="button"
                className="inspector-transition__clear"
                style={{ margin: 0 }}
                disabled={locked || extractBusy}
                onClick={() => void runExtract()}
              >
                {extractBusy ? "Extracting…" : "Extract audio"}
              </button>
              <p className="inspector-panel__hint inspector-panel__hint--tight">
                Writes a new audio file to the project and places it on an audio
                track (distinct from ⌘M detach).
              </p>
              {extractError ? (
                <p className="inspector-panel__hint inspector-panel__hint--tight">
                  {extractError}
                </p>
              ) : null}
            </section>
          )}

          <div
            className="inspector-basic-footer"
            role="toolbar"
            aria-label="Alignment"
          >
            <div className="inspector-basic-footer__align" role="group">
              {(
                [
                  ["left", "Align left", IconAlignLeft],
                  ["center", "Align center", IconAlignCenter],
                  ["right", "Align right", IconAlignRight],
                ] as const
              ).map(([id, title, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className="inspector-basic-footer__btn"
                  title={title}
                  aria-label={title}
                  disabled={locked || !fitted}
                  onClick={() => setAlign(id)}
                >
                  <Icon size={14} />
                </button>
              ))}
              <span className="inspector-basic-footer__sep" aria-hidden />
              {(
                [
                  ["top", "Align top", IconAlignTop],
                  ["middle", "Align middle", IconAlignMiddle],
                  ["bottom", "Align bottom", IconAlignBottom],
                ] as const
              ).map(([id, title, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className="inspector-basic-footer__btn"
                  title={title}
                  aria-label={title}
                  disabled={locked || !fitted}
                  onClick={() => setAlign(undefined, id)}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className={
                transform.uniformScale !== false
                  ? "inspector-basic-footer__btn inspector-basic-footer__btn--active"
                  : "inspector-basic-footer__btn"
              }
              title="Uniform scale"
              aria-label="Uniform scale"
              aria-pressed={transform.uniformScale !== false}
              disabled={locked}
              onClick={() => {
                if (localMs === null) return;
                const on = transform.uniformScale === false;
                gesture.commit(
                  patchClipTransformValues(
                    clip,
                    {
                      uniformScale: on,
                      ...(on
                        ? { scaleX: transform.scaleX, scaleY: transform.scaleX }
                        : {}),
                    },
                    localMs,
                    fps,
                  ),
                  "Uniform scale",
                );
              }}
            >
              <IconLink size={14} />
            </button>
            <button
              type="button"
              className="inspector-basic-footer__btn"
              title="Crop"
              aria-label="Crop"
              disabled={locked}
              onClick={() => setCropDialogOpen(true)}
            >
              <IconCrop size={14} />
            </button>
          </div>
          </>
          )}

          {locked && (
            <p className="inspector-panel__hint">Track is locked.</p>
          )}
          </div>
        </>
      )}
    </div>
  );
}
