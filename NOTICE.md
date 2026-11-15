# Third-party notices

IndieCut is MIT-licensed (see `LICENSE`). This file lists third-party software
and assets redistributed with or used by the project. Keep this notice when
redistributing IndieCut.

## Runtime & frameworks

| Component | Use in IndieCut | License |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | Desktop shell | MIT |
| Chromium (via Electron) | Embedded browser / rendering | [Chromium licenses](https://www.chromium.org/chromium-projects/) (BSD-style and others; Electron builds include `LICENSES.chromium.html`) |
| [Node.js](https://nodejs.org/) (via Electron) | Main process | [Node license](https://raw.githubusercontent.com/nodejs/node/main/LICENSE) |
| [React](https://react.dev/) / React DOM | UI | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | State | MIT |
| [Vite](https://vitejs.dev/) | Dev server / bundler | MIT |
| [localforage](https://localforage.github.io/localForage/) | Persistence | Apache-2.0 |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Layout | MIT |

## Media & AI

| Component | Use in IndieCut | License |
| --- | --- | --- |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | Media decode / mux | **MPL-2.0** (file-level copyleft — see package license) |
| [@huggingface/transformers](https://github.com/huggingface/transformers.js) | On-device caption / ML helpers | Apache-2.0 |
| [ONNX Runtime Web](https://onnxruntime.ai/) (`onnxruntime-web`) | WASM inference runtime | MIT |
| ORT WASM assets under `public/ort/` | Copied at install from `onnxruntime-web` / transformers (`scripts/copy-ort-assets.mjs`) | MIT (same as ONNX Runtime Web) |

Downloaded ML **model weights** (if any) are subject to their own Hugging Face /
model-card licenses and are not covered by IndieCut’s MIT license.

## Fonts

Bundled text faces under `assets/fonts/` — see `assets/fonts/LICENSE.md`.

| Family | License |
| --- | --- |
| Inter, Bangers, Fredoka, Anton, Permanent Marker, Comic Neue, Montserrat, Rubik Mono One, Pacifico, Press Start 2P, Playfair Display, Space Grotesk | OFL-1.1 |

Source: [Google Fonts](https://fonts.google.com/) / [Fontsource](https://fontsource.org/).

UI may also load **Geist** from Google Fonts at runtime (OFL-1.1); that face is
not vendored in `assets/fonts/`.

## IndieCut first-party assets

These packs are original IndieCut content and are released with the project
under the MIT license unless a nested file says otherwise:

| Asset | Location | Notes |
| --- | --- | --- |
| Kinetic stickers | `assets/stickers/`, generated SVGs | See `assets/stickers/LICENSE.md` |
| Text templates | `assets/text-templates/` | IndieCut |
| Text animations | `assets/text-animations/` | IndieCut |
| Effects | `assets/effects/` | IndieCut |
| Transitions | `assets/transitions/` | IndieCut |
| Filters / LUTs | `assets/filters/` | IndieCut original `.cube` LUTs |
| Sound effects | `assets/sound_effects/` | IndieCut bundled SFX pack |

## Build tooling (dev / packaging)

Electron Builder, TypeScript, and related tooling are used to develop and
package the app. Their licenses apply to those tools as used; they are not
embedded in the IndieCut source itself. Packaged Electron apps additionally
ship Chromium and Node license texts inside the application bundle.
