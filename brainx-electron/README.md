# BrainX Electron

`brainx-electron` is the installable desktop shell for BrainX. The goal of phase 1 is not a full local-first vault yet, but a stable desktop app that each user can install and run on their own PC.

## Current Phase 1 Scope

- Reuse `brainx-next` instead of rewriting the UI
- Keep server-connected BrainX features working inside Electron
- Replace browser-only popup/file/session flows with desktop bridges
- Prepare the packaged app to prefer a bundled local renderer before falling back to the remote web deployment

## Folder Layout

```text
brainx-electron/
|-- scripts/
|   `-- build-renderer.mjs   # builds and copies the bundled Next standalone renderer
|-- src/
|   |-- main/                # Electron main process
|   |-- preload/             # secure renderer bridge
|   `-- shared/              # shared desktop API types
|-- .app-bundle/             # generated bundled renderer payload
|-- dist/                    # compiled Electron output
|-- package.json
`-- tsconfig.json
```

## Scripts

- `npm run dev`
  - runs `brainx-next` dev server on port `3000`
  - watches Electron TypeScript
  - launches the Electron shell against the local dev server
- `npm run build`
  - compiles Electron TypeScript only
- `npm run build:renderer`
  - builds `brainx-next` in standalone mode
  - copies `.next/standalone`, `.next/static`, and `public` into `.app-bundle/standalone`
- `npm run build:app`
  - builds the bundled renderer first, then Electron
- `npm run start:bundled`
  - builds the packaged-app runtime pieces and starts Electron
- `npm run dist:win`
  - creates a Windows NSIS installer

## Runtime Modes

- `dev-server`
  - used in local development
  - Electron loads `http://127.0.0.1:3000`
- `bundled-standalone`
  - preferred packaged mode
  - Electron forks the bundled Next standalone server from `.app-bundle/standalone/server.js`
  - renderer assets are loaded from local app resources
- `remote-web`
  - fallback packaged mode if the bundled renderer is missing or fails to boot
  - Electron falls back to `https://brainx.p-e.kr/`

## Phase 1 Desktop Behaviors

- single-instance lock
- custom protocol deep link scaffold (`brainx://...`)
- popup bridge for OAuth/payment flows
- desktop-backed local/session storage bridge
- native open/save file dialogs
- basic application menu
- fallback error screen when the renderer cannot load

## Phase 2 Local Vault Foundation

- recent vault metadata is persisted in the Electron user-data directory
- the preload bridge can list, create, and select vault folders
- each vault is normalized into `notes/`, `assets/`, `exports/`, and `.brainx/workspace.json`

## Current Local Vault Runtime

- first launch of `/notes` now blocks on vault selection inside Electron
- vault note and folder metadata are persisted in `.brainx/index.json`
- note bodies are stored as markdown files in `notes/`
- vault asset writes are stored in `assets/`
- sync policy is tracked separately so local-only and future cloud sync modes do not share the same persistence path

## Remaining Local-First Work

- redirect actual note and asset persistence into the vault storage layer
- add offline-first note loading and save flows
- define sync strategy between local vaults and BrainX cloud services
