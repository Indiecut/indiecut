import type { KineticPaletteKey } from './types';

export type KineticPalette = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  mint: string;
  cyan: string;
  orange: string;
  purple: string;
  dark: string;
  light: string;
  stroke: string;
};

export const PALETTES = {
  vibrant: {
    name: 'Creator Vibrant',
    primary: '#FF3366',
    secondary: '#6366F1',
    accent: '#FACC15',
    mint: '#10B981',
    cyan: '#06B6D4',
    orange: '#F97316',
    purple: '#A855F7',
    dark: '#0F172A',
    light: '#FFFFFF',
    stroke: '#0F172A',
  },
  cyber: {
    name: 'Cyber Neon',
    primary: '#00F5D4',
    secondary: '#F15BB5',
    accent: '#FEE440',
    mint: '#00BBF9',
    cyan: '#00F5D4',
    orange: '#FF007F',
    purple: '#9B5DE5',
    dark: '#090614',
    light: '#F8FAFC',
    stroke: '#090614',
  },
  cinema: {
    name: 'Cinema HUD',
    primary: '#EF4444',
    secondary: '#F59E0B',
    accent: '#10B981',
    mint: '#22C55E',
    cyan: '#38BDF8',
    orange: '#F97316',
    purple: '#E2E8F0',
    dark: '#090D16',
    light: '#F8FAFC',
    stroke: '#090D16',
  },
  pastel: {
    name: 'Vlog Pastel',
    primary: '#FB7185',
    secondary: '#818CF8',
    accent: '#FDE047',
    mint: '#34D399',
    cyan: '#67E8F9',
    orange: '#FDBA74',
    purple: '#C084FC',
    dark: '#1E1B4B',
    light: '#FFFBEB',
    stroke: '#1E1B4B',
  },
  mono: {
    name: 'Brutalist Mono',
    primary: '#FFFFFF',
    secondary: '#94A3B8',
    accent: '#E2E8F0',
    mint: '#CBD5E1',
    cyan: '#F1F5F9',
    orange: '#E2E8F0',
    purple: '#94A3B8',
    dark: '#09090B',
    light: '#FFFFFF',
    stroke: '#09090B',
  },
} as const satisfies Record<KineticPaletteKey, KineticPalette>;

export const KINETIC_PALETTE_KEYS = [
  'vibrant',
  'cyber',
  'cinema',
  'pastel',
  'mono',
] as const satisfies readonly KineticPaletteKey[];

export const KINETIC_PALETTE_LABELS: Record<KineticPaletteKey, string> = {
  vibrant: PALETTES.vibrant.name,
  cyber: PALETTES.cyber.name,
  cinema: PALETTES.cinema.name,
  pastel: PALETTES.pastel.name,
  mono: PALETTES.mono.name,
};