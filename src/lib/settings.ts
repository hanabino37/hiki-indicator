import { ColorBand, defaultBands } from "./color";

export type AppSettings = {
  scheme: "ratio" | "z";
  ratioCap: number;
  bands: ColorBand[];
  alpha0: number; // Beta 事前
  beta0: number;
};

const KEY = "hiki-settings.v1";

export const defaultSettings: AppSettings = {
  scheme: "ratio",
  ratioCap: 3,
  bands: defaultBands,
  alpha0: 1,
  beta0: 1,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings, bands: [...defaultSettings.bands] };
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed, bands: parsed.bands ?? defaultSettings.bands };
  } catch {
    return { ...defaultSettings, bands: [...defaultSettings.bands] };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function exportSettings(s: AppSettings): string {
  return JSON.stringify(s, null, 2);
}

export function importSettings(json: string): AppSettings {
  const obj = JSON.parse(json);
  const merged: AppSettings = { ...defaultSettings, ...obj };
  return merged;
}
