/**
 * Regenerates assets/text-templates/manifest.json (v4, 500 rich-run templates).
 * Usage: node scripts/generate-rich-text-templates.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../assets/text-templates/manifest.json");

const FONTS = {
  inter: "Inter, sans-serif",
  montserrat: "Montserrat, system-ui, sans-serif",
  playfair: "Playfair Display, Georgia, serif",
  space: "Space Grotesk, system-ui, sans-serif",
  pacifico: "Pacifico, system-ui, sans-serif",
  anton: "Anton, system-ui, sans-serif",
  bangers: "Bangers, system-ui, sans-serif",
  fredoka: "Fredoka, system-ui, sans-serif",
  marker: "Permanent Marker, system-ui, sans-serif",
  comic: "Comic Neue, system-ui, sans-serif",
  rubik: "Rubik Mono One, system-ui, sans-serif",
  press: "Press Start 2P, system-ui, sans-serif",
};

const COUNTS = {
  title: 70,
  social: 80,
  vlog: 70,
  outro: 55,
  promo: 65,
  lower: 55,
  gaming: 55,
  caption: 50,
};

const ANIMS = [
  { in: { presetId: "pop_up", durationMs: 450 } },
  { in: { presetId: "fade_in", durationMs: 500 } },
  { in: { presetId: "slide", durationMs: 480, direction: "up" } },
  { in: { presetId: "bounce_in", durationMs: 550 } },
  { in: { presetId: "typewriter", durationMs: 900 } },
  { in: { presetId: "zoom_in", durationMs: 420 } },
  undefined,
  undefined,
];

function grad(a, from, to) {
  return `linear-gradient(${a}deg, ${from} 0%, ${to} 100%)`;
}

function run(text, style) {
  return { text, style };
}

function bubble(type, fill, stroke, strokeWidth = 3, padX = 28, padY = 14) {
  return { type, fill, stroke, strokeWidth, paddingX: padX, paddingY: padY };
}

const PATTERNS = [
  // accent word
  (words, fonts, colors) => ({
    runs: [
      run(words[0] + " ", {
        fontFamily: fonts[0],
        fontSize: 42,
        fontWeight: 800,
        color: colors[0],
      }),
      run(words.slice(1).join(" "), {
        fontFamily: fonts[1],
        fontSize: 42,
        fontWeight: 600,
        color: colors[1],
      }),
    ],
  }),
  // gradient title
  (words, fonts, colors) => ({
    runs: [
      run(words.join(" "), {
        fontFamily: fonts[0],
        fontSize: 56,
        fontWeight: 900,
        color: colors[0],
        gradient: grad(90, colors[0], colors[1]),
      }),
    ],
  }),
  // highlight chip
  (words, fonts, colors) => ({
    runs: [
      run(words[0], {
        fontFamily: fonts[0],
        fontSize: 36,
        fontWeight: 800,
        color: "#0f172a",
        highlight: colors[2] || "#facc15",
      }),
      run(" " + words.slice(1).join(" "), {
        fontFamily: fonts[1],
        fontSize: 36,
        fontWeight: 600,
        color: colors[1],
      }),
    ],
  }),
  // hollow outline accent
  (words, fonts, colors) => ({
    runs: [
      run(words[0] + "\n", {
        fontFamily: fonts[0],
        fontSize: 48,
        fontWeight: 900,
        color: "transparent",
        strokeColor: colors[0],
        strokeWidth: 2.5,
      }),
      run(words.slice(1).join(" "), {
        fontFamily: fonts[1],
        fontSize: 28,
        fontWeight: 600,
        color: colors[1],
      }),
    ],
  }),
  // editorial italic mix
  (words, fonts, colors) => ({
    runs: [
      run(words[0] + " ", {
        fontFamily: FONTS.playfair,
        fontSize: 44,
        fontWeight: 700,
        fontStyle: "italic",
        color: colors[0],
      }),
      run(words.slice(1).join(" "), {
        fontFamily: fonts[0],
        fontSize: 32,
        fontWeight: 600,
        color: colors[1],
        letterSpacing: 2,
      }),
    ],
  }),
  // neon glow word
  (words, fonts, colors) => ({
    runs: [
      run(words.join(" "), {
        fontFamily: fonts[0],
        fontSize: 40,
        fontWeight: 800,
        color: colors[0],
        strokeColor: colors[1],
        strokeWidth: 1,
      }),
    ],
  }),
  // two-line stacked
  (words, fonts, colors) => {
    const mid = Math.max(1, Math.ceil(words.length / 2));
    return {
      runs: [
        run(words.slice(0, mid).join(" ") + "\n", {
          fontFamily: fonts[0],
          fontSize: 38,
          fontWeight: 900,
          color: colors[0],
          gradient: grad(180, colors[0], colors[1]),
        }),
        run(words.slice(mid).join(" "), {
          fontFamily: fonts[1],
          fontSize: 24,
          fontWeight: 600,
          color: colors[2] || colors[1],
          letterSpacing: 3,
          textTransform: "uppercase",
        }),
      ],
    };
  },
  // marker + outline
  (words, fonts, colors) => ({
    runs: [
      run(words[0] + " ", {
        fontFamily: FONTS.marker,
        fontSize: 40,
        fontWeight: 700,
        color: colors[0],
      }),
      run(words.slice(1).join(" "), {
        fontFamily: fonts[0],
        fontSize: 34,
        fontWeight: 800,
        color: colors[1],
        strokeColor: "#000000",
        strokeWidth: 2,
      }),
    ],
  }),
];

const WORD_BANK = {
  title: [
    ["OPENING", "TITLE"],
    ["CHAPTER", "ONE"],
    ["THE", "STORY"],
    ["BIG", "REVEAL"],
    ["WELCOME", "HOME"],
    ["NEW", "BEGINNING"],
    ["MAIN", "EVENT"],
    ["TONIGHT"],
    ["FEATURED"],
    ["PREMIERE"],
  ],
  social: [
    ["SUBSCRIBE"],
    ["LIKE", "&", "FOLLOW"],
    ["COMMENT", "BELOW"],
    ["SHARE", "THIS"],
    ["FOLLOW", "ME"],
    ["HIT", "THE", "BELL"],
    ["JOIN", "US"],
    ["NEW", "VIDEO"],
    ["DONT", "MISS"],
    ["TAP", "HERE"],
  ],
  vlog: [
    ["DAY", "IN", "MY", "LIFE"],
    ["MORNING", "ROUTINE"],
    ["BEHIND", "THE", "SCENES"],
    ["TRAVEL", "DIARY"],
    ["WEEKEND", "VIBES"],
    ["REAL", "TALK"],
    ["ON", "THE", "ROAD"],
    ["CITY", "WALK"],
    ["FOOD", "TOUR"],
    ["GRWM"],
  ],
  outro: [
    ["THANKS", "FOR", "WATCHING"],
    ["SEE", "YOU", "NEXT"],
    ["THE", "END"],
    ["MORE", "SOON"],
    ["STAY", "TUNED"],
    ["GOODBYE"],
    ["WATCH", "NEXT"],
    ["CREDITS"],
    ["FIN"],
    ["OUTRO"],
  ],
  promo: [
    ["SALE", "NOW"],
    ["LIMITED", "OFFER"],
    ["NEW", "DROP"],
    ["GET", "YOURS"],
    ["FREE", "SHIPPING"],
    ["50%", "OFF"],
    ["LAUNCH", "DAY"],
    ["SHOP", "NOW"],
    ["EXCLUSIVE"],
    ["DEAL"],
  ],
  lower: [
    ["ALEX", "CHEN"],
    ["HOST"],
    ["GUEST", "STAR"],
    ["LIVE", "NOW"],
    ["BREAKING"],
    ["REPORTER"],
    ["CEO"],
    ["SPECIAL", "GUEST"],
    ["CORRESPONDENT"],
    ["ANCHOR"],
  ],
  gaming: [
    ["GG"],
    ["VICTORY", "ROYALE"],
    ["LEVEL", "UP"],
    ["BOSS", "FIGHT"],
    ["CLUTCH"],
    ["GAME", "OVER"],
    ["NEW", "HIGH", "SCORE"],
    ["TEAM", "WIPE"],
    ["EPIC", "WIN"],
    ["STREAM", "LIVE"],
  ],
  caption: [
    ["AND", "THEN..."],
    ["WAIT", "FOR", "IT"],
    ["NO", "WAY"],
    ["SERIOUSLY?"],
    ["HERE", "WE", "GO"],
    ["PLOT", "TWIST"],
    ["THAT", "HAPPENED"],
    ["SAY", "WHAT?"],
    ["OH", "NO"],
    ["LETS", "GO"],
  ],
};

const COLOR_SETS = [
  ["#f8fafc", "#38bdf8", "#facc15"],
  ["#ffffff", "#f472b6", "#a78bfa"],
  ["#fef3c7", "#f59e0b", "#ef4444"],
  ["#ecfdf5", "#34d399", "#059669"],
  ["#e0f2fe", "#0ea5e9", "#0369a1"],
  ["#fce7f3", "#ec4899", "#be185d"],
  ["#f5f3ff", "#8b5cf6", "#4c1d95"],
  ["#fff7ed", "#fb923c", "#c2410c"],
  ["#18181b", "#facc15", "#ffffff"],
  ["#0f172a", "#22d3ee", "#f472b6"],
];

const FONT_PAIRS = [
  [FONTS.montserrat, FONTS.inter],
  [FONTS.anton, FONTS.space],
  [FONTS.bangers, FONTS.fredoka],
  [FONTS.playfair, FONTS.inter],
  [FONTS.space, FONTS.montserrat],
  [FONTS.pacifico, FONTS.inter],
  [FONTS.rubik, FONTS.space],
  [FONTS.fredoka, FONTS.comic],
  [FONTS.press, FONTS.rubik],
  [FONTS.marker, FONTS.montserrat],
];

const BUBBLES = [
  null,
  bubble("speech-round", "#ffffff", "#18181b"),
  bubble("pill", "#fef08a", "#854d0e", 2, 26, 10),
  bubble("rounded-rect", "#1e293b", "#38bdf8", 2, 24, 12),
  bubble("neon-frame", "#020617", "#22d3ee", 2, 22, 12),
  bubble("comic-burst", "#fde68a", "#b45309", 3, 30, 16),
  bubble("promo-badge", "#ef4444", "#ffffff", 2, 24, 10),
  bubble("thought-cloud", "#f8fafc", "#64748b", 2, 28, 16),
  null,
  null,
];

function slug(parts) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const templates = [];

for (const [category, count] of Object.entries(COUNTS)) {
  const bank = WORD_BANK[category];
  for (let i = 0; i < count; i++) {
    const words = bank[i % bank.length];
    const pattern = PATTERNS[i % PATTERNS.length];
    const colors = COLOR_SETS[i % COLOR_SETS.length];
    const fonts = FONT_PAIRS[i % FONT_PAIRS.length];
    const built = pattern(words, fonts, colors);
    const b = BUBBLES[i % BUBBLES.length];
    const anim = ANIMS[i % ANIMS.length];
    const nameBase = words.join(" ");
    const id = `tpl-${category}-${slug(words)}-${i + 1}`;
    const defaultText = built.runs.map((r) => r.text).join("");
    const firstStyle = built.runs[0]?.style ?? {};

    const recipe = {
      fontFamily: firstStyle.fontFamily ?? fonts[0],
      fontSize: firstStyle.fontSize ?? 40,
      fontWeight: firstStyle.fontWeight ?? 700,
      align: "center",
      color: firstStyle.color && firstStyle.color !== "transparent"
        ? firstStyle.color
        : colors[0],
      strokeColor: "#000000",
      strokeWidth: 0,
      shadowBlur: i % 3 === 0 ? 12 : 0,
      shadowOffsetX: 0,
      shadowOffsetY: i % 3 === 0 ? 4 : 0,
      shadowColor: i % 3 === 0 ? "rgba(0,0,0,0.45)" : undefined,
      retro3DColor: i % 11 === 0 ? "#7c2d12" : null,
      gradient: null,
      lineHeight: defaultText.includes("\n") ? 1.1 : 1.15,
      letterSpacing: 0,
      bubble: b ?? {
        type: "none",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 0,
        paddingX: 12,
        paddingY: 8,
      },
    };

    const entry = {
      id,
      name: `${nameBase}${i >= bank.length ? ` ${Math.floor(i / bank.length) + 1}` : ""}`,
      category,
      defaultText,
      defaultRuns: built.runs,
      recipe,
    };
    if (anim) entry.defaultAnimation = anim;
    templates.push(entry);
  }
}

const manifest = {
  version: 4,
  source: "IndieCut rich-run text templates",
  license: "IndieCut",
  templates,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${templates.length} templates → ${outPath}`);
