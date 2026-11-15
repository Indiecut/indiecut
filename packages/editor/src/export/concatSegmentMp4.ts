import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
} from "mediabunny";
import type { ExportQualityConfig } from "./exportWorkerProtocol";
import { toUint8Array } from "../media/bytes";
import { getPlatform } from "@indiecut/platform";

export type ConcatAudioPayload = {
  sampleRate: number;
  numberOfChannels: number;
  pcm: Float32Array;
  audioQuality: ExportQualityConfig;
};

export type ConcatSegmentInput = {
  /** Absolute path to a finalized video-only segment MP4. */
  path: string;
  /** Expected duration used for timestamp offset (seconds). */
  durationSec: number;
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
 * Packet-copy concatenate video-only segment MP4s into a final file, optionally
 * muxing a single AAC remix. Runs on the renderer thread via exportStream IPC.
 */
export async function concatSegmentMp4(args: {
  folder: string;
  title: string;
  segments: ConcatSegmentInput[];
  fps: number;
  audio?: ConcatAudioPayload | null;
  signal?: AbortSignal;
}): Promise<{ finalPath: string; bytesWritten: number }> {
  const bridge = getPlatform();
  if (!bridge?.exportStream || !bridge.fs) {
    throw new Error("Export concat requires the Electron app");
  }
  if (args.segments.length === 0) {
    throw new Error("No segments to concatenate");
  }

  const opened = await bridge.exportStream.open({
    folder: args.folder,
    title: args.title,
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
      chunkSize: 16 * 1024 * 1024,
    }),
  });

  const videoSource = new EncodedVideoPacketSource("avc");
  output.addVideoTrack(videoSource, { frameRate: args.fps });

  let audioSource: AudioSampleSource | null = null;
  if (args.audio && args.audio.pcm.length > 0) {
    audioSource = new AudioSampleSource({
      codec: "aac",
      quality: qualityFromConfig(args.audio.audioQuality),
    });
    output.addAudioTrack(audioSource);
  }

  try {
    await output.start();

    let offsetSec = 0;
    let wroteFirstMeta = false;

    for (const segment of args.segments) {
      if (args.signal?.aborted) throw new Error("Export cancelled");

      const raw = await bridge.fs.readFile(segment.path);
      const bytes = toUint8Array(raw);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);

      const input = new Input({
        source: new BlobSource(new Blob([copy], { type: "video/mp4" })),
        formats: ALL_FORMATS,
      });

      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error(`No video track in segment ${segment.path}`);

        const decoderConfig = await track.getDecoderConfig();
        if (!decoderConfig) {
          throw new Error(`Missing decoder config for segment ${segment.path}`);
        }

        const sink = new EncodedPacketSink(track);
        let start = await sink.getFirstKeyPacket({ verifyKeyPackets: true });
        if (!start) {
          start = await sink.getFirstPacket();
        }
        if (!start) {
          throw new Error(`Empty segment ${segment.path}`);
        }
        if (start.type !== "key") {
          throw new Error(
            `Segment ${segment.path} does not start with a keyframe`,
          );
        }

        for await (const packet of sink.packets(start)) {
          if (args.signal?.aborted) throw new Error("Export cancelled");
          const shifted = packet.clone({
            timestamp: packet.timestamp + offsetSec,
          });
          if (!wroteFirstMeta) {
            await videoSource.add(shifted, { decoderConfig });
            wroteFirstMeta = true;
          } else {
            await videoSource.add(shifted);
          }
        }

        const trackDuration = await track.computeDuration();
        offsetSec +=
          trackDuration > 0 ? trackDuration : Math.max(0, segment.durationSec);
      } finally {
        await input.dispose();
      }
    }

    videoSource.close();

    if (audioSource && args.audio) {
      await addPcmAsAudioSamples(
        audioSource,
        args.audio.pcm,
        args.audio.sampleRate,
        args.audio.numberOfChannels,
      );
      audioSource.close();
    }

    await output.finalize();

    const closed = await bridge.exportStream.close(streamId, { abort: false });
    if (!closed.ok || !closed.finalPath) {
      throw new Error(closed.error || "Failed to finalize concatenated export");
    }
    return {
      finalPath: closed.finalPath,
      bytesWritten: closed.bytesWritten ?? 0,
    };
  } catch (err) {
    try {
      videoSource.close();
    } catch {
      /* ignore */
    }
    try {
      audioSource?.close();
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
