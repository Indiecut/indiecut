/**
 * Bundled + system font registry for text clips.
 * Faces load via FontFace on main and in preview/export workers.
 */

import antonRegular from "../../assets/fonts/Anton-Regular.woff2?url";
import bangersRegular from "../../assets/fonts/Bangers-Regular.woff2?url";
import comicNeueBold from "../../assets/fonts/ComicNeue-Bold.woff2?url";
import comicNeueBoldItalic from "../../assets/fonts/ComicNeue-BoldItalic.woff2?url";
import fredokaBold from "../../assets/fonts/Fredoka-Bold.woff2?url";
import fredokaMedium from "../../assets/fonts/Fredoka-Medium.woff2?url";
import interBold from "../../assets/fonts/Inter-Bold.woff2?url";
import interBoldItalic from "../../assets/fonts/Inter-BoldItalic.woff2?url";
import interItalic from "../../assets/fonts/Inter-Italic.woff2?url";
import interRegular from "../../assets/fonts/Inter-Regular.woff2?url";
import interSemiBold from "../../assets/fonts/Inter-SemiBold.woff2?url";
import montserratBlack from "../../assets/fonts/Montserrat-Black.woff2?url";
import montserratBold from "../../assets/fonts/Montserrat-Bold.woff2?url";
import montserratBoldItalic from "../../assets/fonts/Montserrat-BoldItalic.woff2?url";
import pacificoRegular from "../../assets/fonts/Pacifico-Regular.woff2?url";
import permanentMarkerRegular from "../../assets/fonts/PermanentMarker-Regular.woff2?url";
import playfairBold from "../../assets/fonts/PlayfairDisplay-Bold.woff2?url";
import playfairBoldItalic from "../../assets/fonts/PlayfairDisplay-BoldItalic.woff2?url";
import pressStart2PRegular from "../../assets/fonts/PressStart2P-Regular.woff2?url";
import rubikMonoOneRegular from "../../assets/fonts/RubikMonoOne-Regular.woff2?url";
import spaceGroteskBold from "../../assets/fonts/SpaceGrotesk-Bold.woff2?url";
import spaceGroteskMedium from "../../assets/fonts/SpaceGrotesk-Medium.woff2?url";

export type FontFaceFile = {
  weight: number | string;
  style: "normal" | "italic";
  url: string;
};

export type TextFontEntry = {
  id: string;
  /** CSS family name registered with FontFace (bundled) or stack head. */
  family: string;
  /** Value stored on clip.text.fontFamily */
  stack: string;
  label: string;
  system?: boolean;
  files: FontFaceFile[];
};

export const TEXT_FONTS: TextFontEntry[] = [
  {
    id: "system-ui",
    family: "system-ui",
    stack: "system-ui, sans-serif",
    label: "System UI",
    system: true,
    files: [],
  },
  {
    id: "georgia",
    family: "Georgia",
    stack: "Georgia, serif",
    label: "Georgia",
    system: true,
    files: [],
  },
  {
    id: "menlo",
    family: "Menlo",
    stack: "Menlo, monospace",
    label: "Menlo",
    system: true,
    files: [],
  },
  {
    id: "helvetica",
    family: "Helvetica Neue",
    stack: "Helvetica Neue, Helvetica, Arial, sans-serif",
    label: "Helvetica Neue",
    system: true,
    files: [],
  },
  {
    id: "inter",
    family: "Inter",
    stack: "Inter, sans-serif",
    label: "Inter (Modern Sans)",
    files: [
      { weight: 400, style: "normal", url: interRegular },
      { weight: 600, style: "normal", url: interSemiBold },
      { weight: 700, style: "normal", url: interBold },
      { weight: 400, style: "italic", url: interItalic },
      { weight: 700, style: "italic", url: interBoldItalic },
    ],
  },
  {
    id: "bangers",
    family: "Bangers",
    stack: "Bangers, system-ui, sans-serif",
    label: "Bangers (Comic Burst)",
    files: [{ weight: 400, style: "normal", url: bangersRegular }],
  },
  {
    id: "fredoka",
    family: "Fredoka",
    stack: "Fredoka, system-ui, sans-serif",
    label: "Fredoka (Bubble Round)",
    files: [
      { weight: 500, style: "normal", url: fredokaMedium },
      { weight: 700, style: "normal", url: fredokaBold },
    ],
  },
  {
    id: "anton",
    family: "Anton",
    stack: "Anton, system-ui, sans-serif",
    label: "Anton (Bold Impact)",
    files: [{ weight: 400, style: "normal", url: antonRegular }],
  },
  {
    id: "permanent-marker",
    family: "Permanent Marker",
    stack: "Permanent Marker, system-ui, sans-serif",
    label: "Permanent Marker (Street)",
    files: [{ weight: 400, style: "normal", url: permanentMarkerRegular }],
  },
  {
    id: "comic-neue",
    family: "Comic Neue",
    stack: "Comic Neue, system-ui, sans-serif",
    label: "Comic Neue (Dialog)",
    files: [
      { weight: 700, style: "normal", url: comicNeueBold },
      { weight: 700, style: "italic", url: comicNeueBoldItalic },
    ],
  },
  {
    id: "montserrat",
    family: "Montserrat",
    stack: "Montserrat, system-ui, sans-serif",
    label: "Montserrat (Trending)",
    files: [
      { weight: 700, style: "normal", url: montserratBold },
      { weight: 900, style: "normal", url: montserratBlack },
      { weight: 700, style: "italic", url: montserratBoldItalic },
    ],
  },
  {
    id: "rubik-mono-one",
    family: "Rubik Mono One",
    stack: "Rubik Mono One, system-ui, sans-serif",
    label: "Rubik Mono One (Chunky)",
    files: [{ weight: 400, style: "normal", url: rubikMonoOneRegular }],
  },
  {
    id: "pacifico",
    family: "Pacifico",
    stack: "Pacifico, system-ui, sans-serif",
    label: "Pacifico (Brush Script)",
    files: [{ weight: 400, style: "normal", url: pacificoRegular }],
  },
  {
    id: "press-start-2p",
    family: "Press Start 2P",
    stack: "Press Start 2P, system-ui, monospace",
    label: "Press Start 2P (Pixel)",
    files: [{ weight: 400, style: "normal", url: pressStart2PRegular }],
  },
  {
    id: "playfair-display",
    family: "Playfair Display",
    stack: "Playfair Display, Georgia, serif",
    label: "Playfair Display (Editorial)",
    files: [
      { weight: 700, style: "normal", url: playfairBold },
      { weight: 700, style: "italic", url: playfairBoldItalic },
    ],
  },
  {
    id: "space-grotesk",
    family: "Space Grotesk",
    stack: "Space Grotesk, system-ui, sans-serif",
    label: "Space Grotesk (Tech)",
    files: [
      { weight: 500, style: "normal", url: spaceGroteskMedium },
      { weight: 700, style: "normal", url: spaceGroteskBold },
    ],
  },
];

/** Stacks for `<select>` / mask panel (system + curated). */
export const FONT_OPTIONS: string[] = TEXT_FONTS.map((f) => f.stack);

const RECENT_KEY = "indiecut.textFonts.recent";
const RECENT_MAX = 6;

let loadPromise: Promise<void> | null = null;

function fontsSource(): FontFaceSet | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as typeof globalThis & { fonts?: FontFaceSet };
  return g.fonts ?? null;
}

/** Load all bundled faces into this context's FontFaceSet (idempotent). */
export function ensureTextFontsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const set = fontsSource();
    if (!set || typeof FontFace === "undefined") return;

    const tasks: Promise<FontFace>[] = [];
    for (const entry of TEXT_FONTS) {
      for (const file of entry.files) {
        const face = new FontFace(entry.family, `url(${file.url})`, {
          weight: String(file.weight),
          style: file.style,
          display: "swap",
        });
        tasks.push(
          face.load().then((loaded) => {
            set.add(loaded);
            return loaded;
          }),
        );
      }
    }
    await Promise.all(tasks);
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

export function findFontByStack(stack: string | undefined): TextFontEntry | undefined {
  if (!stack) return TEXT_FONTS[0];
  return (
    TEXT_FONTS.find((f) => f.stack === stack) ||
    TEXT_FONTS.find((f) => f.family === stack) ||
    TEXT_FONTS.find((f) => stack.startsWith(f.family))
  );
}

export function getRecentFontStacks(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string")
      .filter((s) => TEXT_FONTS.some((f) => f.stack === s))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberFontStack(stack: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const next = [
      stack,
      ...getRecentFontStacks().filter((s) => s !== stack),
    ].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}
