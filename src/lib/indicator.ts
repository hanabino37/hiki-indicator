// src/lib/indicator.ts
import type { MachineRecord, BenchmarkDef } from "../types/schema";
import { formatNumber, formatRateFromDenom } from "./format";

export type IndicatorRow = {
  key: string;
  label: string;
  value: number | null;     // 画面表示に使う値（確率は 1/◯◯ の分母でも可）
  baseline?: number;        // baseline は確率 p（0〜1）
  score: number | null;
  color: "white" | "blue" | "yellow" | "green" | "red" | "orange" | "purple"; 
  scale?: { min: number; mid: number; max: number };
};

function toNum(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "string" && x.trim() === "") return null; // 空白も無効
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function colorToCss(c: IndicatorRow["color"]): string {
  switch (c) {
    case "white": return "#ffffff";
    case "blue": return "#4da3ff";
    case "yellow": return "#ffd84d";
    case "green": return "#48d17a";
    case "red": return "#ff6b6b";
    case "orange": return "#ffa726";   // ← 追加（downの中～高）
    case "purple": return "#9c27b0";   // ← 追加（特異）
    default: return "#ffffff";
  }
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function colorByBands(score: number | null, bands?: number[]): IndicatorRow["color"] {
  if (score === null || !Array.isArray(bands) || bands.length !== 4) return "white";
  const [b1, b2, b3, b4] = bands;
  if (score < b1) return "white";
  if (score < b2) return "blue";
  if (score < b3) return "yellow";
  if (score < b4) return "green";
  return "red";
}

/** 1/denom 入力を p(確率) に正規化 */
function denomToP(v: unknown): number | null {
  const d = toNum(v);
  return d && d > 0 ? 1 / d : null;
}

/** 指標の計算 */
export function computeIndicators(
  machine: MachineRecord,
  inputsRaw: Record<string, unknown>,
  outputsRaw: Record<string, unknown> = {}
): IndicatorRow[] {
  const labels = machine.labelsJP ?? {};
  const defs = machine.benchmarks ?? {};
  const rows: IndicatorRow[] = [];

  for (const [key, bm] of Object.entries(defs)) {
    rows.push(calcOne(key, bm, labels, inputsRaw, outputsRaw));
  }

  // ※ LUCK% は IndicatorRow ではなく、toChartRows(..., outputsRaw) 側で ChartRow として追加します
  return rows;
}

function calcOne(
  key: string,
  bm: BenchmarkDef,
  labels: Record<string, string>,
  inputsRaw: Record<string, unknown>,
  outputsRaw: Record<string, unknown>
): IndicatorRow {
  const label = labels[key] ?? key;
  let value: number | null = null;
  const base = toNum(bm.baseline); // baseline は p(0〜1)
  const higherIsBetter = bm.higherIsBetter !== false;
  let score: number | null = null;

  // 最終的に使うスケール（自動補完をここに入れる）
  let scaleOverride: { min: number; mid: number; max: number } | undefined;

  if (bm.method === "diff") {
    const v = bm.valueKey
      ? (toNum(outputsRaw[bm.valueKey]) ?? toNum(inputsRaw[bm.valueKey]))
      : (toNum(outputsRaw[key]) ?? toNum(inputsRaw[key]));
    value = v;

    // payoutPct のフォールバック
    if (v == null && (bm.valueKey === "payoutPct" || key === "payoutPct")) {
      const ts = toNum(inputsRaw["totalSpins"]) ?? 0;
      const dc = toNum(inputsRaw["diffCoins"]) ?? 0;
      if (ts > 0) value = ((3 * ts + dc) / (3 * ts)) * 100;
    }

    if (value !== null && base !== null && base !== 0) {
      score = value / base - 1;
      if (!higherIsBetter) score *= -1;
    }
  } else if (bm.method === "ratio") {
    const num = toNum(inputsRaw[bm.numeratorKey || ""]);
    const den = toNum(inputsRaw[bm.denominatorKey || ""]);
    const v = num !== null && den !== null && den > 0 ? num / den : null;
    value = v;
    if (v !== null && base !== null && base > 0) {
      score = v / base - 1;
      if (!higherIsBetter) score *= -1;
    }
  } else if (bm.method === "z") {
    let p: number | null = null;
    let denomForView: number | null = null;

    if (bm.numeratorKey && bm.denominatorKey) {
      const h = toNum(inputsRaw[bm.numeratorKey]);
      const s = toNum(inputsRaw[bm.denominatorKey]);
      if (h !== null && s !== null && s > 0) {
        p = h / s;
        denomForView = h > 0 ? s / h : null;
      }
    } else if (bm.valueKey) {
      // valueKey が分母(>=1)でも確率p(0<..<=1)でも両対応
      const raw = toNum(outputsRaw[bm.valueKey]) ?? toNum(inputsRaw[bm.valueKey]);
      if (raw !== null) {
        if (raw > 0 && raw <= 1) { p = raw; denomForView = 1 / raw; }
        else { denomForView = raw; p = 1 / raw; }
      }
    } else {
      p = toNum(inputsRaw[key]);
    }

    value = denomForView ?? p;

    const nKey = bm.nKey ?? "normalSpins";
    const N = toNum(inputsRaw[nKey]);
    let sd = toNum(bm.stddev);
    if ((!sd || sd <= 0) && base !== null && N !== null && N > 0) {
      sd = Math.sqrt(base * (1 - base) / N);
    }
    if (p !== null && base !== null && sd !== null && sd > 0) {
      score = (p - base) / sd;
      if (!higherIsBetter) score *= -1;
    }
    // フォールバック色付け（zが出せない場合）
    if (score === null && p !== null && base !== null) {
      score = p / base - 1;
      if (!higherIsBetter) score *= -1;
    }

    // 分母ベース確率(1/◯◯)の自動スケール補完
    const keyStr = `${bm.valueKey ?? ""}|${key}`.toLowerCase();
    const looksDenom = denomForView !== null || /denom|1\/|per1|one\/|rate/.test(keyStr);
    const canAutoDenom = looksDenom && base && base > 0;
    if (canAutoDenom) {
      const midDenom = 1 / (base as number);
      const cur = bm.scale || ({} as any);
      const min = toNum(cur.min) ?? midDenom / 2.0; // 下限（分母大）
      const mid = toNum(cur.mid) ?? midDenom;       // 基準
      const max = toNum(cur.max) ?? midDenom * 2.0; // 上限（分母小）
      scaleOverride = { min, mid, max };
    }
  }

  // 平均獲得“枚”などの自動スケール補完（method に依存しない）
  if (!scaleOverride && base && base > 0) {
    const keyStr2 = `${bm.valueKey ?? ""}|${key}|${label}`.toLowerCase();
    const looksAvgPayout =
      /(avg|average)/.test(keyStr2) && /(coin|medal|枚|payout)/.test(keyStr2);
    if (looksAvgPayout) {
      const cur = bm.scale || ({} as any);
      const min = toNum(cur.min) ?? base * 0.5;
      const mid = toNum(cur.mid) ?? base;
      const max = toNum(cur.max) ?? base * 1.5;
      scaleOverride = { min, mid, max };
    }
  }

  // ★ 機械割（payout%）の固定スケール補完：70% — 100% — 130%
  if (!scaleOverride) {
    const keyStr3 = `${bm.valueKey ?? ""}|${key}|${label}`.toLowerCase();
    const looksPayout =
      /payout|payoutpct|rtp/.test(keyStr3) || /機械割/.test(keyStr3);

    if (looksPayout) {
      // 手動 scale がある場合はそちら優先（min/mid/max の未指定のみ埋めるなら必要に応じて調整）
      scaleOverride = { min: 70, mid: 100, max: 130 };
    }
  }

  const color = colorByBands(score, bm.bands);
  return {
    key,
    label,
    value,
    baseline: base ?? undefined,
    score,
    color,
    scale: scaleOverride ?? bm.scale,
  };
}

export function barWidthPercent(row: IndicatorRow): number {
  if (row.scale && row.value !== null) {
    const { min, mid, max } = row.scale;
    const v = row.value;
    if (v <= min) return 0;
    if (v >= max) return 100;
    if (v === mid) return 50;
    if (v < mid) return ((v - min) / (mid - min)) * 50;
    return 50 + ((v - mid) / (max - mid)) * 50;
  }
  if (row.value !== null && row.baseline && row.baseline > 0) {
    return clamp((row.value / row.baseline) * 100, 0, 200);
  }
  const s = row.score ?? 0;
  return clamp(100 + s * 25, 0, 200);
}

/* =========================
   ChartRow 型 & 変換関数
   ========================= */

export type ChartRow = {
  id: string;
  label: string;
  valuePct: number;    // 0–100（基準=50）
  display: string;
  title?: string;
  baselinePct?: number;
  baselineText?: string;
  benchmark?: { min?: string; mid?: string; max?: string };
  subRight?: string;
  subRightClass?: string;   // ★ 追加

  // ★ IndicatorChart.tsx のリッチツールチップ用（LUCK専用）
  luck?: {
    luckPct: number;
    direction: "up" | "down" | "flat";
    rtpObs?: number;
    rtpBase: number;
    deltaRtp_pp: number;
    evPer1000G: number;
    sigmaSpinUsed: number;
    sigmaSourceLabel: string;
  };
};


function makeLuckChartRow(
  outputs: Record<string, any>,
  kind: "po" | "ts" | "ty",
  label: string
): ChartRow | null {
  const pct =
    kind === "po" ? Number(outputs.poLuckPct ?? outputs.luckPct) :
    kind === "ts" ? Number(outputs.tsLuckPct) :
    kind === "ty" ? Number(outputs.tyLuckPct) : NaN;

  if (!Number.isFinite(pct)) return null;

  return {
    id: `${kind}LuckPct`,
    label,
    valuePct: Math.max(0, Math.min(100, pct)),
    display: `${pct.toFixed(1)}%`,
    title: undefined,
    benchmark: { min: "下限: 0", mid: "基準: 50", max: "上限: 100" },
  };
}

// ユーティリティ：方向 → サブ表示テキスト
function dirToSub(d?: string): string | undefined {
  switch (d) {
    case "up":   return "↑ 上振れ";
    case "down": return "↓ 下振れ";
    case "flat": return "→ フラット";
    default:     return undefined;
  }
}

// 方向 → 色クラス
function dirToClass(d?: string): string | undefined {
  switch (d) {
    case "up":   return "hi-sub--up";    // 赤
    case "down": return "hi-sub--down";  // グレー寄り水色
    case "flat": return "hi-sub--flat";  // 黄
    default:     return undefined;
  }
}

/** rows → ChartRow[]。第2引数に outputsRaw を渡すと LUCK 行を追加 */
export function toChartRows(
  rows: IndicatorRow[],
  outputsRaw?: Record<string, unknown>
): ChartRow[] {
  const chartRows: ChartRow[] = rows.map((r) => {
    const hasValue = typeof r.value === "number" && Number.isFinite(r.value);

    const rawPct = barWidthPercent(r);
    let pct = rawPct > 100 ? clamp(rawPct / 2, 0, 100) : clamp(rawPct, 0, 100);

    const k = r.key.toLowerCase();
    const isRateLike =
      k.includes("denom") || k.includes("rate") || k.includes("firsthit") || k.includes("cherry");

    // 未入力は 0% 固定（反転しない）
    if (!hasValue) {
      pct = 0;
    } else if (isRateLike) {
      // 確率系は右に伸びるよう反転
      pct = 100 - pct;
    }

    // 右端の表示テキスト（実測）
    let display = "—";
    if (typeof r.value === "number") {
      if (k === "luckpct") {
        display = `${r.value.toFixed(1)}%`;               // ← LUCK％だけ ％表記
      } else if (isRateLike) {
        display = formatRateFromDenom(r.value, 1);
      } else if (k.includes("payout")) {
        display = `${r.value.toFixed(1)}%`;
      } else {
        display = formatNumber(r.value, 0);
      }
    }

    // 下限/基準/上限（分母スケールは 1/p を使う）
    const fmt = (v?: number): string | undefined => {
      if (v == null || !Number.isFinite(v)) return undefined;
      if (isRateLike) {
        const denom = v > 0 && v <= 1 ? 1 / v : v;
        return formatRateFromDenom(denom, 1);
      }
      if (k.includes("payout")) return `${v.toFixed(1)}%`;
      return formatNumber(v, 0);
    };

    const minTextRaw = fmt(r.scale?.min);
    const midSource  = r.scale?.mid ?? r.baseline;
    const midTextRaw = fmt(midSource);
    const maxTextRaw = fmt(r.scale?.max);

    let benchMin: string | undefined;
    let benchMid: string | undefined;
    let benchMax: string | undefined;
    if (isRateLike) {
      // 分母が大：下限（左）／ 分母が小：上限（右）
      benchMin = maxTextRaw ? `下限: ${maxTextRaw}` : undefined;
      benchMid = midTextRaw ? `基準: ${midTextRaw}` : undefined;
      benchMax = minTextRaw ? `上限: ${minTextRaw}` : undefined;
    } else {
      benchMin = minTextRaw ? `下限: ${minTextRaw}` : undefined;
      benchMid = midTextRaw ? `基準: ${midTextRaw}` : undefined;
      benchMax = maxTextRaw ? `上限: ${maxTextRaw}` : undefined;
    }

    const tipParts: string[] = [];
    if (typeof r.baseline === "number") {
      const baseText = fmt(r.baseline);
      if (baseText) tipParts.push(`基準: ${baseText}`);
    }
    if (typeof r.score === "number") tipParts.push(`s: ${r.score.toFixed(2)}`);
    const title = tipParts.join(" / ");

    return {
      id: r.key,
      label: r.label,
      valuePct: pct,
      display,
      title: title || undefined,
      benchmark: { min: benchMin, mid: benchMid, max: benchMax },
      subRight: undefined,
    };
  });

     // ★ LUCK% 行を最後に追加（outputsRaw が渡されている時だけ）
     if (outputsRaw) {
    const o = outputsRaw as Record<string, any>;

    const lucks: Array<{ id: string; label: string; value?: number; dir?: string }> = [
      { id: "poLuckPct", label: "PO-LUCK%", value: o.poLuckPct, dir: o.poLuckDirection },
      { id: "tsLuckPct", label: "TS-LUCK%", value: o.tsLuckPct, dir: o.tsLuckDirection },
      { id: "tyLuckPct", label: "TY-LUCK%", value: o.tyLuckPct, dir: o.tyLuckDirection },
    ];

    for (const L of lucks) {
      if (typeof L.value !== "number" || !Number.isFinite(L.value)) continue;

      chartRows.push({
        id: L.id,
        label: L.label,
        valuePct: Math.max(0, Math.min(L.value, 100)), // 0–100 に丸め
        display: `${L.value.toFixed(1)}%`,
        title: undefined,
        benchmark: { min: "下限: 0", mid: "基準: 50", max: "上限: 100" },
        subRight: dirToSub(L.dir), // ← 矢印+文言をここに
        subRightClass: dirToClass(L.dir),       // ← これを追加
      });
    }
  }

  return chartRows;
}

import { LUCK_BANDS } from "../config/constants";

export function colorForLuck(luckPct: number, direction: "up"|"down"|"flat"): string {
  for (const band of LUCK_BANDS) {
    if (luckPct <= band.max) {
      if ("color" in band) return (band as any).color!;
      return direction === "up" ? (band as any).colorUp! : direction === "down" ? (band as any).colorDown! : (band as any).colorUp!;
    }
  }
  return "#9aa0a6";
}

import { PROB_SCALE_FACTOR } from "../config/constants";

export function denomScaleLabels(baseDenom: number) {
  const mid = baseDenom;
  const min = mid / PROB_SCALE_FACTOR; // 小さい分母（良）
  const max = mid * PROB_SCALE_FACTOR; // 大きい分母（悪）
  // ラベルは左=下限(=max), 右=上限(=min)
  return {
    leftLabel: `1/${Math.round(max)}`,
    midLabel:  `1/${Math.round(mid)}`,
    rightLabel:`1/${Math.round(min)}`
  };
}

// ==== LUCK 行ビルダー（PO/TS/TY 用） ====
type LuckMini = {
  key: "po" | "ts" | "ty";
  label: string;
  pct?: number | null;
  dir?: "up" | "down" | "flat" | string | null;
};
function makeLuckRowGeneric(outputs: Record<string, any>, spec: LuckMini) {
  const pct =
    spec.pct ??
    (spec.key === "po" ? Number(outputs["poLuckPct"] ?? outputs["luckPct"]) :
     spec.key === "ts" ? Number(outputs["tsLuckPct"]) :
     spec.key === "ty" ? Number(outputs["tyLuckPct"]) : NaN);

  if (!Number.isFinite(pct)) return null;

  const dir =
    (spec.dir ??
      (spec.key === "po" ? (outputs["poLuckDirection"] ?? outputs["luckDirection"]) :
       spec.key === "ts" ? outputs["tsLuckDirection"] :
       spec.key === "ty" ? outputs["tyLuckDirection"] : "flat")) as "up"|"down"|"flat";

  const clamp01 = (x: number) => Math.max(0, Math.min(100, x));

  return {
    id: `${spec.key}LuckPct`,
    label: spec.label,
    valuePct: clamp01(pct),
    display: `${pct.toFixed(1)}%`,
    baselinePct: 50,
    benchmark: { min: "下限: 0", mid: "基準: 50", max: "上限: 100" },
    // 既存のリッチツールチップがある場合は必要に応じてここに渡す
  };
}

