import type { Clip, TextBubbleProps, TextProps, Track } from "../project/types";
import { ColorField } from "./ColorField";
import { useClipGestureEdit } from "./useClipGestureEdit";

const BUBBLE_TYPES: Array<{
  id: TextBubbleProps["type"];
  label: string;
}> = [
  { id: "none", label: "None" },
  { id: "speech-round", label: "Speech" },
  { id: "speech-comic", label: "Comic" },
  { id: "thought-cloud", label: "Thought" },
  { id: "comic-burst", label: "Burst" },
  { id: "star-badge", label: "Star" },
  { id: "pill", label: "Pill" },
  { id: "rounded-rect", label: "Card" },
  { id: "neon-frame", label: "Neon" },
  { id: "ribbon", label: "Ribbon" },
  { id: "arrow-tag", label: "Arrow" },
  { id: "hexagon", label: "Hex" },
  { id: "ticket", label: "Ticket" },
  { id: "torn-paper", label: "Torn" },
  { id: "typing-box", label: "Typing" },
  { id: "promo-badge", label: "Badge" },
];

export const DEFAULT_BUBBLE: TextBubbleProps = {
  type: "none",
  fill: "#ffffff",
  stroke: "#000000",
  strokeWidth: 3,
  paddingX: 28,
  paddingY: 16,
  opacity: 1,
};

const DEFAULT_FILL_FOR_TYPE: Partial<
  Record<TextBubbleProps["type"], string>
> = {
  "neon-frame": "rgba(88, 28, 135, 0.45)",
  "speech-round": "#ffffff",
  "speech-comic": "#fef08a",
  "thought-cloud": "#f1f5f9",
  pill: "#fef3c7",
  "comic-burst": "#fde68a",
  "star-badge": "#f97316",
  ribbon: "#dc2626",
  "arrow-tag": "#2563eb",
  hexagon: "#f43f5e",
  ticket: "#fafaf9",
  "torn-paper": "#fefce8",
  "typing-box": "#ffffff",
  "promo-badge": "#f97316",
  "rounded-rect": "#ffffff",
};

function resolveBubble(text: TextProps): TextBubbleProps {
  const b = text.bubble;
  if (!b) return { ...DEFAULT_BUBBLE };
  const opacity =
    typeof b.opacity === "number" && Number.isFinite(b.opacity)
      ? Math.min(1, Math.max(0, b.opacity))
      : 1;
  return {
    type: b.type ?? "none",
    fill: b.fill ?? DEFAULT_BUBBLE.fill,
    stroke: b.stroke ?? DEFAULT_BUBBLE.stroke,
    strokeWidth: b.strokeWidth ?? DEFAULT_BUBBLE.strokeWidth,
    paddingX: b.paddingX ?? DEFAULT_BUBBLE.paddingX,
    paddingY: b.paddingY ?? DEFAULT_BUBBLE.paddingY,
    accentColor: b.accentColor,
    opacity,
  };
}

type Props = {
  clip: Clip;
  track: Track;
  text: TextProps;
};

export function TextBubblePanel({ clip, track, text }: Props) {
  const locked = track.locked;
  const gesture = useClipGestureEdit(clip.id, "Text bubble");
  const bubble = resolveBubble(text);
  const chromeOn = bubble.type !== "none";

  const commitBubble = (next: TextBubbleProps, label = "Text bubble") => {
    gesture.commit({ text: { ...text, bubble: next } }, label);
  };

  const liveBubble = (partial: Partial<TextBubbleProps>) => {
    gesture.live({
      text: { ...text, bubble: { ...bubble, ...partial } },
    });
  };

  const pickType = (type: TextBubbleProps["type"]) => {
    if (type === "none") {
      commitBubble({ ...DEFAULT_BUBBLE, type: "none" }, "Bubble none");
      return;
    }
    const nextFill =
      bubble.type === "none" && bubble.fill === "#ffffff"
        ? (DEFAULT_FILL_FOR_TYPE[type] ?? bubble.fill)
        : bubble.fill;
    const nextStroke =
      type === "neon-frame" && bubble.stroke === "#000000"
        ? "#f0abfc"
        : bubble.stroke;
    commitBubble(
      {
        ...bubble,
        type,
        fill: nextFill,
        stroke: nextStroke,
      },
      "Bubble type",
    );
  };

  return (
    <section className="inspector-section">
      <div className="inspector-section__head">
        <h3 className="inspector-section__title">Shape</h3>
      </div>
      <p className="inspector-panel__hint">
        SVG-style chrome behind the text. Edit the text anytime — shape stays.
      </p>

      <div
        className="text-anim__grid text-anim__grid--aa"
        role="listbox"
        aria-label="Text shape"
      >
        {BUBBLE_TYPES.map((entry) => {
          const active = bubble.type === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={active}
              disabled={locked}
              title={entry.label}
              className={
                active
                  ? "text-anim__tile text-anim__tile--active"
                  : "text-anim__tile"
              }
              onClick={() => pickType(entry.id)}
            >
              <span className="text-aa__sample" aria-hidden>
                {entry.id === "none" ? "—" : "Aa"}
              </span>
              <span className="text-anim__label">{entry.label}</span>
            </button>
          );
        })}
      </div>

      <ColorField
        label="Fill"
        value={bubble.fill}
        fallback="#ffffff"
        locked={locked || !chromeOn}
        onBegin={gesture.begin}
        onEnd={gesture.end}
        onLive={(hex) => liveBubble({ fill: hex })}
      />
      <ColorField
        label="Stroke"
        value={bubble.stroke}
        fallback="#000000"
        locked={locked || !chromeOn}
        onBegin={gesture.begin}
        onEnd={gesture.end}
        onLive={(hex) => liveBubble({ stroke: hex })}
      />

      <label className="inspector-field">
        <span className="inspector-field__label">Transparency</span>
        <div className="inspector-field__controls">
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={100}
            step={1}
            disabled={locked || !chromeOn}
            value={Math.round((1 - (bubble.opacity ?? 1)) * 100)}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) => {
              const transparency = Number(e.target.value);
              if (!Number.isFinite(transparency)) return;
              liveBubble({
                opacity: Math.min(1, Math.max(0, 1 - transparency / 100)),
              });
            }}
          />
          <input
            type="number"
            className="inspector-number"
            disabled={locked || !chromeOn}
            min={0}
            max={100}
            step={1}
            value={Math.round((1 - (bubble.opacity ?? 1)) * 100)}
            onFocus={gesture.begin}
            onBlur={gesture.end}
            onChange={(e) => {
              const transparency = Number(e.target.value);
              if (!Number.isFinite(transparency)) return;
              liveBubble({
                opacity: Math.min(
                  1,
                  Math.max(0, 1 - Math.min(100, Math.max(0, transparency)) / 100),
                ),
              });
            }}
          />
        </div>
      </label>

      <label className="inspector-field">
        <span className="inspector-field__label">Stroke width</span>
        <div className="inspector-field__controls">
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={12}
            step={0.5}
            disabled={locked || !chromeOn}
            value={bubble.strokeWidth}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) =>
              liveBubble({ strokeWidth: Number(e.target.value) })
            }
          />
          <input
            type="number"
            className="inspector-number"
            disabled={locked || !chromeOn}
            min={0}
            max={12}
            step={0.5}
            value={bubble.strokeWidth}
            onFocus={gesture.begin}
            onBlur={gesture.end}
            onChange={(e) => {
              const strokeWidth = Number(e.target.value);
              if (!Number.isFinite(strokeWidth)) return;
              liveBubble({ strokeWidth: Math.max(0, strokeWidth) });
            }}
          />
        </div>
      </label>

      <label className="inspector-field">
        <span className="inspector-field__label">Pad X</span>
        <div className="inspector-field__controls">
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={64}
            step={1}
            disabled={locked || !chromeOn}
            value={bubble.paddingX}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) => liveBubble({ paddingX: Number(e.target.value) })}
          />
          <input
            type="number"
            className="inspector-number"
            disabled={locked || !chromeOn}
            min={0}
            max={64}
            value={bubble.paddingX}
            onFocus={gesture.begin}
            onBlur={gesture.end}
            onChange={(e) => {
              const paddingX = Number(e.target.value);
              if (!Number.isFinite(paddingX)) return;
              liveBubble({ paddingX: Math.max(0, paddingX) });
            }}
          />
        </div>
      </label>

      <label className="inspector-field">
        <span className="inspector-field__label">Pad Y</span>
        <div className="inspector-field__controls">
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={64}
            step={1}
            disabled={locked || !chromeOn}
            value={bubble.paddingY}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) => liveBubble({ paddingY: Number(e.target.value) })}
          />
          <input
            type="number"
            className="inspector-number"
            disabled={locked || !chromeOn}
            min={0}
            max={64}
            value={bubble.paddingY}
            onFocus={gesture.begin}
            onBlur={gesture.end}
            onChange={(e) => {
              const paddingY = Number(e.target.value);
              if (!Number.isFinite(paddingY)) return;
              liveBubble({ paddingY: Math.max(0, paddingY) });
            }}
          />
        </div>
      </label>

      <div className="inspector-field">
        <span className="inspector-field__label" />
        <button
          type="button"
          className="inspector-chip"
          disabled={locked}
          onClick={() =>
            commitBubble({ ...DEFAULT_BUBBLE, type: "none" }, "Bubble reset")
          }
        >
          Reset
        </button>
      </div>
    </section>
  );
}
