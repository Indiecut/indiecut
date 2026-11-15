# IndieCut

**IndieCut** is an open-source desktop video editor — timeline editing, preview,
export, text & stickers, captions, effects, and more — built with Electron,
React, and Vite.

[![Download for Mac](https://img.shields.io/badge/Download-macOS-0e1012?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-mac-arm64.dmg)
[![Download for Windows](https://img.shields.io/badge/Download-Windows-0e1012?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-win-x64-setup.exe)
[![Past releases](https://img.shields.io/badge/Past-releases-9aa3ad?style=for-the-badge)](https://github.com/Indiecut/indiecut/releases)

[Intel Mac (.dmg)](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-mac-x64.dmg)

**Website:** [indiecut.io](https://indiecut.io)  
**Source:** [github.com/Indiecut/indiecut](https://github.com/Indiecut/indiecut)  
**Version:** 1.0.0  
**License:** [MIT](LICENSE)

## Features

- Multi-track timeline with video, audio, text, stickers, captions, and effects
- Canvas preview with transforms, blend modes, masks, and 3D plane controls
- 500 Kinetic SVG stickers and 500 editable text templates
- Captions / speech helpers (on-device via Transformers.js + ONNX Runtime)
- Sound effects, transitions, filters (LUTs), and text animations
- Export via Electron packaging (`electron-builder`)

## Requirements

- **Node.js** 20+ (recommended)
- **npm** 10+
- macOS, Windows, or Linux (Electron)

## Quick start

```bash
git clone https://github.com/Indiecut/indiecut.git
cd indiecut
npm install
npm run dev
```

This starts the Vite dev server and opens the Electron shell.

### Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev app (Vite + Electron) |
| `npm run build` | Production web/renderer build |
| `npm run typecheck` | TypeScript check |
| `npm run test:unit` | Unit tests |
| `npm run pack` | Unpackaged Electron build |
| `npm run dist:mac` | macOS DMGs (arm64 + x64) via electron-builder |
| `npm run dist:win` | Windows NSIS installer (`.exe`) via electron-builder |
| `npm run dist` | Package for macOS and Windows (platform host permitting) |

## Downloads / releases

| Platform | Download |
| --- | --- |
| macOS Apple Silicon | [IndieCut-mac-arm64.dmg](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-mac-arm64.dmg) |
| macOS Intel | [IndieCut-mac-x64.dmg](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-mac-x64.dmg) |
| Windows x64 | [IndieCut-win-x64-setup.exe](https://github.com/Indiecut/indiecut/releases/latest/download/IndieCut-win-x64-setup.exe) |

**Ship a release**

1. Bump `"version"` in `package.json`
2. Commit, then tag: `git tag v1.0.0 && git push origin v1.0.0`
3. The [Release](.github/workflows/release.yml) workflow builds Mac + Windows installers and publishes them on that tag

**Build locally**

```bash
# macOS host → .dmg files in release/
npm run dist:mac

# Windows host → NSIS setup .exe in release/
npm run dist:win
```

Installers are unsigned by default. On macOS, right-click → **Open** the first time if Gatekeeper blocks the app. On Windows, SmartScreen may require **More info** → **Run anyway**.

## Project layout

```
assets/          Stickers, fonts, SFX, effects, templates
electron/        Electron main process
public/          Static assets (incl. ORT WASM copies)
scripts/         Install / asset helpers
src/             React app, compositor, engine, export
```

## License & notices

- Application source and IndieCut-original assets: **MIT** — see [LICENSE](LICENSE)
- Third-party software and fonts: **[NOTICE.md](NOTICE.md)** and `assets/fonts/LICENSE.md`
- **mediabunny** is licensed under **MPL-2.0**; respect its terms when modifying or redistributing that dependency

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Links

- Website: [https://indiecut.io](https://indiecut.io)
- GitHub: [https://github.com/Indiecut/indiecut](https://github.com/Indiecut/indiecut)
- Issues: [https://github.com/Indiecut/indiecut/issues](https://github.com/Indiecut/indiecut/issues)

## Trademark

“IndieCut” and the app icon may be used to refer to this project. Do not imply
official endorsement for forks without permission from the maintainers.
