import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "assets.stickers",
  domain: "assets",
  title: "Sticker catalog",
  summary: "List sticker ids available for timeline.insertSticker",
  verbs: ["inspect"],
  targets: ["assets"],
  risk: "safe",
  schema: z.object({}),
  constraints: ["Use inspect kind=stickers or timeline.insertSticker after listing"],
});
