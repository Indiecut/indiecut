import {
  humanizeAnimatablePathForClip,
  KEYFRAME_DRAWER_ROW_PX,
  KEYFRAME_GRAPH_HEIGHT_PX,
  listKeyedAnimatablePaths,
} from "../engine/animatable";
import type { Clip } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { KeyframeTrackLane } from "./KeyframeTrackLane";
import {
  keyframeGraphExtraHeight,
  TimelineValueGraph,
} from "./TimelineValueGraph";

/** Chrome row for close / graph toggle above dope lanes. */
export const KEYFRAME_DRAWER_CHROME_PX = 20;

/** Dope sheet: label column (~108) + enough track to drag diamonds. */
export const KEYFRAME_DRAWER_MIN_WIDTH_PX = 240;

/** Value graph: property tabs + plot + toolbar. */
export const KEYFRAME_GRAPH_MIN_WIDTH_PX = 320;

type Props = {
  clip: Clip;
  /** Absolute left (px) matching the clip bar. */
  left: number;
  /** Absolute width (px) matching the clip bar. */
  width: number;
  /** Top offset inside the lane (below the clip bar). */
  top: number;
  /** Lane content width — used to keep a widened drawer on-canvas. */
  contentWidth?: number;
};

/**
 * Widen short-clip drawers so chrome / labels / tracks stay usable.
 * Prefer left-align with the clip; shift left only if we would spill past content.
 */
export function keyframeDrawerGeometry(
  clipLeft: number,
  clipWidth: number,
  opts?: { minWidth?: number; contentWidth?: number },
): { left: number; width: number } {
  const minWidth = opts?.minWidth ?? KEYFRAME_DRAWER_MIN_WIDTH_PX;
  const width = Math.max(clipWidth, minWidth);
  let left = clipLeft;
  const contentWidth = opts?.contentWidth;
  if (contentWidth != null && width < contentWidth && left + width > contentWidth) {
    left = Math.max(0, contentWidth - width);
  } else if (contentWidth != null && width >= contentWidth) {
    left = 0;
  }
  return { left, width: Math.min(width, contentWidth ?? width) };
}

function DrawerChrome() {
  const mode = useEditorStore((s) => s.keyframeDrawerMode);
  const setExpandedKeyframeClipId = useEditorStore(
    (s) => s.setExpandedKeyframeClipId,
  );
  const setKeyframeDrawerMode = useEditorStore((s) => s.setKeyframeDrawerMode);
  const toggleKeyframeGraphMode = useEditorStore(
    (s) => s.toggleKeyframeGraphMode,
  );

  return (
    <div className="timeline-kf-drawer__chrome">
      <button
        type="button"
        className={
          mode === "graph"
            ? "timeline-kf-drawer__chrome-btn timeline-kf-drawer__chrome-btn--active"
            : "timeline-kf-drawer__chrome-btn"
        }
        title={
          mode === "graph"
            ? "Show dope sheet (Alt+K)"
            : "Show keyframe graph (Alt+K)"
        }
        aria-label={
          mode === "graph" ? "Show dope sheet" : "Show keyframe graph"
        }
        aria-pressed={mode === "graph"}
        onClick={(e) => {
          e.stopPropagation();
          if (mode === "graph") setKeyframeDrawerMode("dope");
          else toggleKeyframeGraphMode();
        }}
      >
        ⌒
      </button>
      <button
        type="button"
        className="timeline-kf-drawer__chrome-btn"
        title="Close keyframes"
        aria-label="Close keyframes"
        onClick={(e) => {
          e.stopPropagation();
          setExpandedKeyframeClipId(null);
        }}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Expanded keyframe drawer under a clip — dope-sheet lanes or value graph.
 */
export function TimelineKeyframeDrawer({
  clip,
  left,
  width,
  top,
  contentWidth,
}: Props) {
  const mode = useEditorStore((s) => s.keyframeDrawerMode);
  const paths = listKeyedAnimatablePaths(clip);
  if (paths.length === 0) return null;

  const geo = keyframeDrawerGeometry(left, width, {
    minWidth:
      mode === "graph"
        ? KEYFRAME_GRAPH_MIN_WIDTH_PX
        : KEYFRAME_DRAWER_MIN_WIDTH_PX,
    contentWidth,
  });

  if (mode === "graph") {
    return (
      <TimelineValueGraph
        clip={clip}
        left={geo.left}
        width={geo.width}
        top={top}
      />
    );
  }

  return (
    <div
      className="timeline-kf-drawer"
      style={{
        left: geo.left,
        width: geo.width,
        top,
        height: KEYFRAME_DRAWER_CHROME_PX + paths.length * KEYFRAME_DRAWER_ROW_PX,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DrawerChrome />
      {paths.map((path) => (
        <KeyframeTrackLane
          key={path}
          clip={clip}
          path={path}
          label={humanizeAnimatablePathForClip(clip, path)}
        />
      ))}
    </div>
  );
}

/** Extra lane height needed when drawer is open for this clip. */
export function keyframeDrawerExtraHeight(
  clip: Clip,
  mode: "dope" | "graph" = "dope",
): number {
  const n = listKeyedAnimatablePaths(clip).length;
  if (n === 0) return 0;
  if (mode === "graph") return keyframeGraphExtraHeight();
  return KEYFRAME_DRAWER_CHROME_PX + n * KEYFRAME_DRAWER_ROW_PX;
}

export { KEYFRAME_GRAPH_HEIGHT_PX };
