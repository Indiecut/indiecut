import {
  AudioSample,
  AudioSampleSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
} from "mediabunny";
import type { ExportQualityConfig } from "./exportWorkerProtocol";
import { getPlatform } from "@indiecut/platform";

export type AudioOnlyExportPayload = {
  sampleRate: number;
  numberOfChannels: number;
  pcm: Float32Array;
  audioQuality: ExportQualityConfig;
};

function qualityFromConfig(config: ExportQualityConfig): Quality {
  if (config.kind === "bitrate") {
    return new Quality({ bitrate: config.bitrate });
  }
  return new Quality(config.name);
}

async function addPcmAsAudioSamples(
  audioSource: AudioSampleSource,
  pcm: Float32Array,
  sampleRate: number,
  numberOfChannels: number,
): Promise<void> {
  const framesTotal = Math.floor(pcm.length / numberOfChannels);
  if (framesTotal <= 0) return;

  const maxFrames = Math.max(1, Math.floor(sampleRate));
  let frame = 0;
  let timestamp = 0;

  while (frame < framesTotal) {
    const count = Math.min(maxFrames, framesTotal - frame);
    const interleaved = new Float32Array(count * numberOfChannels);
    interleaved.set(
      pcm.subarray(
        frame * numberOfChannels,
        (frame + count) * numberOfChannels,
      ),
    );
    const sample = new AudioSample({
      data: interleaved,
      format: "f32",
      numberOfChannels,
      sampleRate,
      timestamp,
    });
    await audioSource.add(sample);
    sample.close();
    timestamp += count / sampleRate;
    frame += count;
  }
}

/**
 * Encode remix PCM to an AAC-in-MP4 (.m4a) file via exportStream IPC.
 */
export async function exportAudioOnlyFile(args: {
  folder: string;
  title: string;
  audio: AudioOnlyExportPayload;
  signal?: AbortSignal;
}): Promise<{ finalPath: string; bytesWritten: number }> {
  const bridge = getPlatform();
  if (!bridge?.exportStream) {
    throw new Error("Audio export requires the Electron app");
  }
  if (args.audio.pcm.length === 0) {
    throw new Error("No audio to export");
  }

  const opened = await bridge.exportStream.open({
    folder: args.folder,
    title: args.title,
    extension: "m4a",
  });
  const streamId = opened.streamId;

  let nextWriteId = 1;
  const pendingWrites = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();

  const writable = new WritableStream<{
    data: Uint8Array;
    position: number;
  }>({
    async write(chunk) {
      if (args.signal?.aborted) throw new Error("Export cancelled");
      const writeId = nextWriteId++;
      const copy = new Uint8Array(chunk.data.byteLength);
      copy.set(chunk.data);
      await new Promise<void>((resolve, reject) => {
        pendingWrites.set(writeId, { resolve, reject });
        void bridge
          .exportStream!.write(streamId, chunk.position, copy)
          .then(() => {
            pendingWrites.get(writeId)?.resolve();
            pendingWrites.delete(writeId);
          })
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            pendingWrites.get(writeId)?.reject(error);
            pendingWrites.delete(writeId);
          });
      });
    },
  });

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new StreamTarget(writable, {
      chunked: true,
      chunkSize: 4 * 1024 * 1024,
    }),
  });

  const audioSource = new AudioSampleSource({
    codec: "aac",
    quality: qualityFromConfig(args.audio.audioQuality),
  });
  output.addAudioTrack(audioSource);

  try {
    await output.start();
    if (args.signal?.aborted) throw new Error("Export cancelled");

    await addPcmAsAudioSamples(
      audioSource,
      args.audio.pcm,
      args.audio.sampleRate,
      args.audio.numberOfChannels,
    );
    audioSource.close();
    await output.finalize();

    const closed = await bridge.exportStream.close(streamId, { abort: false });
    if (!closed.ok || !closed.finalPath) {
      throw new Error(closed.error || "Failed to finalize audio export");
    }
    return {
      finalPath: closed.finalPath,
      bytesWritten: closed.bytesWritten ?? 0,
    };
  } catch (err) {
    try {
      audioSource.close();
    } catch {
      /* ignore */
    }
    try {
      await output.cancel();
    } catch {
      /* ignore */
    }
    try {
      await bridge.exportStream.close(streamId, { abort: true });
    } catch {
      /* ignore */
    }
    for (const [, pending] of pendingWrites) {
      pending.reject(new Error("Export cancelled"));
    }
    pendingWrites.clear();
    throw err;
  }
}
