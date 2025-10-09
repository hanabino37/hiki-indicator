export type Scheme = "ratio" | "z";

export type MetricContext = {
  value: number;      // 実測（回数や枚数）
  baseline: number;   // 基準（確率や平均）
  cap?: number;       // 比率の上限（既定3）
};

export type EvaluateResult = {
  ratio: number;  // 倍率（cap適用後）
  z: number;      // z値（log比から）
};

import { safeRatio, logRatioZ } from "./calc";

export function evaluateMetric(ctx: MetricContext): EvaluateResult {
  const ratio = safeRatio(ctx.value, ctx.baseline, ctx.cap ?? 3);
  const z = logRatioZ(ratio);
  return { ratio, z };
}
