export function formatRateFromDenom(denom: number, precision = 0) {
  if (!Number.isFinite(denom) || denom <= 0) return "—";
  const fixed = denom.toFixed(precision);
  return `1/${fixed}`;
}

export function formatPct(value: number, precision = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(precision)}%`;
}

export function formatNumber(value: number, precision = 0) {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(precision)).toLocaleString();
}
