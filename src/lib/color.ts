export type ColorBand = {
  name: string;
  min?: number; // inclusive
  max?: number; // exclusive
  color: string;
};

export const defaultBands: ColorBand[] = [
  { name: "白", max: 0.8, color: "#ffffff" },
  { name: "青", min: 0.8, max: 0.95, color: "#4ea5ff" },
  { name: "黄", min: 0.95, max: 1.05, color: "#ffd34e" },
  { name: "緑", min: 1.05, max: 1.2, color: "#57c189" },
  { name: "赤", min: 1.2, color: "#ff5a5a" },
];

export function pickBand(bands: ColorBand[], ratio: number): ColorBand {
  for (const b of bands) {
    const ge = b.min === undefined || ratio >= b.min;
    const lt = b.max === undefined || ratio < b.max;
    if (ge && lt) return b;
  }
  return bands[bands.length - 1];
}
