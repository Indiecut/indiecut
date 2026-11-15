import { planExportAudio } from "../../export/exportAudio";
import type { ProjectDocument } from "../../project/types";

export type SpeechSourcePcm = {
  pcm: Float32Array;
  sampleRate: number;
  numberOfChannels: number;
};

/**
 * Build interleaved float PCM for the full audible timeline mix.
 * Reuses export remix so mute/solo/volume/fades match what you hear on export.
 */
export async function buildSpeechSourcePcm(
  project: ProjectDocument,
): Promise<SpeechSourcePcm> {
  const plan = await planExportAudio(project, { forceRemix: true });
  if (plan.mode !== "remix") {
    throw new Error(
      "No audible timeline audio available. Add a clip with audio first.",
    );
  }
  return {
    pcm: plan.pcm,
    sampleRate: plan.sampleRate,
    numberOfChannels: plan.numberOfChannels,
  };
}
