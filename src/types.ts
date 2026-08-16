export type Appearance = "win95" | "macos9";
export type ShellName = "powershell" | "bash" | "zsh" | "coto";
export type LinkTarget = "same" | "new";
export type WallpaperMode = "fit" | "center" | "tile" | "stretch";
export type TimeFormat = "12" | "24";

export interface FolderNode {
  id: string;
  type: "folder";
  name: string;
  children: FileSystemNode[];
}

export interface LinkNode {
  id: string;
  type: "link";
  name: string;
  url: string;
}

export type FileSystemNode = FolderNode | LinkNode;

export interface EditorDocument {
  name: string;
  language: string;
  wrap: boolean;
  fontSize: number;
  text: string;
}

export interface Point {
  x: number;
  y: number;
}

export type CotoAccent = "orbit" | "coral" | "mint";

export interface CotoCapture {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface CotoState {
  accent: CotoAccent;
  captures: CotoCapture[];
  sourceName: string;
  source: string;
}

export interface MiniOSState {
  version: 2;
  appearance: Appearance;
  shell: ShellName;
  engine: string;
  linkTarget: LinkTarget;
  desktopColor: string;
  wallpaper: string;
  wallpaperMode: WallpaperMode;
  wallpaperSize: number;
  wallpaperFade: number;
  user: string;
  host: string;
  timeZone: string;
  timeFormat: TimeFormat;
  showOmni: boolean;
  showToday: boolean;
  crtEffect: boolean;
  npp: EditorDocument;
  notes: Record<string, string>;
  iconPos: Record<string, Point>;
  coto: CotoState;
  fs: FolderNode;
}

export type IconName =
  | "folder"
  | "folderOpen"
  | "link"
  | "terminal"
  | "bash"
  | "zsh"
  | "notepad"
  | "npp"
  | "settings"
  | "computer"
  | "help"
  | "find"
  | "run"
  | "shutdown"
  | "win"
  | "recycle"
  | "warn"
  | "up"
  | "coto"
  | "cotosh";

export type IconSet = Record<IconName, string>;

export interface WallpaperPreset {
  name: string;
  src: string;
  mode: WallpaperMode;
  size: number;
  color: string;
}

export interface ThemeMenuLabels {
  applications: string;
  favorites: string;
  computer: string;
  settings: string;
  shutdown: string;
}

export interface ThemeProfile {
  id: Appearance;
  name: string;
  shortName: string;
  launcherLabel: string;
  launcherTitle: string;
  computerName: string;
  icons: IconSet;
  wallpapers: WallpaperPreset[];
  menu: ThemeMenuLabels;
}
