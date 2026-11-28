import { getPlatform } from "@indiecut/platform";

/**
 * Cloud AI (Claude chat, Settings → AI, Gemini/ElevenLabs skills via the agent)
 * requires the desktop Anthropic bridge. Browser builds have no proxy and hit CORS.
 */
export function isCloudAiAvailable(): boolean {
  const bridge = getPlatform();
  if (bridge?.capabilities?.cloudAi === false) return false;
  if (bridge?.capabilities?.cloudAi === true) return true;
  // Fallback: desktop preload exposes streamAnthropic; web does not.
  return typeof bridge?.ai?.streamAnthropic === "function";
}
