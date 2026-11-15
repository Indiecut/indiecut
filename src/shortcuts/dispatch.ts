import type { CommandId } from "./commandIds";
import {
  cmdAddText,
  cmdBladeTool,
  cmdCopy,
  cmdCut,
  cmdDetachAudio,
  cmdExitFullscreen,
  cmdGotoEnd,
  cmdGotoStart,
  cmdGroup,
  cmdJumpCut,
  cmdPaste,
  cmdRedo,
  cmdRippleDelete,
  cmdRippleTrimLeft,
  cmdRippleTrimRight,
  cmdSelectTool,
  cmdShuttleForward,
  cmdShuttlePause,
  cmdShuttleReverse,
  cmdSplit,
  cmdSplitAll,
  cmdStepFrame,
  cmdToggleFullscreen,
  cmdToggleKeyframeGraph,
  cmdTogglePlay,
  cmdUngroup,
  cmdUndo,
  cmdZoomFit,
  cmdZoomIn,
  cmdZoomOut,
} from "./commands";
import { dispatchBridge } from "./dispatchBridge";

export type DispatchContext = {
  getTimelineViewportWidth: () => number;
};

export function dispatchCommand(
  id: CommandId,
  ctx: DispatchContext,
): void {
  // Keep bridge pinned to this module instance (Vite HMR).
  dispatchBridge.dispatch = dispatchCommand;
  switch (id) {
    case "playback.toggle":
      cmdTogglePlay();
      break;
    case "playback.shuttleReverse":
      cmdShuttleReverse();
      break;
    case "playback.shuttlePause":
      cmdShuttlePause();
      break;
    case "playback.shuttleForward":
      cmdShuttleForward();
      break;
    case "playback.stepBack":
      cmdStepFrame(-1);
      break;
    case "playback.stepForward":
      cmdStepFrame(1);
      break;
    case "playback.jumpPrevCut":
      cmdJumpCut(-1);
      break;
    case "playback.jumpNextCut":
      cmdJumpCut(1);
      break;
    case "playback.gotoStart":
      cmdGotoStart();
      break;
    case "playback.gotoEnd":
      cmdGotoEnd();
      break;
    case "playback.fullscreen":
      cmdToggleFullscreen();
      break;
    case "playback.exitFullscreen":
      cmdExitFullscreen();
      break;
    case "edit.split":
      cmdSplit();
      break;
    case "edit.splitAll":
      cmdSplitAll();
      break;
    case "edit.rippleTrimLeft":
      cmdRippleTrimLeft();
      break;
    case "edit.rippleTrimRight":
      cmdRippleTrimRight();
      break;
    case "edit.rippleDelete":
      cmdRippleDelete();
      break;
    case "edit.undo":
      cmdUndo();
      break;
    case "edit.redo":
      cmdRedo();
      break;
    case "edit.copy":
      cmdCopy();
      break;
    case "edit.cut":
      cmdCut();
      break;
    case "edit.paste":
      cmdPaste();
      break;
    case "edit.detachAudio":
      cmdDetachAudio();
      break;
    case "edit.addText":
      cmdAddText();
      break;
    case "edit.group":
      cmdGroup();
      break;
    case "edit.ungroup":
      cmdUngroup();
      break;
    case "tool.select":
      cmdSelectTool();
      break;
    case "tool.blade":
      cmdBladeTool();
      break;
    case "timeline.zoomIn":
      cmdZoomIn();
      break;
    case "timeline.zoomOut":
      cmdZoomOut();
      break;
    case "timeline.zoomFit":
      cmdZoomFit(Math.max(320, ctx.getTimelineViewportWidth()));
      break;
    case "timeline.toggleKeyframeGraph":
      cmdToggleKeyframeGraph();
      break;
    default:
      break;
  }
}

// Keep the singleton key listener on the latest dispatcher after HMR.
dispatchBridge.dispatch = dispatchCommand;
