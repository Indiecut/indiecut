import { PALETTES, type KineticPalette } from './palettes';
import type {
  KineticBacking,
  KineticRenderOptions,
  KineticStickerDef,
} from './types';

export type KineticStickerRenderInput = KineticStickerDef & {
  /** 1-based index within category (from HTML suite). */
  catIndex: number;
  /** Numeric id 1..500 (from HTML suite). */
  numericId: number;
};

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
 export function getRoleColor(role: string, pal: KineticPalette): string {
  switch (role) {
    case 'PRIMARY': return pal.primary;
    case 'SECONDARY': return pal.secondary;
    case 'ACCENT': return pal.accent;
    case 'MINT': return pal.mint;
    case 'CYAN': return pal.cyan;
    case 'ORANGE': return pal.orange;
    case 'PURPLE': return pal.purple;
    case 'LIGHT': return pal.light;
    default: return pal.primary;
  }
}
 // Helper decorative flourishes based on sticker ID so every sticker has bespoke micro-details
export function renderDecorativeAccents(
  sticker: KineticStickerRenderInput,
  pal: KineticPalette,
  sw: number,
): string {
  const seed = sticker.numericId;
  const c1 = pal.accent;
  const c2 = pal.light;
  const mod = seed % 6;
  if (mod === 0) {
    return `
      <path d="M28 42 L33 30 L38 42 L50 47 L38 52 L33 64 L28 52 L16 47 Z" fill="${c1}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
      <circle cx="222" cy="48" r="6" fill="${c2}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
      <circle cx="36" cy="212" r="5" fill="${pal.cyan}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
    `;
  } else if (mod === 1) {
    return `
      <g stroke="${c1}" stroke-width="${sw * 1.1}" stroke-linecap="round">
        <line x1="22" y1="45" x2="36" y2="55"/>
        <line x1="34" y1="28" x2="44" y2="42"/>
        <line x1="232" y1="205" x2="218" y2="195"/>
        <line x1="220" y1="222" x2="210" y2="208"/>
      </g>
    `;
  } else if (mod === 2) {
    return `
      <path d="M218 32 L222 42 L232 46 L222 50 L218 60 L214 50 L204 46 L214 42 Z" fill="${c2}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
      <rect x="24" y="198" width="12" height="12" rx="3" transform="rotate(20 30 204)" fill="${c1}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
    `;
  } else if (mod === 3) {
    return `
      <circle cx="32" cy="42" r="7" fill="${pal.primary}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
      <path d="M215 202 L228 215 M228 202 L215 215" stroke="${c1}" stroke-width="${sw}" stroke-linecap="round"/>
    `;
  } else if (mod === 4) {
    return `
      <polygon points="32,28 40,44 24,44" fill="${c1}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
      <circle cx="224" cy="206" r="6" fill="${pal.mint}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
    `;
  } else {
    return `
      <circle cx="220" cy="40" r="5" fill="${c1}" stroke="${pal.stroke}" stroke-width="${sw * 0.5}"/>
      <circle cx="34" cy="214" r="7" fill="${c2}" stroke="${pal.stroke}" stroke-width="${sw * 0.5}"/>
    `;
  }
}
 // Helper: Pure graphical center emblem generator (zero text) for versatile badge/icon differentiation
export function renderPureGraphicSymbol(
  index: number,
  pal: KineticPalette,
  mainColor: string,
  sw: number,
): string {
  const v = index % 12;
  if (v === 0) {
    // Play Triangle
    return `<polygon points="108,92 108,164 166,128" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else if (v === 1) {
    // Heart Icon
    return `<path d="M128 168 C128 168 78 134 78 100 C78 82 94 70 110 70 C120 70 126 77 128 84 C130 77 136 70 146 70 C162 70 178 82 178 100 C178 134 128 168 128 168 Z" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else if (v === 2) {
    // Lightning Bolt
    return `<polygon points="138,68 92,132 128,132 114,188 168,120 130,120" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else if (v === 3) {
    // 5-Point Star
    return `<polygon points="128,72 142,108 180,110 150,134 160,172 128,150 96,172 106,134 76,110 114,108" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else if (v === 4) {
    // Checkmark Seal
    return `<path d="M92 128 L118 154 L168 98" fill="none" stroke="${pal.light}" stroke-width="${sw * 2.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (v === 5) {
    // Notification Bell
    return `
      <path d="M128 76 C108 76 96 92 96 114 L96 136 L84 148 L172 148 L160 136 L160 114 C160 92 148 76 128 76 Z" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
      <circle cx="128" cy="158" r="10" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
    `;
  } else if (v === 6) {
    // Crown
    return `<polygon points="82,154 92,96 128,124 164,96 174,154" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  } else if (v === 7) {
    // Thumbs Up Graphic
    return `
      <rect x="84" y="116" width="24" height="44" rx="4" fill="${pal.secondary}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
      <path d="M108 116 L126 80 C134 80 140 88 136 98 L132 112 L164 112 C172 112 176 120 172 128 L164 154 C160 158 154 160 146 160 L108 160 Z" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
    `;
  } else if (v === 8) {
    // Speaker Audio Waves
    return `
      <polygon points="88,112 112,112 136,88 136,168 112,144 88,144" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
      <path d="M150 106 Q166 128 150 150 M164 92 Q188 128 164 164" fill="none" stroke="${pal.accent}" stroke-width="${sw}" stroke-linecap="round"/>
    `;
  } else if (v === 9) {
    // Diamond Gem
    return `
      <polygon points="96,92 160,92 182,118 128,172 74,118" fill="${pal.cyan}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
      <polyline points="74,118 182,118 M112,92 102,118 128,172 154,118 144,92" fill="none" stroke="${pal.stroke}" stroke-width="${sw * 0.6}" stroke-linejoin="round"/>
    `;
  } else if (v === 10) {
    // Studio Microphone
    return `
      <rect x="112" y="80" width="32" height="52" rx="16" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}"/>
      <path d="M98 114 C98 134 158 134 158 114" fill="none" stroke="${pal.accent}" stroke-width="${sw}" stroke-linecap="round"/>
      <line x1="128" y1="142" x2="128" y2="166" stroke="${pal.light}" stroke-width="${sw}" stroke-linecap="round"/>
      <line x1="108" y1="166" x2="148" y2="166" stroke="${pal.light}" stroke-width="${sw}" stroke-linecap="round"/>
    `;
  } else {
    // Rocket Icon
    return `
      <path d="M128 72 C152 96 156 132 146 154 L110 154 C100 132 104 96 128 72 Z" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
      <polygon points="110,134 90,158 110,154" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.7}" stroke-linejoin="round"/>
      <polygon points="146,134 166,158 146,154" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.7}" stroke-linejoin="round"/>
      <circle cx="128" cy="116" r="10" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
    `;
  }
}
 // Core SVG Generator Function for any sticker — 100% TEXT-FREE PURE GRAPHICAL VECTORS
function generateStickerSVGCore(
  sticker: KineticStickerRenderInput,
  options: KineticRenderOptions & { size?: number } = {},
) {
  const pal = PALETTES[options.paletteKey ?? 'vibrant'] ?? PALETTES.vibrant;
  const backing: KineticBacking = options.backingMode ?? 'diecut';
  const strokeScale = Number(options.strokeScale ?? 1);
  const exportSize = options.size || 512;
   const mainColor = getRoleColor(sticker.colorRole, pal);
  const sw = +(4.2 * strokeScale).toFixed(2);
  const uid = `stk_${sticker.numericId}`;
  const idx = sticker.catIndex;
   // Filter defs based on Die-Cut / Flat / Glow mode
  let defs = `
    <defs>
      <linearGradient id="${uid}_grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${mainColor}" />
        <stop offset="100%" stop-color="${pal.secondary}" />
      </linearGradient>
      <linearGradient id="${uid}_shine" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0" />
      </linearGradient>
  `;
   if (backing === 'diecut') {
    defs += `
      <filter id="${uid}_fx" x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="dilated"/>
        <feFlood flood-color="#FFFFFF" result="white"/>
        <feComposite in="white" in2="dilated" operator="in" result="outline"/>
        <feDropShadow in="outline" dx="0" dy="6" stdDeviation="5" flood-color="#000000" flood-opacity="0.55" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="outline"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
  } else if (backing === 'glow') {
    defs += `
      <filter id="${uid}_fx" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="${mainColor}" flood-opacity="0.85"/>
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.7"/>
      </filter>
    `;
  } else {
    defs += `
      <filter id="${uid}_fx" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    `;
  }
  defs += `</defs>`;
   let body = '';
  const t = sticker.template;
   // =========================================================================
  // CATEGORY 1: SOCIAL & CREATOR ICONS (100% TEXT-FREE)
  // =========================================================================
  if (sticker.category === 'social') {
    if (t === 'sub-pill' || t === 'like-sub' || t === 'follow-pill' || t === 'outro-thanks') {
      // Pure Graphic Play / Subscribe Button Bar with UI Bars & Click Cursor (Zero Text)
      body = `
        <rect x="24" y="82" width="212" height="96" rx="26" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <rect x="18" y="74" width="212" height="96" rx="26" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <rect x="24" y="80" width="200" height="42" rx="18" fill="url(#${uid}_shine)"/>
        <!-- Left Play Emblem -->
        <circle cx="68" cy="122" r="28" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}"/>
        <polygon points="60,107 60,137 84,122" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.65}" stroke-linejoin="round"/>
        <!-- Graphic UI Equalizer / Skeleton Bars (Instead of Text) -->
        <rect x="110" y="102" width="84" height="16" rx="8" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.65}"/>
        <rect x="110" y="128" width="56" height="12" rx="6" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.6}"/>
        <!-- Pointer Hand / Cursor Click -->
        <circle cx="202" cy="158" r="20" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.75}"/>
        <polygon points="196,148 196,170 203,164 209,174 214,171 208,161 216,159" fill="${pal.dark}"/>
      `;
    } else if (t === 'bell-ring' || t === 'alerts-on') {
      // Pure Graphic Ringing Notification Bell
      body = `
        <circle cx="128" cy="128" r="88" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <circle cx="128" cy="122" r="82" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <!-- Sonic Ring Arcs -->
        <path d="M58 84 Q38 118 58 152" fill="none" stroke="${pal.light}" stroke-width="${sw * 1.2}" stroke-linecap="round"/>
        <path d="M198 84 Q218 118 198 152" fill="none" stroke="${pal.light}" stroke-width="${sw * 1.2}" stroke-linecap="round"/>
        <!-- Bell Body -->
        <g transform="rotate(${idx % 2 === 0 ? -8 : 8} 128 122)">
          <circle cx="128" cy="60" r="10" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
          <path d="M128 68 C98 68 84 90 84 122 L84 148 L68 164 L188 164 L172 148 L172 122 C172 90 158 68 128 68 Z" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="128" cy="176" r="14" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}"/>
        </g>
      `;
    } else if (t === 'double-tap' || t === 'super-thanks') {
      // Pure Graphic Double-Tap Heart Ripple
      body = `
        <circle cx="128" cy="128" r="90" fill="none" stroke="${pal.accent}" stroke-width="${sw}" stroke-dasharray="16 10"/>
        <circle cx="128" cy="128" r="72" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <path d="M128 190 C128 190 48 140 48 90 C48 62 72 44 98 44 C114 44 124 54 128 64 C132 54 142 44 158 44 C184 44 208 62 208 90 C208 140 128 190 128 190 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M78 74 C68 82 66 96 72 106" fill="none" stroke="${pal.light}" stroke-width="${sw * 1.1}" stroke-linecap="round"/>
        <circle cx="182" cy="174" r="22" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
        <path d="M174 174 L180 180 L192 168" fill="none" stroke="${pal.dark}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else {
      // Pure Graphic Creator Icon Medallion / Shield (12 distinct icon variations)
      const rotAngle = (idx % 3 - 1) * 4;
      body = `
        <g transform="rotate(${rotAngle} 128 128)">
          <rect x="40" y="44" width="176" height="176" rx="${idx % 2 === 0 ? 42 : 88}" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
          <rect x="34" y="36" width="176" height="176" rx="${idx % 2 === 0 ? 42 : 88}" fill="url(#${uid}_grad)" stroke="${pal.stroke}" stroke-width="${sw}"/>
          <rect x="48" y="50" width="148" height="148" rx="${idx % 2 === 0 ? 30 : 74}" fill="none" stroke="${pal.light}" stroke-width="2.5" stroke-dasharray="10 8" opacity="0.65"/>
          ${renderPureGraphicSymbol(idx, pal, mainColor, sw)}
        </g>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 2: DIRECTIONAL & MOTION ARROWS (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'arrows') {
    let rot = ((idx - 1) * 15) % 360;
    if (t === 'dir-right') rot = 0;
    else if (t === 'dir-left' || t === 'uturn-left' || t === 'rw-arrow') rot = 180;
    else if (t === 'dir-up' || t === 'loop-up') rot = -90;
    else if (t === 'dir-down' || t === 'loop-down') rot = 90;
    else if (t === 'diag-nw') rot = -135;
    else if (t === 'diag-ne') rot = -45;
    else if (t === 'diag-sw') rot = 135;
    else if (t === 'diag-se') rot = 45;
     if (t.includes('curve') || t.includes('loop') || t.includes('scurve') || t.includes('wave') || t.includes('spring')) {
      const flip = (idx % 2 === 0) ? 'scale(1, -1) translate(0, -256)' : '';
      body = `
        <g transform="rotate(${rot} 128 128) ${flip}">
          <path d="M32 192 C42 78, 122 52, 202 98" fill="none" stroke="${pal.dark}" stroke-width="${sw * 4.4}" stroke-linecap="round"/>
          <path d="M32 184 C42 70, 122 44, 202 90" fill="none" stroke="${mainColor}" stroke-width="${sw * 3.2}" stroke-linecap="round"/>
          <path d="M32 184 C42 70, 122 44, 202 90" fill="none" stroke="${pal.light}" stroke-width="${sw * 0.9}" stroke-dasharray="14 10" stroke-linecap="round"/>
          <polygon points="234,108 176,54 188,96 156,124" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        </g>
      `;
    } else if (t.includes('chevron') || t.includes('ff-') || t.includes('rw-')) {
      body = `
        <g transform="rotate(${rot} 128 128)">
          <polygon points="36,58 96,128 36,198 70,198 130,128 70,58" fill="${pal.secondary}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <polygon points="92,58 152,128 92,198 126,198 186,128 126,58" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <polygon points="148,58 208,128 148,198 182,198 242,128 182,58" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        </g>
      `;
    } else if (t === 'circle-highlight' || t === 'target-arrow') {
      body = `
        <ellipse cx="128" cy="132" rx="88" ry="66" transform="rotate(-8 128 132)" fill="none" stroke="${mainColor}" stroke-width="${sw * 2.6}" stroke-linecap="round" stroke-dasharray="420 40"/>
        <ellipse cx="128" cy="132" rx="74" ry="52" transform="rotate(5 128 132)" fill="none" stroke="${pal.accent}" stroke-width="${sw * 1.2}" stroke-linecap="round" stroke-dasharray="18 14"/>
        <circle cx="128" cy="132" r="16" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
        <polygon points="196,64 234,36 218,84" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
      `;
    } else if (t === 'quad-in' || t === 'quad-out' || t.includes('zoom')) {
      body = `
        <g stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round" fill="${mainColor}">
          <polygon points="36,36 96,36 74,58 106,90 90,106 58,74 36,96"/>
          <polygon points="220,36 160,36 182,58 150,90 166,106 198,74 220,96"/>
          <polygon points="36,220 96,220 74,198 106,166 90,150 58,182 36,160"/>
          <polygon points="220,220 160,220 182,198 150,166 166,150 198,182 220,160"/>
        </g>
        <circle cx="128" cy="128" r="22" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}"/>
      `;
    } else {
      const isDashed = t.includes('dashed') || t.includes('dotted');
      body = `
        <g transform="rotate(${rot} 128 128)">
          <path d="M28 106 L138 106 L138 62 L232 134 L138 206 L138 162 L28 162 Z" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <path d="M22 96 L132 96 L132 52 L226 124 L132 196 L132 152 L22 152 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round" ${isDashed ? 'stroke-dasharray="14 8"' : ''}/>
          <path d="M40 114 L142 114 L142 92 L188 124 L142 156 L142 134 L40 134 Z" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.65}" stroke-linejoin="round"/>
        </g>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 3: COMIC & SFX ACTION BURSTS (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'sfx') {
    if (t === 'sfx-cloud') {
      // Pure Graphic Comic Dust / Explosion Puff Cloud with Energy Core
      body = `
        <path d="M54 166 C24 166 16 134 38 114 C24 84 58 56 90 70 C108 40 156 40 172 70 C206 58 232 90 214 118 C236 142 218 176 186 172 C170 196 128 196 112 178 C86 194 58 186 54 166 Z" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M68 154 C46 154 40 130 56 116 C46 94 72 74 96 84 C110 62 148 62 162 84 C186 76 204 100 192 120 C208 138 194 160 172 156" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
        <!-- Swirl & Star Core -->
        <polygon points="128,74 140,108 176,108 146,128 158,162 128,142 98,162 110,128 80,108 116,108" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/>
      `;
    } else if (t === 'sfx-bolt' || t === 'sfx-speed') {
      // Pure Graphic High-Voltage Lightning Strike Burst
      body = `
        <circle cx="128" cy="128" r="84" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <polygon points="128,22 152,68 204,48 182,98 234,122 184,152 204,204 152,184 128,234 104,184 52,204 72,152 22,122 74,98 52,48 104,68" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon points="148,32 76,136 126,136 102,224 184,116 132,116" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
      `;
    } else if (t === 'sfx-flame') {
      // Pure Graphic Fireball Impact Burst
      body = `
        <polygon points="128,16 158,64 214,36 192,90 242,114 196,148 228,200 172,186 154,240 128,194 102,240 84,186 28,200 60,148 14,114 64,90 42,36 98,64" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M128 48 C128 48 186 94 186 146 C186 180 160 206 128 206 C96 206 70 180 70 146 C70 118 90 96 90 96 C90 96 86 120 104 126 C96 92 128 48 128 48 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <circle cx="128" cy="156" r="26" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
      `;
    } else {
      // Pure Graphic Multi-Layered Comic Starburst Explosion
      body = `
        <polygon points="128,12 156,62 212,32 192,88 244,108 198,144 232,198 174,186 158,242 128,196 98,242 82,186 24,198 58,144 12,108 64,88 44,32 100,62" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon points="128,38 150,76 192,54 176,98 218,114 182,142 206,182 162,172 150,214 128,178 106,214 94,172 50,182 74,142 38,114 80,98 64,54 106,76" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon points="128,70 142,102 176,92 156,122 182,146 148,150 152,184 128,160 104,184 108,150 74,146 100,122 80,92 114,102" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 4: CAMERA, REC & CINEMA HUD (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'hud') {
    if (t === 'hud-rec') {
      // Pure Graphic Viewfinder Frame + Glowing Red Recording Beacon
      body = `
        <rect x="24" y="56" width="208" height="144" rx="22" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}"/>
        <path d="M44 96 L44 74 L66 74 M190 74 L212 74 L212 96 M44 160 L44 182 L66 182 M190 182 L212 182 L212 160" fill="none" stroke="${pal.accent}" stroke-width="${sw}" stroke-linecap="round"/>
        <circle cx="128" cy="128" r="38" fill="${mainColor}" stroke="${pal.light}" stroke-width="${sw}"/>
        <circle cx="116" cy="116" r="10" fill="#FFFFFF"/>
      `;
    } else if (t === 'hud-slate') {
      // Pure Graphic Clapperboard Slate
      body = `
        <rect x="32" y="92" width="192" height="128" rx="14" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}"/>
        <g transform="rotate(-10 36 88)">
          <rect x="32" y="54" width="192" height="34" rx="6" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}"/>
          <polygon points="56,54 84,54 68,88 40,88" fill="${pal.dark}"/>
          <polygon points="112,54 140,54 124,88 96,88" fill="${pal.dark}"/>
          <polygon points="168,54 196,54 180,88 152,88" fill="${pal.dark}"/>
        </g>
        <line x1="52" y1="132" x2="204" y2="132" stroke="${pal.light}" stroke-width="4" stroke-linecap="round"/>
        <line x1="52" y1="162" x2="156" y2="162" stroke="${pal.accent}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="184" cy="176" r="16" fill="${mainColor}" stroke="${pal.light}" stroke-width="3"/>
      `;
    } else if (t === 'hud-focus' || t === 'hud-reticle' || t === 'hud-grid' || t === 'hud-iris') {
      // Pure Graphic Camera Focus Crosshair & Aperture Ring
      body = `
        <rect x="28" y="28" width="200" height="200" rx="24" fill="${pal.dark}" fill-opacity="0.88" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <path d="M48 88 L48 48 L88 48 M168 48 L208 48 L208 88 M48 168 L48 208 L88 208 M168 208 L208 208 L208 168" fill="none" stroke="${mainColor}" stroke-width="${sw * 1.2}" stroke-linecap="round"/>
        <circle cx="128" cy="128" r="52" fill="none" stroke="${pal.accent}" stroke-width="${sw * 0.9}" stroke-dasharray="14 8"/>
        <circle cx="128" cy="128" r="24" fill="none" stroke="${pal.light}" stroke-width="3"/>
        <line x1="128" y1="60" x2="128" y2="196" stroke="${mainColor}" stroke-width="3"/>
        <line x1="60" y1="128" x2="196" y2="128" stroke="${mainColor}" stroke-width="3"/>
        <circle cx="128" cy="128" r="6" fill="${mainColor}"/>
      `;
    } else {
      // Pure Graphic Audio Meter / Histogram / Battery / Sensor HUD
      body = `
        <rect x="22" y="56" width="212" height="144" rx="20" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}"/>
        <!-- Equalizer / Spectrum Bars -->
        <g stroke="${pal.stroke}" stroke-width="2">
          <rect x="44" y="132" width="20" height="46" rx="4" fill="${pal.mint}"/>
          <rect x="72" y="104" width="20" height="74" rx="4" fill="${pal.mint}"/>
          <rect x="100" y="82" width="20" height="96" rx="4" fill="${pal.cyan}"/>
          <rect x="128" y="114" width="20" height="64" rx="4" fill="${pal.accent}"/>
          <rect x="156" y="90" width="20" height="88" rx="4" fill="${pal.accent}"/>
          <rect x="184" y="74" width="24" height="104" rx="4" fill="${mainColor}"/>
        </g>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 5: CALLOUTS, LOWER THIRDS & BADGES (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'callouts') {
    if (t === 'call-warn') {
      // Pure Graphic Hazard Warning Triangle
      body = `
        <polygon points="128,28 232,208 24,208" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 1.2}" stroke-linejoin="round"/>
        <polygon points="128,58 206,192 50,192" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/>
        <rect x="118" y="92" width="20" height="54" rx="10" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
        <circle cx="128" cy="168" r="11" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
      `;
    } else if (t === 'call-stars') {
      // Pure Graphic 5-Star Review Badge
      body = `
        <rect x="16" y="78" width="224" height="100" rx="28" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}"/>
        <g fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="2.5" stroke-linejoin="round">
          <polygon points="52,108 57,122 72,122 60,131 64,145 52,136 40,145 44,131 32,122 47,122"/>
          <polygon points="90,108 95,122 110,122 98,131 102,145 90,136 78,145 82,131 70,122 85,122"/>
          <polygon points="128,104 134,120 150,120 137,130 142,146 128,136 114,146 119,130 106,120 122,120"/>
          <polygon points="166,108 171,122 186,122 174,131 178,145 166,136 154,145 158,131 146,122 161,122"/>
          <polygon points="204,108 209,122 224,122 212,131 216,145 204,136 192,145 196,131 184,122 199,122"/>
        </g>
      `;
    } else if (t === 'call-flag' || t === 'call-loc') {
      // Pure Graphic Flag / GPS Pin Callout
      body = t === 'call-loc'
        ? `
          <ellipse cx="128" cy="214" rx="48" ry="14" fill="${pal.dark}" stroke="${pal.accent}" stroke-width="3"/>
          <path d="M128 210 C128 210 64 144 64 96 C64 60 92 32 128 32 C164 32 192 60 192 96 C192 144 128 210 128 210 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="128" cy="96" r="28" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}"/>
        `
        : `
          <line x1="68" y1="36" x2="68" y2="224" stroke="${pal.light}" stroke-width="${sw * 2}" stroke-linecap="round"/>
          <path d="M68 48 L206 72 L176 110 L206 148 L68 148 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="68" cy="36" r="12" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="3"/>
        `;
    } else {
      // Pure Graphic Lower-Third Callout Box with Icon Badge & Graphic Bars
      body = `
        <rect x="24" y="76" width="212" height="108" rx="20" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <rect x="18" y="68" width="212" height="108" rx="20" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <path d="M18 88 C18 76 26 68 38 68 L84 68 L84 176 L38 176 C26 176 18 168 18 156 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <circle cx="51" cy="122" r="20" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
        <path d="M43 122 L49 128 L61 115" fill="none" stroke="${pal.dark}" stroke-width="4" stroke-linecap="round"/>
        <!-- Clean Graphic Placeholder Lines for Video Overlay -->
        <rect x="102" y="92" width="64" height="14" rx="7" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="2.5"/>
        <rect x="102" y="118" width="106" height="18" rx="9" fill="${pal.dark}"/>
        <rect x="102" y="146" width="82" height="10" rx="5" fill="${mainColor}"/>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 6: REACTIONS, EMOJIS & VIBE STICKERS (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'reactions') {
    if (t === 'react-fire') {
      body = `
        <path d="M128 20 C128 20 204 78 204 148 C204 194 170 228 128 228 C86 228 52 194 52 148 C52 112 78 82 78 82 C78 82 74 114 96 122 C84 78 128 20 128 20 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M128 92 C128 92 168 128 168 164 C168 190 150 208 128 208 C106 208 88 190 88 164 C88 136 128 92 128 92 Z" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
        <circle cx="128" cy="176" r="18" fill="${pal.light}"/>
      `;
    } else if (t === 'react-skull') {
      body = `
        <path d="M128 36 C78 36 48 70 48 118 C48 146 64 168 82 178 L82 212 L174 212 L174 178 C192 168 208 146 208 118 C208 70 178 36 128 36 Z" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <circle cx="96" cy="118" r="20" fill="${pal.dark}"/>
        <circle cx="160" cy="118" r="20" fill="${pal.dark}"/>
        <polygon points="128,138 118,160 138,160" fill="${pal.dark}"/>
        <line x1="104" y1="184" x2="104" y2="212" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <line x1="128" y1="184" x2="128" y2="212" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <line x1="152" y1="184" x2="152" y2="212" stroke="${pal.stroke}" stroke-width="${sw}"/>
      `;
    } else {
      // Pure Graphic Expressive Emoji Face (Zero Text)
      const eyeVariant = sticker.numericId % 5;
      let eyesMarkup = '';
      if (t === 'react-cool') {
        eyesMarkup = `
          <rect x="60" y="92" width="60" height="34" rx="8" fill="${pal.dark}" stroke="${pal.light}" stroke-width="3"/>
          <rect x="136" y="92" width="60" height="34" rx="8" fill="${pal.dark}" stroke="${pal.light}" stroke-width="3"/>
          <line x1="120" y1="104" x2="136" y2="104" stroke="${pal.light}" stroke-width="5"/>
        `;
      } else if (t === 'react-love') {
        eyesMarkup = `
          <path d="M92 122 C92 122 68 104 68 88 C68 78 78 72 86 80 C94 72 104 78 104 88 C104 104 92 122 92 122 Z" fill="${pal.primary}" stroke="${pal.stroke}" stroke-width="3"/>
          <path d="M164 122 C164 122 140 104 140 88 C140 78 150 72 158 80 C166 72 176 78 176 88 C176 104 164 122 164 122 Z" fill="${pal.primary}" stroke="${pal.stroke}" stroke-width="3"/>
        `;
      } else if (eyeVariant === 0) {
        eyesMarkup = `
          <circle cx="94" cy="106" r="16" fill="${pal.dark}"/>
          <circle cx="162" cy="106" r="16" fill="${pal.dark}"/>
          <circle cx="88" cy="100" r="6" fill="#FFFFFF"/>
          <circle cx="156" cy="100" r="6" fill="#FFFFFF"/>
        `;
      } else if (eyeVariant === 1) {
        eyesMarkup = `
          <polygon points="94,82 100,98 118,98 104,108 108,124 94,114 80,124 84,108 70,98 88,98" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="2.5"/>
          <polygon points="162,82 168,98 186,98 172,108 176,124 162,114 148,124 152,108 138,98 156,98" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="2.5"/>
        `;
      } else {
        eyesMarkup = `
          <path d="M76 110 Q94 88 112 110" fill="none" stroke="${pal.dark}" stroke-width="7" stroke-linecap="round"/>
          <path d="M144 110 Q162 88 180 110" fill="none" stroke="${pal.dark}" stroke-width="7" stroke-linecap="round"/>
        `;
      }
       body = `
        <circle cx="128" cy="128" r="88" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <path d="M68 72 A68 68 0 0 1 184 66" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.55"/>
        ${eyesMarkup}
        <path d="M86 146 Q128 188 170 146 Z" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M104 164 Q128 180 152 164" fill="${pal.primary}"/>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 7: KEYFRAMES, NLE & CURSOR UI (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'nle') {
    if (t.startsWith('nle-kf')) {
      const isEase = t === 'nle-kf-ease';
      const isHold = t === 'nle-kf-hold';
      const isRove = t === 'nle-kf-rove';
      let shape = `<polygon points="128,42 212,128 128,214 44,128" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
                   <polygon points="128,72 182,128 128,184 74,128" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.7}" stroke-linejoin="round"/>`;
      if (isEase) {
        shape = `<polygon points="74,48 182,48 140,128 182,208 74,208 116,128" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      } else if (isHold) {
        shape = `<rect x="64" y="64" width="128" height="128" rx="14" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>`;
      } else if (isRove) {
        shape = `<circle cx="128" cy="128" r="68" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>`;
      }
      body = `
        <line x1="16" y1="128" x2="240" y2="128" stroke="${pal.light}" stroke-width="${sw * 1.6}" stroke-linecap="round"/>
        ${shape}
        <circle cx="128" cy="128" r="14" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
      `;
    } else if (t === 'nle-cursor' || t === 'nle-click' || t === 'nle-dclick' || t === 'nle-drag') {
      body = `
        <circle cx="104" cy="96" r="62" fill="none" stroke="${mainColor}" stroke-width="${sw}" stroke-dasharray="14 10"/>
        <circle cx="104" cy="96" r="38" fill="${pal.accent}" fill-opacity="0.4" stroke="${pal.accent}" stroke-width="3.5"/>
        <polygon points="94,76 94,194 128,162 154,214 178,202 152,150 196,144" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
      `;
    } else {
      // Pure Graphic Bezier Velocity Graph & Timeline Playhead Scrubber
      body = `
        <rect x="22" y="42" width="212" height="172" rx="22" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}"/>
        <rect x="22" y="42" width="212" height="36" rx="16" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
        <circle cx="46" cy="60" r="7" fill="${pal.dark}"/>
        <circle cx="68" cy="60" r="7" fill="${pal.light}"/>
        <circle cx="90" cy="60" r="7" fill="${pal.accent}"/>
        <!-- Bezier S-Curve & Handles -->
        <path d="M46 182 C108 182, 118 102, 210 102" fill="none" stroke="${pal.accent}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="46" cy="182" r="9" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
        <circle cx="210" cy="102" r="9" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
        <!-- Red Timeline Playhead -->
        <line x1="128" y1="80" x2="128" y2="206" stroke="${pal.primary}" stroke-width="4"/>
        <polygon points="114,78 142,78 128,98" fill="${pal.primary}" stroke="${pal.light}" stroke-width="2"/>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 8: GAMING, STREAM & ESPORTS ICONS (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'gaming') {
    if (t.startsWith('game-hp') || t === 'game-shield') {
      const isLow = t === 'game-hp-low';
      const segs = isLow ? 1 : 5;
      let bars = '';
      for (let s = 0; s < segs; s++) {
        bars += `<rect x="${56 + s * 30}" y="108" width="24" height="40" rx="4" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="2"/>`;
      }
      body = `
        <polygon points="28,84 220,84 236,128 220,172 28,172 12,128" fill="${pal.dark}" stroke="${pal.light}" stroke-width="${sw}" stroke-linejoin="round"/>
        <rect x="48" y="100" width="164" height="56" rx="8" fill="#1E293B" stroke="${pal.stroke}" stroke-width="3"/>
        ${bars}
      `;
    } else if (t === 'game-pad') {
      // Pure Graphic Gamepad Controller
      body = `
        <path d="M56 84 L200 84 C224 84 236 116 226 164 C220 190 196 196 180 174 L162 152 L94 152 L76 174 C60 196 36 190 30 164 C20 116 32 84 56 84 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M78 106 L78 134 M64 120 L92 120" stroke="${pal.light}" stroke-width="8" stroke-linecap="round"/>
        <circle cx="172" cy="110" r="8" fill="${pal.accent}"/>
        <circle cx="188" cy="124" r="8" fill="${pal.cyan}"/>
        <circle cx="156" cy="124" r="8" fill="${pal.mint}"/>
        <circle cx="172" cy="138" r="8" fill="${pal.primary}"/>
      `;
    } else {
      // Pure Graphic Esports Shield Crest & Crown / Crossed Swords
      body = `
        <polygon points="128,20 218,58 198,172 128,236 58,172 38,58" fill="${pal.dark}" stroke="${pal.accent}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon points="128,36 200,68 184,162 128,216 72,162 56,68" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
        <polygon points="80,144 96,88 128,118 160,88 176,144" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}" stroke-linejoin="round"/>
        <circle cx="128" cy="168" r="14" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 9: VLOG, LIFESTYLE & STAMPS (100% TEXT-FREE)
  // =========================================================================
  else if (sticker.category === 'vlog') {
    if (t === 'vlog-coffee') {
      // Pure Graphic Iced Coffee Cup with Straw
      body = `
        <line x1="148" y1="24" x2="122" y2="96" stroke="${pal.accent}" stroke-width="${sw * 2}" stroke-linecap="round"/>
        <path d="M72 88 L184 88 L170 216 L86 216 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <rect x="64" y="72" width="128" height="22" rx="10" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <rect x="80" y="126" width="96" height="44" rx="8" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
        <circle cx="128" cy="148" r="12" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="2.5"/>
      `;
    } else if (t === 'vlog-music') {
      // Pure Graphic Spinning Vinyl Record & Musical Note
      body = `
        <circle cx="128" cy="128" r="90" fill="${pal.dark}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <circle cx="128" cy="128" r="68" fill="none" stroke="${pal.light}" stroke-width="2" stroke-dasharray="18 12" opacity="0.45"/>
        <circle cx="128" cy="128" r="34" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.85}"/>
        <circle cx="128" cy="128" r="10" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
      `;
    } else {
      // Pure Graphic Polaroid Photo Frame with Washi Tape & Sun/Mountain Landscape
      body = `
        <g transform="rotate(3 128 128)">
          <rect x="38" y="42" width="180" height="176" rx="14" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}"/>
          <rect x="84" y="26" width="88" height="28" rx="4" transform="rotate(-5 128 40)" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw * 0.75}"/>
          <rect x="54" y="62" width="148" height="114" rx="8" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw * 0.8}"/>
          <circle cx="92" cy="96" r="16" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="2.5"/>
          <polygon points="56,174 112,116 156,174" fill="${pal.secondary}" stroke="${pal.stroke}" stroke-width="3" stroke-linejoin="round"/>
          <polygon points="118,174 162,126 200,174" fill="${pal.mint}" stroke="${pal.stroke}" stroke-width="3" stroke-linejoin="round"/>
        </g>
      `;
    }
  }
   // =========================================================================
  // CATEGORY 10: KINETIC SHAPES, FRAMES & ACCENTS (100% TEXT-FREE)
  // =========================================================================
  else {
    if (t === 'kin-pop3' || t === 'kin-pop5' || t === 'kin-radial') {
      body = `
        <g stroke="${mainColor}" stroke-width="${sw * 2.4}" stroke-linecap="round">
          <line x1="128" y1="20" x2="128" y2="64"/>
          <line x1="128" y1="192" x2="128" y2="236"/>
          <line x1="20" y1="128" x2="64" y2="128"/>
          <line x1="192" y1="128" x2="236" y2="128"/>
          <line x1="50" y1="50" x2="82" y2="82" stroke="${pal.accent}"/>
          <line x1="206" y1="50" x2="174" y2="82" stroke="${pal.accent}"/>
          <line x1="50" y1="206" x2="82" y2="174" stroke="${pal.accent}"/>
          <line x1="206" y1="206" x2="174" y2="174" stroke="${pal.accent}"/>
        </g>
        <circle cx="128" cy="128" r="42" fill="${pal.accent}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        <polygon points="128,100 136,120 156,128 136,136 128,156 120,136 100,128 120,120" fill="${pal.dark}"/>
      `;
    } else if (t === 'kin-y2k' || t === 'kin-sparkle') {
      body = `
        <ellipse cx="128" cy="128" rx="98" ry="42" transform="rotate(-28 128 128)" fill="none" stroke="${pal.accent}" stroke-width="${sw}"/>
        <path d="M128 20 C136 96 160 120 236 128 C160 136 136 160 128 236 C120 160 96 136 20 128 C96 120 120 96 128 20 Z" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
        <circle cx="128" cy="128" r="18" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="3"/>
      `;
    } else if (t === 'kin-check' || t === 'kin-x') {
      const isX = t === 'kin-x';
      body = `
        <circle cx="128" cy="128" r="88" fill="${mainColor}" stroke="${pal.stroke}" stroke-width="${sw}"/>
        ${isX
          ? `<path d="M88 88 L168 168 M168 88 L88 168" stroke="${pal.light}" stroke-width="${sw * 3}" stroke-linecap="round"/>`
          : `<path d="M78 130 L114 166 L182 92" fill="none" stroke="${pal.light}" stroke-width="${sw * 3}" stroke-linecap="round" stroke-linejoin="round"/>`
        }
      `;
    } else {
      // Pure Graphic Kinetic Wave & Concentric Geometric Seal
      body = `
        <circle cx="128" cy="128" r="88" fill="${pal.dark}" stroke="${mainColor}" stroke-width="${sw}"/>
        <path d="M52 104 Q90 64 128 104 T204 104" fill="none" stroke="${pal.accent}" stroke-width="${sw * 1.8}" stroke-linecap="round"/>
        <path d="M52 152 Q90 112 128 152 T204 152" fill="none" stroke="${mainColor}" stroke-width="${sw * 1.8}" stroke-linecap="round"/>
        <circle cx="128" cy="128" r="24" fill="${pal.light}" stroke="${pal.stroke}" stroke-width="${sw}"/>
      `;
    }
  }
  // No corner flourishes (stars / camera chips) — stickers are body-only.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${exportSize}" height="${exportSize}">
    ${defs}
    <g filter="url(#${uid}_fx)">
      ${body}
    </g>
  </svg>`;
}
 

function toRenderInput(sticker: KineticStickerDef): KineticStickerRenderInput {
  const numericId = Number.parseInt(sticker.id.replace(/^k/i, ''), 10);
  if (!Number.isFinite(numericId) || numericId < 1) {
    throw new Error(`Invalid kinetic sticker id: ${sticker.id}`);
  }
  const catIndex = sticker.catIndex ?? ((numericId - 1) % 50) + 1;
  return { ...sticker, numericId, catIndex };
}

/** Generate a text-free kinetic SVG (256 viewBox, sized for raster). */
export function generateKineticStickerSvg(
  sticker: KineticStickerDef,
  options: KineticRenderOptions & { size?: number } = {},
): string {
  return generateStickerSVGCore(toRenderInput(sticker), options);
}
