# MiniOS Classic — install as your new tab page

This folder works both as a standalone page (`index.html`) and as a Chromium extension (`manifest.json`). The extension is required to replace the browser's new-tab page.

The pinned extension ID remains `mhlkhodjmoldkdihbefnfbaofoeggemc`, so rebuilding or moving this folder does not create a new storage identity.

## Load the extension

1. Open `edge://extensions`, `chrome://extensions`, or `brave://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose `C:\Users\MATTHEWCOTO\WebOS95`.
4. Open a new tab.

After editing the TypeScript or CSS, run `npm run build`, then select **Reload** on the extension card.

## Switch desktops

Open **Settings** in MiniOS 95 or **Control Panels** in MiniOS 9, then choose a desktop style:

- Windows 95
- Mac OS 9

The same data is used in both modes. The terminal can also switch the desktop with `theme win95` or `theme macos9`.

## Local data and migration

The installed extension stores folders, bookmarks, notes, editor content, icon positions, and settings in `chrome.storage.local`. It is asynchronous and local to the browser profile.

On the first upgraded launch, MiniOS automatically migrates the original `web95.state.v1` value from `localStorage`. Opening `index.html` directly continues to use the loose-file fallback.

Data survives browser restarts, extension updates, and moving this folder because the extension identity is pinned. Removing the extension also removes its extension storage.

Before uninstalling, use **Settings / Control Panels → Export** and keep the JSON somewhere outside this folder. Use **Import** to restore it or copy it to another browser.

## Import browser bookmarks

**Import browser bookmarks…** requests the optional bookmarks permission and copies the browser bookmark tree into MiniOS. Declining the prompt falls back to pasting an exported `bookmarks.html` file.

## Browser behavior

- New tabs begin with focus in the browser address bar. Click the desktop before using MiniOS keyboard shortcuts.
- Incognito windows use the browser's own new-tab page.
- Extension pages cannot navigate directly to most `chrome://`, `edge://`, or other protected addresses.
- Local `file:///` shortcuts require **Allow access to file URLs** on the extension details page.

## Troubleshooting

- **Blank page:** run `npm run build`, confirm `web95.js` exists, and reload the extension.
- **New tab is unchanged:** check whether a managed `NewTabPageLocation` policy overrides extensions.
- **Load unpacked is unavailable:** check the browser's enterprise policies for extension developer-mode restrictions.
- **Existing loose-file data is missing:** export from the loose `file:///` page, then import into the installed extension; they have different storage origins.
