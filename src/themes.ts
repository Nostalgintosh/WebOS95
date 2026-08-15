import type { Appearance, IconSet, ThemeProfile } from "./types";

export const AS_EXTENSION = /^(chrome|moz)-extension:$/.test(location.protocol);
export const WINDOWS_LOGO = "Windows_Logo_(1992-2001).svg";

const svg = (source: string): string => "data:image/svg+xml;utf8," + encodeURIComponent(source);

const sharedIcons = {
  terminal: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#000080"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#fff">&gt;_</text></svg>`),
  bash: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#0c0c0c"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#78dc52">$_</text></svg>`),
  zsh: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#151515"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#ff7ad9">%_</text></svg>`),
  npp: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M5 2h19l4 4v24H5z" fill="#fff" stroke="#000"/><path d="M24 2v5h5" fill="#c0c0c0" stroke="#000"/><rect x="7" y="5" width="15" height="4" fill="#249c3d"/><path d="M8 13h12M8 17h9M8 21h12" stroke="#555"/><rect x="18" y="19" width="12" height="12" fill="#249c3d" stroke="#000"/><path d="M24 21v8M20 25h8" stroke="#fff" stroke-width="2"/></svg>`),
  shutdown: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="17" r="11" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><path d="M16 5v12" stroke="#c00" stroke-width="4"/></svg>`),
  warn: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 2l14 27H2z" fill="#ffd700" stroke="#000" stroke-width="1.5"/><text x="13" y="26" font-family="serif" font-size="17" font-weight="bold">!</text></svg>`),
} as const;

const win95Icons: IconSet = {
  ...sharedIcons,
  folder: "assets/folder.ico",
  folderOpen: "assets/folder-open.ico",
  link: "assets/link.ico",
  notepad: "assets/notepad.ico",
  settings: "assets/settings.ico",
  computer: "assets/computer.ico",
  help: "assets/help.ico",
  find: "assets/find.ico",
  run: "assets/run.ico",
  win: "assets/flag.ico",
  recycle: "assets/recycle.ico",
  up: "assets/up.ico",
};

const macos9Icons: IconSet = {
  ...sharedIcons,
  folder: "assets/mac/folder.png",
  folderOpen: "assets/mac/folder-open.png",
  link: "assets/mac/internet.png",
  notepad: "assets/mac/notepad.png",
  settings: "assets/mac/settings.png",
  computer: "assets/mac/computer.png",
  help: "assets/mac/help.png",
  find: "assets/mac/find.png",
  run: "assets/mac/run.png",
  win: "assets/mac/system.png",
  recycle: "assets/mac/trash.png",
  up: "assets/up.ico",
};

export const THEMES: Record<Appearance, ThemeProfile> = {
  win95: {
    id: "win95",
    name: "Windows 95",
    shortName: "MiniOS 95",
    launcherLabel: "Start",
    launcherTitle: "Click here to begin",
    computerName: "My Computer",
    icons: win95Icons,
    wallpapers: [
      { name: "Classic Flag", src: WINDOWS_LOGO, mode: "fit", size: 45, color: "#008080" },
      { name: "Windows 95", src: "Wallpaper/WindowsbyMicrosoft.webp", mode: "stretch", size: 100, color: "#3f70a5" },
      { name: "Vaporwave 95", src: "Wallpaper/aesthetic-background-ktolv5jc30xsjwm8.jpg", mode: "stretch", size: 100, color: "#25133b" },
      { name: "Green Hills", src: "Wallpaper/a7a20e9a4c0c5ed6af6cbaf3c268d701.jpg", mode: "stretch", size: 100, color: "#3a6ea5" },
    ],
    menu: { applications: "Programs", favorites: "Favorites", computer: "My Computer", settings: "Settings", shutdown: "Shut Down…" },
  },
  macos9: {
    id: "macos9",
    name: "Mac OS 9",
    shortName: "MiniOS 9",
    launcherLabel: "Menu",
    launcherTitle: "Apple menu",
    computerName: "Macintosh HD",
    icons: macos9Icons,
    wallpapers: [
      { name: "Mac OS 9 Blue", src: "assets/mac/mac-os-9-wallpaper.svg", mode: "tile", size: 100, color: "#5f89b4" },
      { name: "Clouds", src: "Wallpaper/Clouds_(Windows_95).png", mode: "stretch", size: 100, color: "#789bc1" },
    ],
    menu: { applications: "Applications", favorites: "Favorites", computer: "Macintosh HD", settings: "Control Panels", shutdown: "Shut Down…" },
  },
};

export function themeFor(appearance: Appearance | undefined): ThemeProfile {
  return THEMES[appearance === "macos9" ? "macos9" : "win95"];
}

export function applyThemeIdentity(theme: ThemeProfile): void {
  document.documentElement.dataset.os = theme.id;
  document.title = `${theme.shortName} — A nicer place to start`;
}
