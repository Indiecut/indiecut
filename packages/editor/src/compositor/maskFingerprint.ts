import type { ResolvedClipMask } from "../project/types";

/** Stable fingerprint for preview skip-cache / stencil invalidation. */
export function maskFingerprint(
  masksEnabled: boolean | null | undefined,
  masks: ResolvedClipMask[] | null | undefined,
): string {
  if (!masksEnabled || !masks || masks.length === 0) return "";
  return masks
    .map((m) => {
      const size = m.size
        ? `${Number(m.size.w ?? 0).toFixed(1)}x${Number(m.size.h ?? 0).toFixed(1)}`
        : "";
      const text = m.text
        ? `${m.text.content}|${m.text.fontFamily}|${m.text.fontSize}|${m.text.align ?? "c"}|${m.text.letterSpacing ?? 0}|${m.text.lineHeight ?? 1}`
        : "";
      return [
        m.id,
        m.type,
        m.invert ? 1 : 0,
        Number(m.feather ?? 0).toFixed(1),
        Number(m.expand ?? 0).toFixed(1),
        Number(m.position?.x ?? 0).toFixed(1),
        Number(m.position?.y ?? 0).toFixed(1),
        Number(m.rotationDeg ?? 0).toFixed(2),
        m.booleanBlend ?? "",
        size,
        Number(m.cornerRadius ?? 0).toFixed(1),
        Number(m.stripGap ?? 0).toFixed(1),
        text,
      ].join(":");
    })
    .join("|");
}
