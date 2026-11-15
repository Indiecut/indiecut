# IndieCut AI modules

Optional / model-backed features live under `src/ai/` so they can be deleted without rewriting the timeline or compositor.

## Captions (`src/ai/captions/`)

On-device auto captions + SRT/ASS import.

- UI: Media panel **Captions** tab → `CaptionsLibrary`
- Generate: remix timeline audio (`planExportAudio`) → mono 16 kHz → fixed Whisper Small via `@huggingface/transformers@3.8.1` worker → text clips
- Import: parse `.srt` / `.ass` / `.ssa` → same text-clip placement
- First run downloads the model (progress %); later runs use cache. Audio never leaves the device. No model-size picker. Pin stays on v3 (OpenCut-compatible); v4 fails ORT backend init under Vite/Electron.
- ORT runtime files are copied to `public/ort/` and loaded same-origin (Electron CSP blocks the default jsDelivr CDN).

See `documents/captions/AUTO_CAPTIONS_BUILD_PLAN.md`.

## Other

Live chroma Remove BG is implemented in:

- `src/compositor/removeBgColor.ts`
- `src/inspector/VideoRemoveBgPanel.tsx`
