# Contributing to IndieCut

Thanks for helping improve IndieCut. This guide covers how to set up, develop,
and submit changes.

## Code of conduct

Please read and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful
and constructive in issues, discussions, and PRs.

## Development setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run the desktop app: `npm run dev` (or web PWA: `npm run dev:web`)
4. Before opening a PR, run:

```bash
npm run typecheck
npm run test:unit
```

## Project conventions

- **TypeScript** for app code under `packages/editor/src/` (shared) and `apps/*/src/`
- Prefer small, focused PRs over large mixed changes
- Match existing patterns for compositor, timeline, and inspector panels
- Do not commit `node_modules/`, `dist/`, `.env*`, or local build artifacts
- Do not add CapCut (or other competitor) branding to source or docs
- Keep third-party licenses accurate — update [NOTICE.md](NOTICE.md) when adding
  dependencies or bundled assets

## What to work on

Good contributions include:

- Bug fixes with a clear reproduction
- Tests for engine / compositor behavior
- Docs and accessibility improvements
- Performance fixes with before/after notes when possible

Ask in an issue before large features or refactors so maintainers can align on
scope.

## Pull requests

1. Create a branch from `main` (or the default branch)
2. Make your changes with clear commits
3. Ensure typecheck and unit tests pass
4. Open a PR with:
   - **What** changed
   - **Why** (bug link or motivation)
   - **How to test** (steps, platforms)

Maintainers may request changes. Squash or rebase if asked for a clean history.

## Reporting bugs

Open an issue with:

- IndieCut version / commit
- OS and architecture
- Steps to reproduce
- Expected vs actual behavior
- Logs or screenshots if relevant

## Security

If you believe you found a security issue, **do not** open a public issue with
exploit details. Follow [SECURITY.md](SECURITY.md) to report privately.

## License

By contributing, you agree that your contributions are licensed under the
project’s [MIT License](LICENSE).
