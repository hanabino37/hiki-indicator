export function formatByPrecision(v: number | null | undefined, precision = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  const f = Math.pow(10, precision);
  return (Math.round(v * f) / f).toFixed(precision);
}
