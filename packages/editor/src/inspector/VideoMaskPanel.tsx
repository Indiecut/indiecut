import { useEffect, useMemo, useState } from "react";
import {
  evaluateClipMask,
  maskAnimatablePath,
  type AnimatablePath,
  type MaskAnimatableLeaf,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import { IconChevronDown } from "../icons/Icons";
import {
  createDefaultMask,
  maskDisplayName,
  replaceMaskType,
} from "../project/maskDefaults";
import type {
  Clip,
  ClipMask,
  MaskBoolean,
  MaskType,
  Track,
} from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { FONT_OPTIONS } from "./fontOptions";
import { InspectorKeyframeGroup } from "./InspectorKeyframeGroup";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
  frameWidth: number;
  frameHeight: number;
};

const MASK_TYPES: { type: MaskType; label: string }[] = [
  { type: "split", label: "Split" },
  { type: "filmstrip", label: "Filmstrip" },
  { type: "circle", label: "Circle" },
  { type: "rectangle", label: "Rectangle" },
  { type: "stars", label: "Stars" },
  { type: "heart", label: "Heart" },
  { type: "text", label: "Text" },
];

const CLOSED: MaskType[] = [
  "circle",
  "rectangle",
  "stars",
  "heart",
  "text",
];

function maskGroupPaths(mask: ClipMask): AnimatablePath[] {
  const leaves: MaskAnimatableLeaf[] = [
    "feather",
    "position.x",
    "position.y",
    "rotationDeg",
  ];
  if (mask.expand) leaves.push("expand");
  if (mask.size) {
    leaves.push("size.w", "size.h");
  }
  if (mask.cornerRadius) leaves.push("cornerRadius");
  if (mask.stripGap) leaves.push("stripGap");
  return leaves.map((leaf) => maskAnimatablePath(mask.id, leaf));
}

function MaskTypeIcon({ type }: { type: MaskType }) {
  return (
    <svg
      className="mask-type-icon"
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden
    >
      {type === "split" && (
        <>
          <rect x="4" y="6" width="24" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {type === "filmstrip" && (
        <>
          <rect x="4" y="6" width="24" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="20" x2="28" y2="20" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {type === "circle" && (
        <ellipse cx="16" cy="16" rx="10" ry="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {type === "rectangle" && (
        <rect x="7" y="7" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {type === "stars" && (
        <path
          d="M16 5 L18.5 12.5 L26 13 L20.5 18 L22.5 26 L16 21.5 L9.5 26 L11.5 18 L6 13 L13.5 12.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
      {type === "heart" && (
        <path
          d="M16 26 C16 26 6 19 6 12.5 C6 9 8.5 7 11 7 C13 7 14.5 8 16 10 C17.5 8 19 7 21 7 C23.5 7 26 9 26 12.5 C26 19 16 26 16 26 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
      {type === "text" && (
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="currentColor"
          fontFamily="system-ui, sans-serif"
        >
          T
        </text>
      )}
    </svg>
  );
}

export function VideoMaskPanel({
  clip,
  track,
  frameWidth,
  frameHeight,
}: Props) {
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Mask");
  const activeMaskId = useEditorStore((s) => s.activeMaskId);
  const setActiveMaskId = useEditorStore((s) => s.setActiveMaskId);
  const setMaskInspectorOpen = useEditorStore((s) => s.setMaskInspectorOpen);

  const masksEnabled = Boolean(clip.masksEnabled);
  const masks = clip.masks ?? [];
  const [bodyOpen, setBodyOpen] = useState(true);
  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;

  useEffect(() => {
    setMaskInspectorOpen(true);
    return () => setMaskInspectorOpen(false);
  }, [setMaskInspectorOpen]);

  const activeIndex = useMemo(() => {
    if (!masks.length) return -1;
    const idx = masks.findIndex((m) => m.id === activeMaskId);
    return idx >= 0 ? idx : 0;
  }, [masks, activeMaskId]);

  const active = activeIndex >= 0 ? masks[activeIndex]! : null;

  useEffect(() => {
    if (!masks.length) {
      if (activeMaskId) setActiveMaskId(null);
      return;
    }
    if (!activeMaskId || !masks.some((m) => m.id === activeMaskId)) {
      setActiveMaskId(masks[0]!.id);
    }
  }, [masks, activeMaskId, setActiveMaskId]);

  const patchMasks = (
    nextMasks: ClipMask[],
    enabled = masksEnabled,
  ): Partial<Clip> => ({
    masks: nextMasks,
    masksEnabled: enabled,
  });

  const updateActive = (partial: Partial<ClipMask>) => {
    if (!active || activeIndex < 0) return;
    const next = masks.map((m, i) =>
      i === activeIndex ? { ...m, ...partial } : m,
    );
    return patchMasks(next);
  };

  const enableMasks = (on: boolean) => {
    if (locked) return;
    if (on) {
      if (masks.length === 0) {
        const first = createDefaultMask("circle", {
          layoutW: frameWidth,
          layoutH: frameHeight,
          index: 0,
        });
        gesture.commit(patchMasks([first], true), "Mask");
        setActiveMaskId(first.id);
      } else {
        gesture.commit({ masksEnabled: true }, "Mask");
      }
      setBodyOpen(true);
    } else {
      gesture.commit({ masksEnabled: false }, "Mask");
    }
  };

  const selectType = (type: MaskType) => {
    if (locked) return;
    if (!masksEnabled || masks.length === 0) {
      const first = createDefaultMask(type, {
        layoutW: frameWidth,
        layoutH: frameHeight,
        index: 0,
      });
      gesture.commit(patchMasks([first], true), "Mask");
      setActiveMaskId(first.id);
      setBodyOpen(true);
      return;
    }
    if (!active || activeIndex < 0) return;
    const replaced = replaceMaskType(active, type, {
      layoutW: frameWidth,
      layoutH: frameHeight,
      index: activeIndex,
    });
    const next = masks.map((m, i) => (i === activeIndex ? replaced : m));
    gesture.commit(patchMasks(next, true), "Mask");
  };

  const addMask = () => {
    if (locked) return;
    const nextMask = createDefaultMask("circle", {
      layoutW: frameWidth,
      layoutH: frameHeight,
      index: masks.length,
    });
    if (masks.length > 0) {
      nextMask.booleanBlend = "add";
    }
    const next = [...masks, nextMask];
    gesture.commit(patchMasks(next, true), "Mask");
    setActiveMaskId(nextMask.id);
    setBodyOpen(true);
  };

  const supportsExpand = active ? CLOSED.includes(active.type) : false;
  const supportsSize = active
    ? CLOSED.includes(active.type) || active.type === "rectangle"
    : false;
  const supportsCorner =
    active?.type === "rectangle" || active?.type === "stars";
  const supportsGap = active?.type === "filmstrip";
  const supportsText = active?.type === "text";

  const resolvedActive =
    active && localMs !== null
      ? evaluateClipMask(active, localMs)
      : active
        ? evaluateClipMask(active, 0)
        : null;

  const liveMask = (leaf: MaskAnimatableLeaf, value: number) => {
    if (!active || offClip) return;
    gesture.ensureBegin();
    setAnimatableValue(clip.id, maskAnimatablePath(active.id, leaf), value);
  };

  return (
    <section className="inspector-section inspector-blend inspector-mask">
      <div className="inspector-blend__head">
        <label className="inspector-blend__enable">
          <input
            type="checkbox"
            checked={masksEnabled}
            disabled={locked}
            onChange={(e) => enableMasks(e.target.checked)}
          />
          <span>
            Mask
            {active && (
              <InspectorKeyframeGroup
                clipId={clip.id}
                paths={maskGroupPaths(active)}
              />
            )}
          </span>
        </label>
        <button
          type="button"
          className="inspector-blend__chevron-btn"
          disabled={!masksEnabled}
          aria-expanded={bodyOpen}
          onClick={() => setBodyOpen((v) => !v)}
        >
          <IconChevronDown
            className={
              bodyOpen
                ? "inspector-blend__chevron"
                : "inspector-blend__chevron inspector-blend__chevron--closed"
            }
          />
        </button>
      </div>

      {masksEnabled && bodyOpen && (
        <div className="inspector-blend__body">
          <div className="mask-chip-row">
            {masks.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className={
                  m.id === active?.id
                    ? "mask-chip mask-chip--active"
                    : "mask-chip"
                }
                disabled={locked}
                onClick={() => setActiveMaskId(m.id)}
              >
                {maskDisplayName(m, i)}
              </button>
            ))}
            <button
              type="button"
              className="mask-chip mask-chip--add"
              disabled={locked}
              title="Add mask"
              aria-label="Add mask"
              onClick={addMask}
            >
              +
            </button>
          </div>

          <div className="mask-type-grid" role="listbox" aria-label="Mask type">
            {MASK_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={active?.type === type}
                className={
                  active?.type === type
                    ? "mask-type-tile mask-type-tile--active"
                    : "mask-type-tile"
                }
                disabled={locked}
                onClick={() => selectType(type)}
              >
                <MaskTypeIcon type={type} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {active && activeIndex > 0 && (
            <label className="inspector-field">
              <span className="inspector-field__label">Blend</span>
              <select
                className="inspector-select"
                disabled={locked}
                value={active.booleanBlend ?? "add"}
                onChange={(e) => {
                  const booleanBlend = e.target.value as MaskBoolean;
                  gesture.commit(updateActive({ booleanBlend })!, "Mask");
                }}
              >
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
                <option value="intersect">Intersect</option>
              </select>
            </label>
          )}

          {active && resolvedActive && (
            <>
              <label className="inspector-field inspector-field--check">
                <span className="inspector-field__label">Invert</span>
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={active.invert}
                  onChange={(e) => {
                    gesture.commit(
                      updateActive({ invert: e.target.checked })!,
                      "Mask",
                    );
                  }}
                />
              </label>

              <InspectorKeyframeRow
                clipId={clip.id}
                path={maskAnimatablePath(active.id, "feather")}
                label="Feather"
                disabled={offClip}
              >
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={100}
                  step={1}
                  disabled={offClip}
                  value={resolvedActive.feather}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) => liveMask("feather", Number(e.target.value))}
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={offClip}
                  value={Math.round(resolvedActive.feather)}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const feather = Number(e.target.value);
                    if (!Number.isFinite(feather)) return;
                    liveMask("feather", Math.min(100, Math.max(0, feather)));
                  }}
                />
              </InspectorKeyframeRow>

              {supportsExpand && (
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path={maskAnimatablePath(active.id, "expand")}
                  label="Expand"
                  disabled={offClip}
                >
                  <input
                    type="range"
                    className="inspector-slider"
                    min={-100}
                    max={100}
                    step={1}
                    disabled={offClip}
                    value={resolvedActive.expand ?? 0}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) => liveMask("expand", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="inspector-number"
                    disabled={offClip}
                    value={Math.round(resolvedActive.expand ?? 0)}
                    onFocus={gesture.begin}
                    onBlur={gesture.end}
                    onChange={(e) => {
                      const expand = Number(e.target.value);
                      if (!Number.isFinite(expand)) return;
                      liveMask(
                        "expand",
                        Math.min(100, Math.max(-100, expand)),
                      );
                    }}
                  />
                </InspectorKeyframeRow>
              )}

              {supportsGap && (
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path={maskAnimatablePath(active.id, "stripGap")}
                  label="Height"
                  disabled={offClip}
                >
                  <input
                    type="range"
                    className="inspector-slider"
                    min={1}
                    max={Math.max(frameHeight, 100)}
                    step={1}
                    disabled={offClip}
                    value={resolvedActive.stripGap ?? frameHeight * 0.3}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveMask("stripGap", Number(e.target.value))
                    }
                  />
                  <input
                    type="number"
                    className="inspector-number"
                    disabled={offClip}
                    value={Math.round(
                      resolvedActive.stripGap ?? frameHeight * 0.3,
                    )}
                    onFocus={gesture.begin}
                    onBlur={gesture.end}
                    onChange={(e) => {
                      const stripGap = Number(e.target.value);
                      if (!Number.isFinite(stripGap)) return;
                      liveMask("stripGap", Math.max(1, stripGap));
                    }}
                  />
                </InspectorKeyframeRow>
              )}

              {supportsSize && (
                <>
                  <InspectorKeyframeRow
                    clipId={clip.id}
                    path={maskAnimatablePath(active.id, "size.w")}
                    label="Width"
                    disabled={offClip}
                  >
                    <input
                      type="number"
                      className="inspector-number"
                      disabled={offClip}
                      value={Math.round(resolvedActive.size?.w ?? 400)}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        if (!Number.isFinite(w)) return;
                        liveMask("size.w", Math.max(1, w));
                      }}
                    />
                  </InspectorKeyframeRow>
                  <InspectorKeyframeRow
                    clipId={clip.id}
                    path={maskAnimatablePath(active.id, "size.h")}
                    label="Height"
                    disabled={offClip}
                  >
                    <input
                      type="number"
                      className="inspector-number"
                      disabled={offClip}
                      value={Math.round(resolvedActive.size?.h ?? 400)}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        if (!Number.isFinite(h)) return;
                        liveMask("size.h", Math.max(1, h));
                      }}
                    />
                  </InspectorKeyframeRow>
                </>
              )}

              {supportsCorner && (
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path={maskAnimatablePath(active.id, "cornerRadius")}
                  label="Round corners"
                  disabled={offClip}
                >
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0}
                    max={100}
                    step={1}
                    disabled={offClip}
                    value={resolvedActive.cornerRadius ?? 0}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveMask("cornerRadius", Number(e.target.value))
                    }
                  />
                  <input
                    type="number"
                    className="inspector-number"
                    disabled={offClip}
                    value={Math.round(resolvedActive.cornerRadius ?? 0)}
                    onFocus={gesture.begin}
                    onBlur={gesture.end}
                    onChange={(e) => {
                      const cornerRadius = Number(e.target.value);
                      if (!Number.isFinite(cornerRadius)) return;
                      liveMask(
                        "cornerRadius",
                        Math.min(100, Math.max(0, cornerRadius)),
                      );
                    }}
                  />
                </InspectorKeyframeRow>
              )}

              {supportsText && active.text && (
                <>
                  <label className="inspector-field inspector-field--stack">
                    <span className="inspector-field__label">Text</span>
                    <textarea
                      className="inspector-textarea"
                      disabled={locked}
                      rows={2}
                      value={active.text.content}
                      onChange={(e) => {
                        gesture.commit(
                          updateActive({
                            text: { ...active.text!, content: e.target.value },
                          })!,
                          "Mask",
                        );
                      }}
                    />
                  </label>
                  <label className="inspector-field">
                    <span className="inspector-field__label">Font</span>
                    <select
                      className="inspector-select"
                      disabled={locked}
                      value={active.text.fontFamily}
                      onChange={(e) => {
                        gesture.commit(
                          updateActive({
                            text: {
                              ...active.text!,
                              fontFamily: e.target.value,
                            },
                          })!,
                          "Mask",
                        );
                      }}
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f.split(",")[0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inspector-field">
                    <span className="inspector-field__label">Align</span>
                    <select
                      className="inspector-select"
                      disabled={locked}
                      value={active.text.align ?? "center"}
                      onChange={(e) => {
                        const align = e.target.value as
                          | "left"
                          | "center"
                          | "right";
                        gesture.commit(
                          updateActive({
                            text: { ...active.text!, align },
                          })!,
                          "Mask",
                        );
                      }}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </>
              )}

              <InspectorKeyframeRow
                clipId={clip.id}
                path={maskAnimatablePath(active.id, "position.x")}
                label="Position X"
                disabled={offClip}
              >
                <input
                  type="number"
                  className="inspector-number"
                  disabled={offClip}
                  value={Math.round(resolvedActive.position.x * 10) / 10}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const x = Number(e.target.value);
                    if (!Number.isFinite(x)) return;
                    liveMask("position.x", x);
                  }}
                />
              </InspectorKeyframeRow>
              <InspectorKeyframeRow
                clipId={clip.id}
                path={maskAnimatablePath(active.id, "position.y")}
                label="Position Y"
                disabled={offClip}
              >
                <input
                  type="number"
                  className="inspector-number"
                  disabled={offClip}
                  value={Math.round(resolvedActive.position.y * 10) / 10}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    if (!Number.isFinite(y)) return;
                    liveMask("position.y", y);
                  }}
                />
              </InspectorKeyframeRow>

              <InspectorKeyframeRow
                clipId={clip.id}
                path={maskAnimatablePath(active.id, "rotationDeg")}
                label="Rotation"
                disabled={offClip}
              >
                <input
                  type="range"
                  className="inspector-slider"
                  min={-180}
                  max={180}
                  step={0.1}
                  disabled={offClip}
                  value={resolvedActive.rotationDeg}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) =>
                    liveMask("rotationDeg", Number(e.target.value))
                  }
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={offClip}
                  value={Math.round(resolvedActive.rotationDeg * 100) / 100}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const rotationDeg = Number(e.target.value);
                    if (!Number.isFinite(rotationDeg)) return;
                    liveMask("rotationDeg", rotationDeg);
                  }}
                />
                <span className="inspector-field__unit">°</span>
              </InspectorKeyframeRow>
            </>
          )}
        </div>
      )}
    </section>
  );
}
