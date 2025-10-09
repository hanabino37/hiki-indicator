export type RatioInput = { label: string; value: number; baseline: number };

export function safeRatio(v: number, b: number, cap = 3) {
  if (!isFinite(v) || !isFinite(b) || b <= 0) return 1;
  const r = v / b;
  return Math.max(1 / cap, Math.min(cap, r));
}

// 簡易ログ比→z換算。分散スケールは調整用（設定で後日調整予定）。
export function logRatioZ(ratio: number, s = 0.25) {
  const lr = Math.log(Math.max(1e-9, ratio));
  return lr / s;
}

// Beta-Binomial 風の収縮（簡易版）：観測x/N、事前α0,β0、基準確率p0
export function shrinkBinomial(
  x: number,
  N: number,
  alpha0 = 1,
  beta0 = 1
) {
  // 事後平均 E[p | x] = (x+α0)/(N+α0+β0)
  if (!isFinite(x) || !isFinite(N) || N < 0) return 0;
  return (x + alpha0) / Math.max(1, N + alpha0 + beta0);
}

// 表示用：×1.23 のような倍率テキスト
export function mulText(r: number) {
  return `×${r.toFixed(2)}`;
}
