# MiniOS Classic

MiniOS Classic is a lightweight, local-first new-tab desktop with two switchable personalities:

- **MiniOS 95** — Windows 95 chrome, taskbar, icons, and wallpaper presets.
- **MiniOS 9** — Mac OS 9 Platinum chrome, menu bar, icons, and wallpaper presets.

Both styles use the same folders, bookmarks, notes, editor document, terminal, and settings. Switching the appearance never creates a second copy of the user's data.

## Technology

- TypeScript compiled to one local JavaScript bundle
- Native DOM and browser APIs; no UI framework or runtime dependency
- CSS theme profiles selected with `data-os="win95"` or `data-os="macos9"`
- `chrome.storage.local` in extension mode, with migration from the original `localStorage` state
- `localStorage` fallback when opening `index.html` as a loose file

## Development

Install Node.js, then run:

```powershell
npm install
npm run build
```

Useful commands:

```powershell
npm run typecheck
npm run build:watch
```

`npm run build` type-checks the project and bundles `src/main.ts` into `web95.js`. Reload the unpacked extension after rebuilding.

## Architecture

| Path | Purpose |
|---|---|
| `src/types.ts` | Shared state, filesystem, icon, and theme types |
| `src/themes.ts` | Windows 95 and Mac OS 9 profiles, labels, icons, and presets |
| `src/storage.ts` | Asynchronous extension storage and legacy migration |
| `src/dom.ts` | Typed native-DOM helpers |
| `src/main.ts` | Window manager, apps, terminal, settings, and boot flow |
| `themes.css` | Shared component additions and Mac OS 9 Platinum overrides |
| `index.html` | Static shell and Windows 95 baseline styles |
| `web95.js` | Generated browser bundle; do not edit by hand |

## Switching desktops

Open **Settings / Control Panels → Desktop style**, or use the terminal:

```text
theme win95
theme macos9
```

See [INSTALL.md](INSTALL.md) for extension installation and backup details.
