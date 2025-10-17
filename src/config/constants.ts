export const RTP_EQUAL_EPSILON_PP = 0.1;          // ±0.1pp以内を「＝」
export const DEFAULT_SIGMA_FALLBACK = 30;
export const SIGMA_PRESETS = { A: 20, standard: 30, rough: 45 } as const;

export const SIGMA_K0 = 10;                        // sigma ≈ k0 * (coinUnitPriceYen / rateYenPerCoin)

export const LUCK_BANDS = [
  { max: 60,  key: "low",    color: "#9aa0a6" },  // 灰
  { max: 80,  key: "mid",    colorUp: "#1a73e8", colorDown: "#fb8c00" }, // ↑青/↓橙
  { max: 95,  key: "high",   color: "#1f3b64" },  // 濃色
  { max: 101, key: "ultra",  color: "#7e57c2" },  // 紫
];

export const PAYOUT_SCALE = { min: 70, mid: 100, max: 130 } as const;

export const PROB_SCALE_FACTOR = 1.5;              // 分母系 min=mid/1.5, max=mid*1.5
