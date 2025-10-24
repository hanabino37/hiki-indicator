// src/lib/scoring.ts
import type { MachineRecord } from "../types/schema";
import {
  resolveSigmaSpinFinal,
  computePoLuckMetrics,
  computeHitLuck,
  computeTyLuck,
} from "./luck";
import { RTP_EQUAL_EPSILON_PP } from "../config/constants";
import { isNormalType } from "./machineKind"; // ★ 追加

export function luckDirection(deltaRtp_pp: number): "up"|"down"|"flat" {
  if (Math.abs(deltaRtp_pp) <= RTP_EQUAL_EPSILON_PP) return "flat";
  return deltaRtp_pp > 0 ? "up" : "down";
}

type Inputs = Record<string, any>;

/* ========= helpers ========= */
function toNum(x: any): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "string" && x.trim() === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}
function safeDiv(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return n / d;
}
function bayesMean(
  hits: number,
  bets: number,
  priorMean = 0.5,
  priorStrength = 0
): number | null {
  const denom = bets + priorStrength;
  if (!Number.isFinite(denom) || denom <= 0) return null;
  return (hits + priorStrength * priorMean) / denom;
}

/**
 * 機種・入力値から outputs を作る
 * - 互換: ratio / zscore / shrinkage を維持
 * - 追加: payoutPct
 * - 追加: PO-LUCK（旧Luck） + TS-LUCK + TY-LUCK
 * - 追加: 初当り回数→確率p の自動算出（firstHitCount があれば最優先）
 * - 変更: ノーマル系では TS-LUCK の H＝bigCount を使用
 */
export function computeOutputs(
  machine: MachineRecord,
  inputs: Record<string, any>
): Record<string, number | string | boolean | null> {
  const method = machine.scoring?.method ?? "ratio";
  const p = machine.scoring?.params ?? {};

  // 互換: ratio / shrinkage 用（旧UI）
  const numKey = String((p as any).numeratorKey ?? "hitCount");
  const denKey = String((p as any).denominatorKey ?? "betCount");

  const hitsCompat = toNum(inputs[numKey]) ?? 0;
  const betsCompat = toNum(inputs[denKey]) ?? 0;

  const ratioRaw = safeDiv(hitsCompat, betsCompat);

  const priorMean = toNum((p as any).priorMean) ?? 0.5;
  const priorStrength = toNum((p as any).priorStrength) ?? 0;
  const ratioShrink = bayesMean(hitsCompat, betsCompat, priorMean, priorStrength);

  // 互換: zscore
  const targetKey: string | undefined = (p as any).targetKey;
  const targetValue = targetKey ? toNum(inputs[targetKey]) : ratioRaw ?? null;

  const baselineMean = toNum((p as any).baselineMean);
  const baselineStd = toNum((p as any).baselineStd);

  let zscore: number | null = null;
  if (
    targetValue !== null &&
    baselineMean !== null &&
    baselineStd !== null &&
    baselineStd > 0
  ) {
    zscore = (targetValue - baselineMean) / baselineStd;
  }

  const out: Record<string, number | string | boolean | null> = {};

  /* ---- 0) 初当り確率 → 確率p の自動算出 ---- */
  const normalSpins = toNum(inputs["normalSpins"]);
  const isNormal = isNormalType(machine);                 // ★ ノーマル系判定
  const firstHitCount = toNum(inputs["firstHitCount"]) ?? toNum(inputs["firstHits"]) ?? null;
  const bigCount      = toNum(inputs["bigCount"]) ?? null;

  // 入力された“回数”から観測pを作る際の優先順位
  // ノーマル系: bigCount / N、非ノーマル: firstHitCount / N
  const hitsForRate =
    isNormal
      ? (bigCount ?? firstHitCount)
      : (firstHitCount ?? bigCount);

  const firstHitRate_input = toNum(inputs["firstHitRate"]); // 既存（分母 or p）が入ってくる場合用
  let firstHitRate_p: number | null = null;

  if (
    Number.isFinite(normalSpins) &&
    Number.isFinite(hitsForRate) &&
    (normalSpins ?? 0) > 0 &&
    (hitsForRate ?? 0) >= 0
  ) {
    // 回数優先：p = H / N
    firstHitRate_p = (hitsForRate as number) / (normalSpins as number);
  } else if (firstHitRate_input != null) {
    const v = firstHitRate_input;
    // 1/◯◯ or p の両対応
    firstHitRate_p = v > 0 && v <= 1 ? v : v > 0 ? 1 / v : null;
  }

  if (firstHitRate_p != null) {
    out["firstHitRate"]  = firstHitRate_p;               // ベンチマークは p を期待
    out["firstHitDenom"] = 1 / (firstHitRate_p || 1e-9); // 表示用（任意）
  }

  /* ---- 1) 互換: 既存の特殊キーを埋める ---- */
  for (const def of machine.io.outputs) {
    switch (def.key) {
      case "ratio":
        out[def.key] = method === "shrinkage" ? ratioShrink : ratioRaw;
        break;
      case "shrink":
        out[def.key] = ratioShrink;
        break;
      case "zscore":
        out[def.key] = zscore;
        break;
      default:
        if (!(def.key in out)) out[def.key] = null;
        break;
    }
  }

  /* ---- 2) 表示値の埋め込み（省略：従来実装そのまま） ---- */
  // ※ 既存の indicator.ts 側で value/scale/benchmark を解決します

  /* ---- 3) payoutPct（％） ---- */
  const hasPayoutOutput =
    machine.io.outputs.some((o) => o.key === "payoutPct") ||
    !!(machine.labelsJP && "payoutPct" in machine.labelsJP);

  if (hasPayoutOutput) {
    const ts = toNum(inputs["totalSpins"]) ?? 0;
    const dc = toNum(inputs["diffCoins"]) ?? 0;
    out["payoutPct"] = ts > 0 ? ((3 * ts + dc) / (3 * ts)) * 100 : null;
  }

  /* ---- 4) LUCK 系（PO/TY/TS） ---- */

  // rtpBase（1.10 = 110%）
  const rtpBasePctInput = toNum(inputs["rtpBasePct"]);
  const rtpBasePctFallback =
    toNum((machine.benchmarks as any)?.payoutPct?.baseline) ?? 100;
  const rtpBase = (rtpBasePctInput ?? rtpBasePctFallback) / 100;

  // σspin：手動 > プリセット > 機種デフォルト > コイン単価×10 > 30
  const preset = String(inputs["presetSigma"] ?? "").toLowerCase();
  const presetSigma =
    preset === "a" ? "A" :
    preset === "standard" ? "standard" :
    preset === "rough" ? "rough" : null;

  const sigmaSpin = resolveSigmaSpinFinal({
    customSigma: toNum(inputs["customSigma"]) ?? null,
    presetSigma,
    machine: {
      sigmaSpinDefault: (machine as any).sigmaSpinDefault ?? null,
      coinUnitPriceYen: (machine as any).coinUnitPriceYen ?? null,
      rateYenPerCoin: (machine as any).rateYenPerCoin ?? null,
    },
    k0: 10,
  });

  const totalSpins =
    toNum(inputs["totalSpins"]) ?? toNum(inputs["spinsN"]) ?? null;

  const diffCoins = toNum(inputs["diffCoins"]) ?? null;

  // --- PO-LUCK（旧 Luck%）
  const po = computePoLuckMetrics({
    rtpBase,
    spinsN: totalSpins ?? undefined,
    betPerSpin: 3,
    diffCoins: diffCoins ?? undefined,
    sigmaSpin,
  });

  out["poLuckPct"]        = po.luckPct;
  out["poLuckDirection"]  = po.direction;
  out["po_deltaRtp_pp"]   = po.deltaRtp_pp;
  out["po_EV_per1000G"]   = po.luckEV_per1000G;
  out["po_sigmaSpin"]     = po.sigmaSpinUsed;

  // 後方互換（旧キー）
  out["luckPct"]          = po.luckPct;
  out["luckDirection"]    = po.direction;
  out["luck_deltaRtp_pp"] = po.deltaRtp_pp;
  out["luck_EV_per1000G"] = po.luckEV_per1000G;
  out["luck_sigmaSpin"]   = po.sigmaSpinUsed;

  // --- TS-LUCK（当たり頻度：基準p, N, H）
  // 基準p（0..1）：BIGの基準pを firstHitRate.baseline として採用（無ければ観測p）
  const pBaseHit =
    toNum((machine.benchmarks as any)?.firstHitRate?.baseline) ??
    (firstHitRate_p ?? null);

  // 成功数Hは機種によって切替：ノーマル系→bigCount、非ノーマル→firstHitCount
  const hitsForTs =
    isNormal
      ? (Number(bigCount ?? 0))
      : (Number(firstHitCount ?? 0));

  if (
    Number.isFinite(pBaseHit) &&
    Number.isFinite(normalSpins) &&
    Number.isFinite(hitsForTs)
  ) {
    const ts = computeHitLuck({
      pBase: pBaseHit as number,
      spinsN: normalSpins as number,
      hits: hitsForTs as number,
    });
    out["tsLuckPct"]       = ts.luckPct;
    out["tsLuckDirection"] = ts.direction;
  } else {
    out["tsLuckPct"] = 0;
    out["tsLuckDirection"] = "flat";
  }

  // --- TY-LUCK（1発の重さ：基準平均/観測平均/H/σhit）
  const muBase =
    toNum((machine.benchmarks as any)?.avgCoins?.baseline) ??
    toNum(inputs["avgCoinsBase"]) ??
    null;

  // 観測平均枚数（1発あたり）
  const muObs =
    toNum(inputs["avgCoins"]) ??
    toNum(inputs["avgCoinsObs"]) ??
    null; // 入力がない場合は算出しない（null扱い）

  // ※ 仕様どおり TY-LUCK は従来の firstHitCount を使用（ノーマル系でも変更なし）
  if (
    Number.isFinite(muBase) &&
    Number.isFinite(muObs) &&
    Number.isFinite(firstHitCount) &&
    (firstHitCount ?? 0) > 0
  ) {
    const ty = computeTyLuck({
      muBase: muBase as number,
      muObs:  muObs as number,
      hits:   firstHitCount as number,
      coinUnitPriceYen: (machine as any).coinUnitPriceYen ?? null,
      // 必要なら inputs["sigmaHit"] や kHit を受けられるようにしておく
      sigmaHit: toNum(inputs["sigmaHit"]) ?? undefined,
      kHit:     toNum(inputs["kHit"]) ?? undefined,
    });
    out["tyLuckPct"]       = ty.luckPct;
    out["tyLuckDirection"] = ty.direction;
  } else {
    out["tyLuckPct"] = 0;
    out["tyLuckDirection"] = "flat";
  }

  return out;
}
