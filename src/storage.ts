import type { MiniOSState } from "./types";

const STORAGE_KEY = "minios.state.v2";
const SEEN_KEY = "minios.onboarding.seen.v2";
const LEGACY_KEY = "web95.state.v1";

interface ExtensionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function extensionStorage(): ExtensionStorageArea | null {
  const candidate = (globalThis as typeof globalThis & {
    chrome?: { storage?: { local?: ExtensionStorageArea } };
  }).chrome?.storage?.local;
  return candidate ?? null;
}

function readLegacyState(): Partial<MiniOSState> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) as Partial<MiniOSState> : null;
  } catch {
    return null;
  }
}

function normalizeState(stored: Partial<MiniOSState> | null, defaults: MiniOSState): MiniOSState {
  if (!stored) return defaults;
  const cotoAccent = stored.coto?.accent;
  return {
    ...defaults,
    ...stored,
    version: 2,
    appearance: stored.appearance === "macos9" ? "macos9" : "win95",
    shell: stored.shell === "bash" || stored.shell === "zsh" || stored.shell === "coto" ? stored.shell : "powershell",
    timeZone: typeof stored.timeZone === "string" ? stored.timeZone : defaults.timeZone,
    timeFormat: stored.timeFormat === "12" || stored.timeFormat === "24" ? stored.timeFormat : defaults.timeFormat,
    fs: stored.fs ?? defaults.fs,
    notes: stored.notes ?? defaults.notes,
    npp: { ...defaults.npp, ...(stored.npp ?? {}) },
    iconPos: stored.iconPos ?? {},
    coto: {
      ...defaults.coto,
      ...(stored.coto ?? {}),
      accent: cotoAccent === "coral" || cotoAccent === "mint" || cotoAccent === "orbit" ? cotoAccent : defaults.coto.accent,
      captures: Array.isArray(stored.coto?.captures) ? stored.coto.captures : defaults.coto.captures,
    },
  };
}

export interface StateStore {
  load(): Promise<MiniOSState>;
  save(state: MiniOSState): Promise<void>;
  clear(): Promise<void>;
  hasSeenOnboarding(): Promise<boolean>;
  markOnboardingSeen(): Promise<void>;
}

export function createStateStore(createDefaults: () => MiniOSState): StateStore {
  const storage = extensionStorage();

  return {
    async load() {
      if (storage) {
        const result = await storage.get(STORAGE_KEY);
        const stored = result[STORAGE_KEY] as Partial<MiniOSState> | undefined;
        if (stored) return normalizeState(stored, createDefaults());

        const legacy = readLegacyState();
        const migrated = normalizeState(legacy, createDefaults());
        if (legacy) {
          await storage.set({ [STORAGE_KEY]: migrated });
          localStorage.removeItem(LEGACY_KEY);
        }
        return migrated;
      }

      return normalizeState(readLegacyState(), createDefaults());
    },

    async save(state) {
      if (storage) {
        await storage.set({ [STORAGE_KEY]: state });
        return;
      }
      localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
    },

    async clear() {
      if (storage) await storage.remove([STORAGE_KEY, SEEN_KEY]);
      try {
        localStorage.removeItem(LEGACY_KEY);
        localStorage.removeItem(`${LEGACY_KEY}.seen`);
      } catch {
        // Storage can be unavailable for loose files in hardened browser modes.
      }
    },

    async hasSeenOnboarding() {
      if (storage) {
        const result = await storage.get(SEEN_KEY);
        return result[SEEN_KEY] === true;
      }
      try {
        return localStorage.getItem(`${LEGACY_KEY}.seen`) === "1";
      } catch {
        return true;
      }
    },

    async markOnboardingSeen() {
      if (storage) {
        await storage.set({ [SEEN_KEY]: true });
        return;
      }
      try {
        localStorage.setItem(`${LEGACY_KEY}.seen`, "1");
      } catch {
        // The application remains usable without the onboarding marker.
      }
    },
  };
}
