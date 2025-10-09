export type ZSummary = { label: string; z: number };

export function zToScore(z: number) {
  // ざっくり：z=0→50, z=±2→約80/20, z=±3→約95/5 に寄せる
  const cdf = 0.5 * (1 + erf(z / Math.SQRT2));
  return Math.round(cdf * 100);
}

// 誤差関数（近似）
function erf(x: number) {
  // Abramowitz and Stegun 7.1.26
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function combineZ(zs: ZSummary[]) {
  if (!zs.length) return 50;
  const meanZ = zs.reduce((a, b) => a + b.z, 0) / zs.length;
  return zToScore(meanZ);
}

export function scoreBadge(score: number) {
  // 5段階：0–39 / 40–59 / 60–74 / 75–89 / 90–100（名称は仮）
  if (score >= 90) return { tier: 5, name: "超神引き" };
  if (score >= 75) return { tier: 4, name: "神引き" };
  if (score >= 60) return { tier: 3, name: "上ブレ" };
  if (score >= 40) return { tier: 2, name: "ふつう" };
  return { tier: 1, name: "下ブレ" };
}
