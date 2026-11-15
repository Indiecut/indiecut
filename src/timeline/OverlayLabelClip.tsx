import type { Clip } from "../project/types";

type Props = {
  clip: Clip;
  label: string;
};

/** Colored timeline block label for text / sticker clips (no filmstrip). */
export function OverlayLabelClip({ clip, label }: Props) {
  return (
    <span className="timeline-panel__clip-label" title={label || clip.kind}>
      {label || clip.kind}
    </span>
  );
}
