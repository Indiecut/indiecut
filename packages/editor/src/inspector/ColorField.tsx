import { useEffect, useState } from "react";

export function normalizeHex(raw: string): string | null {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function toPickerHex(color: string | undefined, fallback: string): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const n = color ? normalizeHex(color) : null;
  return n ?? fallback;
}

export function ColorField({
  label,
  value,
  fallback,
  locked,
  onLive,
  onBegin,
  onEnd,
}: {
  label: string;
  value: string;
  fallback: string;
  locked: boolean;
  onLive: (hex: string) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  const picker = toPickerHex(value, fallback);
  const [hexDraft, setHexDraft] = useState(picker);
  useEffect(() => {
    setHexDraft(picker);
  }, [picker]);

  return (
    <label className="inspector-field">
      <span className="inspector-field__label">{label}</span>
      <div className="inspector-field__controls inspector-color-row">
        <input
          type="color"
          className="inspector-color"
          disabled={locked}
          value={picker}
          onPointerDown={onBegin}
          onPointerUp={onEnd}
          onChange={(e) => {
            const hex = e.target.value;
            setHexDraft(hex);
            onLive(hex);
          }}
        />
        <input
          type="text"
          className="inspector-hex"
          disabled={locked}
          spellCheck={false}
          value={hexDraft}
          onFocus={onBegin}
          onBlur={() => {
            const n = normalizeHex(hexDraft);
            if (n) {
              setHexDraft(n);
              onLive(n);
            } else {
              setHexDraft(picker);
            }
            onEnd();
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setHexDraft(raw);
            const n = normalizeHex(raw);
            if (n) onLive(n);
          }}
        />
      </div>
    </label>
  );
}
