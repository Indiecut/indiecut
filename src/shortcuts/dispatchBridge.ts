import type { CommandId } from "./commandIds";
import type { DispatchContext } from "./dispatch";

/**
 * Mutable bridge so long-lived window key listeners always call the latest
 * dispatchCommand after Vite HMR (avoid stacking stale single-clip handlers).
 */
export const dispatchBridge: {
  dispatch: (id: CommandId, ctx: DispatchContext) => void;
} = {
  dispatch: () => {
    /* set by dispatch.ts */
  },
};
