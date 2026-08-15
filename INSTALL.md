# MiniOS 95 — install as your new tab page

This folder is both a standalone page (`index.html`) and a loadable browser extension
(`manifest.json`). Loading it as an extension is the only way a page can replace the
**new tab** — browser settings alone cannot do it.

You can move this folder later without losing anything: `manifest.json` contains a `key`,
which pins the extension's identity (and therefore its storage) to that key instead of to
the folder path. Just don't put it in OneDrive, and re-point *Load unpacked* at the new
location if you move it.

Pinned extension ID: `mhlkhodjmoldkdihbefnfbaofoeggemc`
Page address once loaded: `chrome-extension://mhlkhodjmoldkdihbefnfbaofoeggemc/index.html`

The matching private key is `C:\Users\MATTHEWCOTO\minios95-extension-key.pem`, kept
outside this folder on purpose so it never ships inside the extension. You only need it if
you ever pack a `.crx` and want the same ID; nothing here uses it.

## Load it (Edge, Chrome and Brave are all the same three clicks)

1. Open the extensions page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Turn on **Developer mode** (Edge: bottom-left toggle. Chrome/Brave: top-right toggle).
3. Click **Load unpacked** and select the folder `C:\Users\MATTHEWCOTO\WebOS95`.

Open a new tab. That's it.

Repeat in each browser you want it in — each browser keeps its own copy of your
folders and settings.

Two things that are browser behaviour, not bugs:

- A new tab opens with the cursor in the **address bar**, so typing goes there, not into
  MiniOS. Click the desktop once first if you want the in-page search box or the keyboard
  shortcuts. No page can take focus away from the omnibox.
- **Incognito windows** always show the browser's own new tab page.

## Importing your existing bookmarks

Settings → **Import browser bookmarks…** asks the browser for permission (declared as an
*optional* permission, so installing MiniOS 95 shows no warnings), then copies your whole
bookmark tree into a folder called *Browser bookmarks*. Accept the prompt and it happens in
one click; decline and it falls back to pasting an exported `bookmarks.html`. The terminal
has both paths too: `import-browser` and `import-html`.

## Also use it for the Home button and on startup

Paste this into the settings below:

```
chrome-extension://mhlkhodjmoldkdihbefnfbaofoeggemc/index.html
```

- **Edge:** Settings → Start, home, and new tabs → *Open these pages* / *Home button*
- **Chrome / Brave:** Settings → On startup → *Open a specific page*, and
  Appearance → Show home button

## Backups

Your folders, bookmarks, notes and settings live in the browser's local storage for the
extension's address. They survive browser restarts, browser updates, and moving the folder
(thanks to the pinned `key`). They are **erased if you remove the extension**, and they are
per-browser — Edge, Chrome and Brave each keep their own.

So before uninstalling: open **Settings → Export**, copy the JSON, keep it somewhere.
**Settings → Import** puts it back — also how you copy your setup between browsers.

If you already built folders in the loose-file version, they are stored under the
`file:///` address and will **not** appear in the extension. Open the file once more,
Export there, then Import here.

## If it does not work

- **No Developer mode toggle, or *Load unpacked* is missing/greyed out** — a work
  policy is blocking it. Check `edge://policy` (or `chrome://policy`) for
  `ExtensionInstallBlocklist`, `ExtensionSettings`, `BlockExternalExtensions`, or
  `ExtensionDeveloperModeSettings`.
- **New tab still shows the browser's own page** — check `edge://policy` for
  `NewTabPageLocation`. A managed new tab page overrides extensions.
- **"Disable developer mode extensions" bubble on startup** — dismiss it; choosing
  *Disable* turns MiniOS 95 off, and you re-enable it on the extensions page.
- **Blank page** — make sure `index.html`, `web95.js`, `manifest.json` and `icons/`
  are all still in the folder, then click *Reload* on the extensions page. If you ever
  edit `index.html`, keep the script in `web95.js`: extension pages refuse to run inline
  `<script>` blocks, and an inline script is the usual cause of a blank override page.
- **A `file:///` or `chrome://` bookmark won't open** — extension pages are not allowed to
  navigate there. MiniOS now says so and shows the address to paste. For local files only,
  the extension's details page has *Allow access to file URLs*, which makes them work.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: markup and all the Windows 95 styling |
| `web95.js` | Everything else: window manager, folders, terminal, settings |
| `manifest.json` | Makes the folder a browser extension that overrides the new tab |
| `icons/*.png` | Extension icons (the wavy flag, for the browser's own UI) |
| `assets/*.ico` | The real Windows 95 shell icons used inside the desktop |
| `Windows_Logo_(1992-2001).svg` | The flag artwork, used as the default wallpaper |
| `win95-winxp_icons-master/` | The original icon pack — **safe to delete**, see below |

## Icons and wallpaper

The desktop uses genuine Win95 shell icons, copied out of your pack into `assets/`:

| Slot | From the pack |
|---|---|
| folder / open folder | `w95_4` / `w95_5` |
| internet shortcut | `w95_14` (globe) |
| My Computer | `w95_16` |
| Notepad | `w95_60` |
| Settings | `w95_61` |
| Read Me | `w95_24` |
| Find | `w95_23` |
| Up one level | `w95_31` |
| Run… | `w95_3` |
| Start button | `w95_40` (the pixel flag) |
| Recycle Bin | `w95_32` |

The three terminal icons stay hand-drawn on purpose: they are tinted per shell —
PowerShell blue, Bash black, Zsh charcoal — which one shared MS-DOS icon cannot show.
The dialog warning triangle and the shutdown glyph are also drawn, as the pack has no
matching Win95-era equivalents.

Only `assets/` is used at runtime, so the 8.6 MB `win95-winxp_icons-master/` folder can be
deleted once you are happy with the look. To swap an icon, replace the file in `assets/`
keeping the same name, then open a new tab.

**Wallpaper:** Settings → *Wallpaper* takes any image sitting next to `index.html` (or a
URL), with Fit / Centre / Tile / Stretch, a size slider, and a strength slider that fades it
into the desktop colour. Default is the Windows flag at 45%. From a terminal:
`wallpaper <file|none> [fit|center|tile|stretch] [10-100%]`.
