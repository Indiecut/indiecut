import type { RemoveBgColorParams, RemoveBgParams } from "./types";

/** ClearCut Smart Key default emerald studio green (#10B981). */
export const DEFAULT_REMOVE_BG_KEY_COLOR: [number, number, number] = [
  16, 185, 129,
];

export const DEFAULT_REMOVE_BG_COLOR: RemoveBgColorParams = {
  keyColor: [...DEFAULT_REMOVE_BG_KEY_COLOR],
  tolerance: 0.34,
  softness: 0.18,
  spill: 0.72,
  choke: 0.18,
};

/** Defaults when the user first enables Remove BG (before auto-sample). */
export function createDefaultRemoveBg(): RemoveBgParams {
  return {
    enabled: true,
    color: {
      keyColor: [...DEFAULT_REMOVE_BG_KEY_COLOR],
      tolerance: DEFAULT_REMOVE_BG_COLOR.tolerance,
      softness: DEFAULT_REMOVE_BG_COLOR.softness,
      spill: DEFAULT_REMOVE_BG_COLOR.spill,
      choke: DEFAULT_REMOVE_BG_COLOR.choke,
    },
  };
}
