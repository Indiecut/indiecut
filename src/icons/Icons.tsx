import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 16,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const s = {
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconKeyboard({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="1.5" y="3.25" width="13" height="9.5" rx="1.5" {...s} />
      <rect x="3.25" y="5.1" width="1.4" height="1.4" rx="0.25" fill="currentColor" />
      <rect x="5.3" y="5.1" width="1.4" height="1.4" rx="0.25" fill="currentColor" />
      <rect x="7.3" y="5.1" width="1.4" height="1.4" rx="0.25" fill="currentColor" />
      <rect x="9.35" y="5.1" width="1.4" height="1.4" rx="0.25" fill="currentColor" />
      <rect x="11.35" y="5.1" width="1.4" height="1.4" rx="0.25" fill="currentColor" />
      <rect x="4.25" y="9.35" width="7.5" height="1.5" rx="0.35" fill="currentColor" />
    </Svg>
  );
}

export function IconSettings({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M8 1.75c.45 0 .8.1 1.05.35l.35 1.2c.28.08.54.2.78.35l1.2-.35c.35.2.65.5.85.85l-.35 1.2c.15.24.27.5.35.78l1.2.35c.25.25.35.6.35 1.05s-.1.8-.35 1.05l-1.2.35c-.08.28-.2.54-.35.78l.35 1.2c-.2.35-.5.65-.85.85l-1.2-.35a3.3 3.3 0 0 1-.78.35l-.35 1.2c-.25.25-.6.35-1.05.35s-.8-.1-1.05-.35l-.35-1.2a3.3 3.3 0 0 1-.78-.35l-1.2.35c-.35-.2-.65-.5-.85-.85l.35-1.2a3.3 3.3 0 0 1-.35-.78l-1.2-.35C1.85 8.8 1.75 8.45 1.75 8s.1-.8.35-1.05l1.2-.35c.08-.28.2-.54.35-.78l-.35-1.2c.2-.35.5-.65.85-.85l1.2.35c.24-.15.5-.27.78-.35l.35-1.2C7.2 1.85 7.55 1.75 8 1.75Z"
        {...s}
      />
      <circle cx="8" cy="8" r="2" {...s} />
    </Svg>
  );
}

export function IconSelect({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1" {...s} />
    </Svg>
  );
}

/** Scissors — one-shot split at playhead. */
export function IconSplit({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="4.25" cy="4.25" r="1.55" {...s} />
      <circle cx="4.25" cy="11.75" r="1.55" {...s} />
      <path d="M5.45 5.25 12.4 12.2M5.45 10.75 12.4 3.8" {...s} />
    </Svg>
  );
}

/** Razor — blade tool mode (click clips to cut). */
export function IconBlade({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.5 12.75 11.25 5l1.75 1.75L5.25 14.5z" {...s} />
      <path d="M10.4 4.15 12.6 1.95l1.55 1.55-2.2 2.2" {...s} />
      <path d="M4.35 11.9 6.1 13.65" {...s} />
    </Svg>
  );
}

export function IconUndo({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4.5 6.75H11a2.5 2.5 0 1 1 0 5H9.25" {...s} />
      <path d="M6.75 4.5 4.5 6.75 6.75 9" {...s} />
    </Svg>
  );
}

export function IconReset({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.25 8a4.75 4.75 0 1 0 1.2-3.15" {...s} />
      <path d="M3.25 3.4v3.1h3.1" {...s} />
    </Svg>
  );
}

export function IconStepperUp({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4.5 9.5 8 6l3.5 3.5" {...s} />
    </Svg>
  );
}

export function IconStepperDown({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4.5 6.5 8 10l3.5-3.5" {...s} />
    </Svg>
  );
}

export function IconRedo({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M11.5 6.75H5a2.5 2.5 0 1 0 0 5h1.75" {...s} />
      <path d="M9.25 4.5 11.5 6.75 9.25 9" {...s} />
    </Svg>
  );
}

export function IconTrash({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.5 5h9" {...s} />
      <path d="M6.25 5V3.75h3.5V5" {...s} />
      <path d="M5.25 5v7a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1V5" {...s} />
      <path d="M7 7.5v3M9 7.5v3" {...s} />
    </Svg>
  );
}

export function IconLock({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" {...s} />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" {...s} />
    </Svg>
  );
}

export function IconEye({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M1.75 8s2.5-4 6.25-4 6.25 4 6.25 4-2.5 4-6.25 4S1.75 8 1.75 8Z" {...s} />
      <circle cx="8" cy="8" r="1.75" {...s} />
    </Svg>
  );
}

export function IconMute({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 6.5h2.2L8.5 4v8L5.2 9.5H3V6.5Z" {...s} />
      <path d="M10.5 6.5 13 9M13 6.5 10.5 9" {...s} />
    </Svg>
  );
}

export function IconSolo({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="5.25" {...s} />
      <path d="M8 4.75v6.5M5.5 8h5" {...s} />
    </Svg>
  );
}

export function IconMagnet({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 3.5v4.5a4 4 0 0 0 8 0V3.5" {...s} />
      <path d="M4 3.5h2.25V8M9.75 3.5H12V8" {...s} />
    </Svg>
  );
}

/** Main-track auto magnet — two clips joining at a center cut. */
export function IconMainTrackMagnet({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="1.5" y="5" width="5" height="6" rx="1" {...s} />
      <rect x="9.5" y="5" width="5" height="6" rx="1" {...s} />
      <path d="M8 3.25v9.5" {...s} />
    </Svg>
  );
}

/** Freeze frame — snowflake mark for still insert. */
export function IconFreeze({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M8 2.25v11.5" {...s} />
      <path d="M3.2 4.75l9.6 6.5" {...s} />
      <path d="M12.8 4.75l-9.6 6.5" {...s} />
      <path d="M5.1 3.4l5.8 9.2" {...s} />
      <path d="M10.9 3.4l-5.8 9.2" {...s} />
    </Svg>
  );
}

export function IconMedia({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" {...s} />
      <path d="M6.6 6.2v3.6L10.4 8 6.6 6.2Z" fill="currentColor" />
    </Svg>
  );
}

/** Media library “All Assets” glyph (bars of varying height). */
export function IconAllAssets({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.25 11.5V6.75M6.5 11.5V4.25M9.75 11.5V7.5M13 11.5V5.5" {...s} />
    </Svg>
  );
}

export function IconAudio({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6.4 12.2a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 0 1 3.4 0Z" {...s} />
      <path d="M6.4 12.2V3.4l5.6-1v7.4" {...s} />
      <path d="M12 10.8a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 0 1 3.4 0Z" {...s} />
    </Svg>
  );
}

export function IconImage({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" {...s} />
      <circle cx="5.75" cy="6.5" r="1.1" {...s} />
      <path d="M2.75 11.25 5.6 8.6l2.15 2.1 2.1-2.55 3.4 3.1" {...s} />
    </Svg>
  );
}

export function IconHeart({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M8 13.1 3.7 9.05A3.05 3.05 0 0 1 8 4.55a3.05 3.05 0 0 1 4.3 4.5L8 13.1Z"
        {...s}
      />
    </Svg>
  );
}

export function IconText({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M1.75 3.5h7.5M5.5 3.5V12.75" {...s} />
      <path d="M9 6h5.25M11.6 6V12.75" {...s} />
    </Svg>
  );
}

/** Captions / subtitles tab glyph (speech bars). */
export function IconCaptions({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" {...s} />
      <path d="M4 7.25h5.5M4 10h8" {...s} />
    </Svg>
  );
}

/** Caption track glyph (frame + centered subtitle bars). */
export function IconTrackCaption({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.25" y="3.75" width="11.5" height="8.5" rx="1.4" {...s} />
      <path d="M4.5 7.15h7M5.5 9.35h5" {...s} />
    </Svg>
  );
}

export function IconStickers({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 3h7.2L13 5.8V13H3V3Z" {...s} />
      <path d="M10.2 3V5.8H13" {...s} />
    </Svg>
  );
}

/** Sticker track glyph (circle + crescent). */
export function IconTrackSticker({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="5.25" {...s} />
      <path
        d="M10.6 5.2a4.1 4.1 0 0 0 0 5.6 4.1 4.1 0 1 1 0-5.6Z"
        {...s}
      />
    </Svg>
  );
}

/** Video / overlay track glyph (frame + play). */
export function IconTrackVideo({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.25" y="3.75" width="11.5" height="8.5" rx="1.4" {...s} />
      <path d="M6.85 6.15v3.7L10.55 8 6.85 6.15Z" fill="currentColor" />
    </Svg>
  );
}

/** Audio track glyph (note in circle). */
export function IconTrackAudio({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="8" cy="8" r="5.25" {...s} />
      <path d="M7.1 10.4a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Z" {...s} />
      <path d="M7.1 10.4V5.35l3.55-.7v3.9" {...s} />
      <path d="M10.65 9.7a1.05 1.05 0 1 1-2.1 0 1.05 1.05 0 0 1 2.1 0Z" {...s} />
    </Svg>
  );
}

export function IconEffects({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M8 2.35 9.4 6.15h3.9L10.25 8.5l1.25 3.9L8 10.3 4.5 12.4l1.25-3.9L2.7 6.15h3.9L8 2.35Z"
        {...s}
      />
    </Svg>
  );
}

export function IconTransitions({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M2 6.25h4.75M2 9.75h4.75" {...s} />
      <path d="M9.25 6.25H14M9.25 9.75H14" {...s} />
      <path d="M6.75 5v6M9.25 5v6" {...s} />
    </Svg>
  );
}

/** Bowtie / hourglass mark on an edit-point transition. */
export function IconTransitionBowtie({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M3.2 3.4 8 8 3.2 12.6ZM12.8 3.4 8 8 12.8 12.6Z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function IconFilters({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="6" cy="6.7" r="3.05" {...s} />
      <circle cx="10" cy="6.7" r="3.05" {...s} />
      <circle cx="8" cy="10.05" r="3.05" {...s} />
    </Svg>
  );
}

export function IconPlay({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M5.4 3.6v8.8L12.4 8 5.4 3.6Z" fill="currentColor" />
    </Svg>
  );
}

export function IconPause({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="4.2" y="3.6" width="2.4" height="8.8" rx="0.4" fill="currentColor" />
      <rect x="9.4" y="3.6" width="2.4" height="8.8" rx="0.4" fill="currentColor" />
    </Svg>
  );
}

export function IconFullscreen({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 5.5V2.5h3M13.5 5.5V2.5h-3M2.5 10.5v3h3M13.5 10.5v3h-3" {...s} />
    </Svg>
  );
}

export function IconSkipBack({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.4 4v8" {...s} />
      <path d="M12.4 4.2 6.6 8l5.8 3.8V4.2Z" fill="currentColor" />
    </Svg>
  );
}

export function IconSkipForward({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12.6 4v8" {...s} />
      <path d="M3.6 4.2 9.4 8l-5.8 3.8V4.2Z" fill="currentColor" />
    </Svg>
  );
}

export function IconCheck({ size = 12, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3.5 8.2 6.4 11l6.1-6.5" {...s} />
    </Svg>
  );
}

export function IconChevronDown({ size = 12, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M4 6l4 4 4-4" {...s} />
    </Svg>
  );
}

export function IconChevronRight({ size = 12, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6 4l4 4-4 4" {...s} />
    </Svg>
  );
}

export function IconMic({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="6" y="2.5" width="4" height="7" rx="2" {...s} />
      <path d="M4.5 8.5a3.5 3.5 0 0 0 7 0" {...s} />
      <path d="M8 12v1.5M5.5 13.5h5" {...s} />
    </Svg>
  );
}

export function IconAlignLeft({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 3h11" {...s} />
      <path d="M2.5 8h7" {...s} />
      <path d="M2.5 13h9" {...s} />
    </Svg>
  );
}

export function IconAlignCenter({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 3h10" {...s} />
      <path d="M5 8h6" {...s} />
      <path d="M4 13h8" {...s} />
    </Svg>
  );
}

export function IconAlignRight({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 3h11" {...s} />
      <path d="M6.5 8h7" {...s} />
      <path d="M4.5 13h9" {...s} />
    </Svg>
  );
}

export function IconAlignTop({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 2.5v11" {...s} />
      <path d="M8 2.5v7" {...s} />
      <path d="M13 2.5v9" {...s} />
    </Svg>
  );
}

export function IconAlignMiddle({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 3v10" {...s} />
      <path d="M8 5v6" {...s} />
      <path d="M13 4v8" {...s} />
    </Svg>
  );
}

export function IconAlignBottom({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M3 2.5v11" {...s} />
      <path d="M8 6.5v7" {...s} />
      <path d="M13 4.5v9" {...s} />
    </Svg>
  );
}

export function IconLink({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M6.8 9.2a2.6 2.6 0 0 1 0-3.7l1.5-1.5a2.6 2.6 0 1 1 3.7 3.7L11 8.7"
        {...s}
      />
      <path
        d="M9.2 6.8a2.6 2.6 0 0 1 0 3.7L7.7 12a2.6 2.6 0 1 1-3.7-3.7L5 7.3"
        {...s}
      />
    </Svg>
  );
}

export function IconEyedropper({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path
        d="M11.2 2.4l2.4 2.4-1.1 1.1-2.4-2.4 1.1-1.1z"
        {...s}
      />
      <path d="M10.1 3.5L4.2 9.4l-.9 3.3 3.3-.9 5.9-5.9" {...s} />
      <path d="M3.8 12.2l1.2-1.2" {...s} />
    </Svg>
  );
}

export function IconCrop({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6 2v12h12" {...s} />
      <path d="M2 6h12v12" {...s} />
    </Svg>
  );
}

export function IconRotate({ size = 14, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12.5 8a4.5 4.5 0 1 0-1.4 3.2" {...s} />
      <path d="M12.5 5.2V8H9.7" {...s} />
    </Svg>
  );
}
