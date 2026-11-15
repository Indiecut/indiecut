import type { ResolvedClipMask } from "../project/types";

/** Stable fingerprint for preview skip-cache / stencil invalidation. */
export function maskFingerprint(
  masksEnabled: boolean | null | undefined,
  masks: ResolvedClipMask[] | null | undefined,
): string {
  if (!masksEnabled || !masks || masks.length === 0) return "";
  return masks
    .map((m) => {
      const size = m.size ? `${m.size.w.toFixed(1)}x${m.size.h.toFixed(1)}` : "";
      const text = m.text
        ? `${m.text.content}|${m.text.fontFamily}|${m.text.fontSize}|${m.text.align ?? "c"}|${m.text.letterSpacing ?? 0}|${m.text.lineHeight ?? 1}`
        : "";
      return [
        m.id,
        m.type,
        m.invert ? 1 : 0,
        m.feather.toFixed(1),
        (m.expand ?? 0).toFixed(1),
        m.position.x.toFixed(1),
        m.position.y.toFixed(1),
        m.rotationDeg.toFixed(2),
        m.booleanBlend ?? "",
        size,
        (m.cornerRadius ?? 0).toFixed(1),
        (m.stripGap ?? 0).toFixed(1),
        text,
      ].join(":");
    })
    .join("|");
}
