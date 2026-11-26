/**
 * IndieCut AI features — host-first chat + capability catalog protocol.
 *
 * Model-facing surface: seven Anthropic tools in `protocol/tools.ts`
 * backed by `catalog/` registrations. Chat chrome, secrets, streaming,
 * Ask/Agent, Action Cards, and vision heuristics live under `chat/`,
 * `secrets/`, `providers/`, and `context/`. Captions (Whisper) under
 * `captions/` — also exposed via skill_run / catalog.
 */
