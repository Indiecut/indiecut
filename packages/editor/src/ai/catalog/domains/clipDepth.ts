import { z } from "zod";
import { registerCapability } from "../register";

const animatableNumber = z.union([
  z.number(),
  z.object({
    staticValue: z.number(),
    keyframes: z.array(z.object({ timeOffsetMs: z.number(), value: z.number() })).optional(),
  }),
]);

registerCapability({
  id: "clip.transform3d",
  domain: "clip",
  title: "3D transform",
  summary: "rotateX/Y/Z, z depth, perspective",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    rotateX: animatableNumber.optional(),
    rotateY: animatableNumber.optional(),
    rotateZ: animatableNumber.optional(),
    z: animatableNumber.optional(),
    perspective: animatableNumber.optional(),
  }),
});

registerCapability({
  id: "clip.adjust",
  domain: "clip",
  title: "Color adjust",
  summary: "Brightness, contrast, saturation, hue",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    brightness: animatableNumber.optional(),
    contrast: animatableNumber.optional(),
    saturation: animatableNumber.optional(),
    hue: animatableNumber.optional(),
  }),
});

registerCapability({
  id: "clip.audio",
  domain: "clip",
  title: "Audio mix",
  summary: "volumeDb and fades for audio-capable clips",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    volumeDb: animatableNumber.optional(),
    fadeInMs: z.number().optional(),
    fadeOutMs: z.number().optional(),
  }),
});

registerCapability({
  id: "clip.speed",
  domain: "clip",
  title: "Speed / reverse",
  summary: "Clip playback speed and reversed flag",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    speed: z.number().positive().optional(),
    reversed: z.boolean().optional(),
  }),
});

registerCapability({
  id: "clip.crop",
  domain: "clip",
  title: "Crop",
  summary: "Geometric crop rect on media clips",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    crop: z.record(z.string(), z.unknown()).optional(),
  }),
});

registerCapability({
  id: "clip.removeBg",
  domain: "clip",
  title: "Remove background",
  summary: "Enable/disable chroma remove-bg on video/image clips",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    enabled: z.boolean().optional(),
    color: z.string().optional(),
  }),
});

registerCapability({
  id: "clip.masks",
  domain: "clip",
  title: "Masks",
  summary:
    "Geometric / text masks on video/image. Set path masks to an array of { type, invert?, feather?, position?, size?, ... }; bare numbers OK. Also set masksEnabled true. Keyframe leaves via animPath masks.<id>.*",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    masksEnabled: z.boolean().optional(),
    masks: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});

registerCapability({
  id: "clip.stickerStyle",
  domain: "clip",
  title: "Sticker style",
  summary: "Sticker style params on sticker clips",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    stickerStyle: z.record(z.string(), z.unknown()),
  }),
});

registerCapability({
  id: "clip.filter",
  domain: "clip",
  title: "Filter",
  summary: "Filter clip params / strength",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    filter: z.record(z.string(), z.unknown()).optional(),
  }),
});

registerCapability({
  id: "clip.effect",
  domain: "clip",
  title: "Effect",
  summary: "Effect-track intensity params",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    effect: z.record(z.string(), z.unknown()).optional(),
  }),
});

registerCapability({
  id: "clip.transition",
  domain: "clip",
  title: "Transition",
  summary: "Incoming transition params on a clip",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    transition: z.record(z.string(), z.unknown()).optional(),
  }),
});

registerCapability({
  id: "clip.muteAudio",
  domain: "clip",
  title: "Mute clip audio",
  summary: "Mute embedded audio on a media clip",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    muteAudio: z.boolean(),
  }),
});
