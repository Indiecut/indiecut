/** Bundled sound-effect pack — files under assets/sound_effects (safe filenames). */

export type SoundEffectCategory =
  | "transitions"
  | "ui"
  | "cinematic"
  | "comedy"
  | "foley";

export type SoundEffectEntry = {
  id: string;
  name: string;
  description: string;
  /** Basename under assets/sound_effects (no special URL chars). */
  file: string;
  category: SoundEffectCategory;
  tags: string[];
};

/** Vite-resolved URLs keyed by basename (e.g. fire_crackling.wav). */
const sfxUrlModules = import.meta.glob("../../../../assets/sound_effects/*.wav", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string | { default: string }>;

const urlByFile = new Map<string, string>();
for (const [path, mod] of Object.entries(sfxUrlModules)) {
  const file = path.split("/").pop();
  const url = typeof mod === "string" ? mod : mod?.default;
  if (file && typeof url === "string") urlByFile.set(file, url);
}

export const SOUND_EFFECT_CATEGORY_ORDER: SoundEffectCategory[] = [
  "transitions",
  "ui",
  "cinematic",
  "comedy",
  "foley",
];

export const SOUND_EFFECT_CATEGORY_LABEL: Record<SoundEffectCategory, string> = {
  transitions: "Transitions",
  ui: "UI & Accents",
  cinematic: "Cinematic",
  comedy: "Comedy & Meme",
  foley: "Foley & Env",
};

export const SOUND_EFFECTS: SoundEffectEntry[] = [
  // Transitions & Movement
  {
    id: "sfx-fast-whoosh",
    name: "Fast Whoosh",
    description: "A quick, clean air sweep for standard cuts.",
    file: "fast_whoosh.wav",
    category: "transitions",
    tags: ["whoosh", "cut", "transition"],
  },
  {
    id: "sfx-deep-swoosh",
    name: "Deep Swoosh",
    description: "A bass-heavy sweep for slower, dramatic transitions.",
    file: "dramatic_deep_swoosh.wav",
    category: "transitions",
    tags: ["swoosh", "bass", "dramatic"],
  },
  {
    id: "sfx-light-swish",
    name: "Light Swish",
    description: "A high-frequency, subtle movement (good for text flying in).",
    file: "light_swish.wav",
    category: "transitions",
    tags: ["swish", "text", "subtle"],
  },
  {
    id: "sfx-whip-crack",
    name: "Whip Crack",
    description: "A sharp, aggressive snap for fast-action cuts.",
    file: "aggressive_whip_snap.wav",
    category: "transitions",
    tags: ["whip", "snap", "action"],
  },
  {
    id: "sfx-digital-glitch",
    name: "Digital Glitch",
    description: "Static distortion for sci-fi or tech transitions.",
    file: "digital_static_glitch.wav",
    category: "transitions",
    tags: ["glitch", "static", "tech"],
  },
  {
    id: "sfx-short-riser",
    name: "Short Riser",
    description: "A quick ascending pitch to build tension before a drop.",
    file: "quick_pulse_riser.wav",
    category: "transitions",
    tags: ["riser", "tension", "drop"],
  },
  {
    id: "sfx-cinematic-riser",
    name: "Cinematic Riser",
    description: "A long, drawn-out build-up for movie trailers.",
    file: "cinematic_trailer_riser.wav",
    category: "transitions",
    tags: ["riser", "trailer", "build"],
  },
  {
    id: "sfx-reverse-cymbal",
    name: "Reverse Cymbal (Suck-in)",
    description: "A suction-like sound leading into a scene change.",
    file: "cymbal_suck_in.wav",
    category: "transitions",
    tags: ["cymbal", "reverse", "suck-in"],
  },
  {
    id: "sfx-projector-flutter",
    name: "Film Projector Flutter",
    description: "Classic mechanical ticking for retro cuts.",
    file: "retro_projector_flutter.wav",
    category: "transitions",
    tags: ["projector", "retro", "film"],
  },
  {
    id: "sfx-tape-stop",
    name: "Tape Stop / Rewind",
    description: "The classic VCR pitch-down or fast-reverse sound.",
    file: "tape_stop_slowdown.wav",
    category: "transitions",
    tags: ["tape", "rewind", "vcr"],
  },

  // UI, Accents & Text Animation
  {
    id: "sfx-typewriter-single",
    name: "Typewriter (Single Stroke)",
    description: "A mechanical clack for individual letter reveals.",
    file: "typewriter_clack.wav",
    category: "ui",
    tags: ["typewriter", "text", "clack"],
  },
  {
    id: "sfx-typewriter-rapid",
    name: "Typewriter (Rapid)",
    description: "Continuous clacking for full-paragraph generation.",
    file: "rapid_typewriter_clack.wav",
    category: "ui",
    tags: ["typewriter", "text", "rapid"],
  },
  {
    id: "sfx-clean-ping",
    name: "Clean Ping",
    description: "A high-pitched, satisfying chime for success or correct answers.",
    file: "clean_success_ping.wav",
    category: "ui",
    tags: ["ping", "success", "chime"],
  },
  {
    id: "sfx-mouth-pop",
    name: "Mouth Pop",
    description: 'A casual, round "pop" sound often used for on-screen text bubbles.',
    file: "mouth_pop.wav",
    category: "ui",
    tags: ["pop", "bubble", "text"],
  },
  {
    id: "sfx-bubble-burst",
    name: "Bubble Burst",
    description: "A watery, hollow pop for softer UI elements popping in.",
    file: "bubble_burst.wav",
    category: "ui",
    tags: ["bubble", "pop", "ui"],
  },
  {
    id: "sfx-mouse-click",
    name: "Mouse Click (Crisp)",
    description: "A standard digital selection sound.",
    file: "crisp_mouse_click.wav",
    category: "ui",
    tags: ["click", "ui", "select"],
  },
  {
    id: "sfx-ka-ching",
    name: "Cash Register (Ka-ching)",
    description: "The classic dual-tone bell for sales, money, or value.",
    file: "ka_ching_register.wav",
    category: "ui",
    tags: ["money", "register", "bell"],
  },
  {
    id: "sfx-camera-shutter",
    name: "Camera Shutter",
    description: "A mechanical snap for freeze-frames or photo inserts.",
    file: "mechanical_shutter.wav",
    category: "ui",
    tags: ["camera", "shutter", "photo"],
  },
  {
    id: "sfx-error-buzzer",
    name: "Error Buzzer",
    description: "A harsh, low-pitched buzz for mistakes or rejections.",
    file: "error_buzzer.wav",
    category: "ui",
    tags: ["error", "buzzer", "reject"],
  },

  // Cinematic & Impacts
  {
    id: "sfx-sub-drop",
    name: "Sub Drop",
    description: "A sudden, heavy bass frequency that fades slowly.",
    file: "heavy_sub_drop.wav",
    category: "cinematic",
    tags: ["bass", "drop", "impact"],
  },
  {
    id: "sfx-cinematic-braam",
    name: "Cinematic Braam",
    description: "The massive, brassy horn blast popularized by sci-fi trailers.",
    file: "cinematic_braam.wav",
    category: "cinematic",
    tags: ["braam", "horn", "trailer"],
  },
  {
    id: "sfx-heavy-thud",
    name: "Heavy Thud",
    description: "A dull, bass-heavy impact like a heavy object hitting dirt.",
    file: "heavy_earth_thud.wav",
    category: "cinematic",
    tags: ["thud", "impact", "bass"],
  },
  {
    id: "sfx-muffled-explosion",
    name: "Muffled Explosion",
    description: "A low-frequency boom without the high-end harshness.",
    file: "muffled_explosion.wav",
    category: "cinematic",
    tags: ["explosion", "boom", "muffled"],
  },
  {
    id: "sfx-distant-gunshot",
    name: "Distant Gunshot",
    description: "A sharp crack with environmental echo.",
    file: "distant_gunshot.wav",
    category: "cinematic",
    tags: ["gunshot", "echo", "action"],
  },
  {
    id: "sfx-sword-clash",
    name: "Sword Clash",
    description: "High-frequency metal scraping and striking.",
    file: "sword_clash.wav",
    category: "cinematic",
    tags: ["sword", "metal", "clash"],
  },
  {
    id: "sfx-low-drone",
    name: "Low Drone",
    description: "A continuous, unsettling bass rumble for suspense.",
    file: "eerie_void_drone.wav",
    category: "cinematic",
    tags: ["drone", "suspense", "bass"],
  },
  {
    id: "sfx-heartbeat",
    name: "Heartbeat (Single Pulse)",
    description: "A deep, rhythmic thud to emphasize a tense moment.",
    file: "heartbeat_single_pulse.wav",
    category: "cinematic",
    tags: ["heartbeat", "tension", "pulse"],
  },

  // Comedy, Social Media & Meme
  {
    id: "sfx-record-scratch",
    name: "Record Scratch",
    description: "Sudden interruption of the current vibe or audio track.",
    file: "vinyl_stop.wav",
    category: "comedy",
    tags: ["scratch", "vinyl", "meme"],
  },
  {
    id: "sfx-crickets",
    name: "Crickets Chirping",
    description: "The universal sound for awkward silence or a failed joke.",
    file: "awkward_silence_crickets.wav",
    category: "comedy",
    tags: ["crickets", "awkward", "silence"],
  },
  {
    id: "sfx-sad-trombone",
    name: "Sad Trombone (Wah-Wah)",
    description: "A descending brass melody for a minor failure.",
    file: "sad_trombone.wav",
    category: "comedy",
    tags: ["trombone", "fail", "wah"],
  },
  {
    id: "sfx-kids-cheering",
    name: "Kids Cheering (Yay!)",
    description: "A short, enthusiastic crowd reaction.",
    file: "kids_cheering_yay.wav",
    category: "comedy",
    tags: ["cheer", "kids", "yay"],
  },
  {
    id: "sfx-crowd-gasp",
    name: "Crowd Gasp",
    description: "A sudden intake of breath from a studio audience.",
    file: "crowd_gasp.wav",
    category: "comedy",
    tags: ["gasp", "crowd", "audience"],
  },
  {
    id: "sfx-censor-beep",
    name: "Censor Beep",
    description: "A harsh 1kHz sine wave to mask profanity.",
    file: "censor_beep.wav",
    category: "comedy",
    tags: ["beep", "censor", "bleep"],
  },
  {
    id: "sfx-cartoon-boing",
    name: "Cartoon Boing",
    description: "A spring-like, pitch-bending sound for jumping or bouncing.",
    file: "cartoon_spring_boing.wav",
    category: "comedy",
    tags: ["boing", "cartoon", "spring"],
  },
  {
    id: "sfx-slap",
    name: "Slap",
    description: "A sharp, high-frequency smack for physical comedy.",
    file: "slapstick_smacker.wav",
    category: "comedy",
    tags: ["slap", "comedy", "smack"],
  },
  {
    id: "sfx-ticking-clock",
    name: "Ticking Clock",
    description: "An exaggerated, rhythmic tick-tock for running out of time.",
    file: "ticking_clock.wav",
    category: "comedy",
    tags: ["clock", "tick", "timer"],
  },

  // Foley, Environment & Everyday
  {
    id: "sfx-footsteps-wood",
    name: "Footsteps (Wood)",
    description: "Hollow, rhythmic walking for indoor scenes.",
    file: "footsteps_wood.wav",
    category: "foley",
    tags: ["footsteps", "wood", "indoor"],
  },
  {
    id: "sfx-footsteps-concrete",
    name: "Footsteps (Concrete)",
    description: "Gritty, sharp walking for outdoor urban scenes.",
    file: "footsteps_concrete.wav",
    category: "foley",
    tags: ["footsteps", "concrete", "urban"],
  },
  {
    id: "sfx-wind-howling",
    name: "Wind Howling",
    description: "A continuous mid-frequency wash for isolation or cold.",
    file: "wind_howling.wav",
    category: "foley",
    tags: ["wind", "ambience", "cold"],
  },
  {
    id: "sfx-rain-pouring",
    name: "Rain Pouring",
    description: "Dense, high-frequency static-like wash for mood.",
    file: "rain_pouring.wav",
    category: "foley",
    tags: ["rain", "ambience", "weather"],
  },
  {
    id: "sfx-fire-crackling",
    name: "Fire Crackling",
    description: "Intermittent, sharp pops with a low background hiss.",
    file: "fire_crackling.wav",
    category: "foley",
    tags: ["fire", "crackling", "ambience"],
  },
  {
    id: "sfx-city-traffic",
    name: "City Traffic",
    description: "Distant cars passing, occasional muffled horns.",
    file: "city_traffic.wav",
    category: "foley",
    tags: ["traffic", "city", "ambience"],
  },
  {
    id: "sfx-cafe-ambience",
    name: "Cafe Ambience",
    description: "Muffled conversation, clinking cups, and background shuffling.",
    file: "cafe_ambience.wav",
    category: "foley",
    tags: ["cafe", "ambience", "crowd"],
  },
  {
    id: "sfx-paper-crumpling",
    name: "Paper Crumpling",
    description: "Sharp, crunchy high frequencies for transitions or trash.",
    file: "paper_crumpling.wav",
    category: "foley",
    tags: ["paper", "crumple", "foley"],
  },
  {
    id: "sfx-mechanical-keyboard",
    name: "Mechanical Keyboard",
    description: "Aggressive, clacky typing for hacking or intense work scenes.",
    file: "mechanical_keyboard.wav",
    category: "foley",
    tags: ["keyboard", "typing", "work"],
  },
  {
    id: "sfx-door-creak",
    name: "Heavy Door Creak",
    description: "A slow, high-pitched squeak for horror or reveals.",
    file: "heavy_door_creak.wav",
    category: "foley",
    tags: ["door", "creak", "horror"],
  },
];

export function soundEffectUrl(file: string): string {
  const url = urlByFile.get(file);
  if (!url) {
    throw new Error(`Sound effect asset missing: ${file}`);
  }
  return url;
}

export function findSoundEffect(id: string): SoundEffectEntry | undefined {
  return SOUND_EFFECTS.find((e) => e.id === id);
}

export function groupSoundEffectsByCategory(
  items: SoundEffectEntry[] = SOUND_EFFECTS,
): { category: SoundEffectCategory; items: SoundEffectEntry[] }[] {
  const map = new Map<SoundEffectCategory, SoundEffectEntry[]>();
  for (const cat of SOUND_EFFECT_CATEGORY_ORDER) map.set(cat, []);
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return SOUND_EFFECT_CATEGORY_ORDER.map((category) => ({
    category,
    items: map.get(category) ?? [],
  })).filter((g) => g.items.length > 0);
}
