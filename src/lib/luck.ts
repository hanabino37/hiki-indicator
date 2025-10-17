// src/lib/luck.ts
// σ推定と Luck%（各種レア度）の算出

export type SigmaResolveArgs = {
  customSigma?: number | null;                 // 手動σ（任意）
  presetSigma?: "A" | "standard" | "rough" | null; // プリセット（任意）
  machine?: {
    sigmaSpinDefault?: number | null;         // 機種デフォルトσ（あれば優先）
    coinUnitPriceYen?: number | null;         // コイン単価（20スロ指数）
    rateYenPerCoin?: number | null;           // 例: 20.0（未使用・受けるだけ）
  };
  k0?: number;                                 // 既定: 10（コイン単価×10 → σspin）
};

const isPos = (x: any) => typeof x === "number" && isFinite(x) && x > 0;

/** σ最終決定（優先順位）
 *  1) customSigma（手動）
 *  2) presetSigma（A/standard/rough）
 *  3) machine.sigmaSpinDefault（機種デフォルト）
 *  4) coinUnitPriceYen × k0   ← 自動換算（20スロ指数×10）
 *  5) フォールバック: 30
 */
export function resolveSigmaSpinFinal(args: SigmaResolveArgs): number {
  const { customSigma, presetSigma, machine, k0 = 10 } = args ?? {};

  // 1) 手動
  if (isPos(customSigma)) return customSigma!;

  // 2) プリセット
  if (presetSigma) {
    switch (presetSigma) {
      case "A":        return 20;
      case "standard": return 30;
      case "rough":    return 45;
    }
  }

  // 3) 機種デフォルト
  if (machine && isPos(machine.sigmaSpinDefault)) return machine.sigmaSpinDefault!;

  // 4) コイン単価 × 10
  const cup = machine?.coinUnitPriceYen ?? null;
  if (isPos(cup)) {
    const est = (cup as number) * k0;
    if (isPos(est)) return est;
  }

  // 5) フォールバック
  return 30;
}

/* =========================
   PO-LUCK（旧 Luck%：総合払出）
   ========================= */

export type ComputePoLuckArgs = {
  rtpBase: number;            // 1.10 = 110%
  spinsN?: number | null;     // 総回転数
  betPerSpin?: number | null; // 1Gあたりのコイン数（通常3）
  diffCoins?: number | null;  // 差枚
  coinIn?: number | null;     // INコイン（任意）
  coinOut?: number | null;    // OUTコイン（任意）
  sigmaSpin: number;          // 1Gあたりの標準偏差（コイン）
};

function normCdf(x: number): number {
  // Abramowitz and Stegun 近似
  const b1 =  0.319381530, b2 = -0.356563782, b3 = 1.781477937;
  const b4 = -1.821255978, b5 = 1.330274429, p  = 0.2316419, c2 = 0.3989423;
  const a = Math.abs(x);
  const t = 1.0 / (1.0 + a * p);
  const b = c2 * Math.exp((-x) * (x / 2.0));
  let n = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  n = 1.0 - b * n;
  return x < 0.0 ? 1.0 - n : n;
}

export type LuckOut = {
  direction: "up" | "down" | "flat";
  luckPct: number;              // 0–100（レア度）
  deltaRtp_pp: number;          // 期待RTPからの差（pp）
  luckEV_per1000G: number;      // 基準からのズレ（枚/1000G）
  rtpObs?: number;
  sigmaSpinUsed: number;
  z?: number;                   // 参考
};

export function computePoLuckMetrics(args: ComputePoLuckArgs): LuckOut {
  const bet = args.betPerSpin ?? 3;

  // 観測RTP（優先: in/out, 次点: N と差枚）
  let rtpObs: number | null = null;
  if (isPos(args.coinIn) && isPos(args.coinOut)) {
    rtpObs = (args.coinOut as number) / (args.coinIn as number);
  } else if (isPos(args.spinsN) && args.diffCoins != null) {
    const inCoins = bet * (args.spinsN as number);
    const outCoins = inCoins + (args.diffCoins as number);
    if (inCoins > 0) rtpObs = outCoins / inCoins;
  }

  if (rtpObs == null || !isFinite(rtpObs)) {
    return {
      direction: "flat",
      luckPct: 0,
      deltaRtp_pp: 0,
      luckEV_per1000G: 0,
      rtpObs: undefined,
      sigmaSpinUsed: args.sigmaSpin
    };
  }

  const deltaRtp = rtpObs - args.rtpBase;
  const deltaRtp_pp = deltaRtp * 100;

  const N = args.spinsN ?? null;

  // 期待差枚 vs 実績差枚 のズレ（コイン）
  let devCoins = 0;
  if (isPos(args.coinIn) && isPos(args.coinOut)) {
    const expOut = (args.coinIn as number) * args.rtpBase;
    devCoins = (args.coinOut as number) - expOut;
  } else if (isPos(N) && args.diffCoins != null) {
    const inCoins = bet * (N as number);
    const expDiff = inCoins * (args.rtpBase - 1);
    devCoins = (inCoins + (args.diffCoins ?? 0)) - (inCoins + expDiff);
  }

  // Z = devCoins / (σspin * sqrt(N))
  let z: number | undefined = undefined;
  if (isPos(N) && isPos(args.sigmaSpin)) {
    z = devCoins / (args.sigmaSpin * Math.sqrt(N as number));
  }

  // Luck%（両側）
  let luckPct = 0;
  if (z != null) {
    const tail = 1 - normCdf(Math.abs(z));
    const twoSided = 2 * tail;
    luckPct = Math.max(0, Math.min(100, (1 - twoSided) * 100));
  }

  let luckEV_per1000G = 0;
  if (isPos(N)) luckEV_per1000G = devCoins / ((N as number) / 1000);

  const direction: LuckOut["direction"] =
    Math.abs(deltaRtp_pp) < 0.1 ? "flat" : (deltaRtp_pp > 0 ? "up" : "down");

  return {
    direction,
    luckPct,
    deltaRtp_pp,
    luckEV_per1000G,
    rtpObs,
    sigmaSpinUsed: args.sigmaSpin,
    z
  };
}

/* =========================
   TS-LUCK（当たり頻度）
   ========================= */

export type ComputeHitLuckArgs = {
  pBase: number; // 期待ヒット率 p（= 1 / baselineDenom）
  spinsN: number; // 試行回数 N
  hits: number;   // 観測ヒット H
};

export function computeHitLuck(args: ComputeHitLuckArgs): LuckOut {
  const { pBase, spinsN, hits } = args;
  if (!(isPos(pBase) && isPos(spinsN))) {
    return { direction: "flat", luckPct: 0, deltaRtp_pp: 0, luckEV_per1000G: 0, sigmaSpinUsed: 0 };
  }
  const N = spinsN;
  const H = Math.max(0, Math.floor(hits));

  const pObs = H / N;
  const mu = N * pBase;
  const sigma = Math.sqrt(N * pBase * (1 - pBase)) || 1e-9;

  const z = (H - mu) / sigma;
  const tail = 1 - normCdf(Math.abs(z));
  const twoSided = 2 * tail;
  const luckPct = Math.max(0, Math.min(100, (1 - twoSided) * 100));
  const direction: LuckOut["direction"] =
    Math.abs(pObs - pBase) < 1e-9 ? "flat" : (pObs > pBase ? "up" : "down");

  return {
    direction,
    luckPct,
    deltaRtp_pp: (pObs - pBase) * 100,  // 便宜上：率差をppで
    luckEV_per1000G: 0,
    rtpObs: pObs,
    sigmaSpinUsed: 0,
    z
  };
}

/* =========================
   TY-LUCK（1発の重さ）
   ========================= */

export type ComputeTyLuckArgs = {
  muBase: number;       // 基準の平均獲得（枚/1発）
  muObs: number;        // 観測の平均獲得（枚/1発）
  hits: number;         // 発生回数 H
  sigmaHit?: number;    // 1発あたりのσ（既定: coinUnitPriceYen × kHit）
  coinUnitPriceYen?: number | null;
  kHit?: number;        // 既定 40（経験則ベースの穏当値）
};

export function resolveSigmaHit(args: {sigmaHit?: number; coinUnitPriceYen?: number | null; kHit?: number;}): number {
  if (isPos(args.sigmaHit)) return args.sigmaHit!;
  const cup = args.coinUnitPriceYen;
  const k = args.kHit ?? 40;
  if (isPos(cup)) return (cup as number) * k;
  return 120; // ざっくりフォールバック
}

export function computeTyLuck(args: ComputeTyLuckArgs): LuckOut {
  const { muBase, muObs, hits } = args;
  if (!(isPos(muBase) && isPos(hits))) {
    return { direction: "flat", luckPct: 0, deltaRtp_pp: 0, luckEV_per1000G: 0, sigmaSpinUsed: 0 };
  }
  const H = Math.max(1, Math.floor(hits));
  const sigmaHit = resolveSigmaHit({ sigmaHit: args.sigmaHit, coinUnitPriceYen: args.coinUnitPriceYen, kHit: args.kHit });

  // サンプル平均の標準誤差
  const se = sigmaHit / Math.sqrt(H);
  const z = (muObs - muBase) / (se || 1e-9);

  const tail = 1 - normCdf(Math.abs(z));
  const twoSided = 2 * tail;
  const luckPct = Math.max(0, Math.min(100, (1 - twoSided) * 100));
  const direction: LuckOut["direction"] =
    Math.abs(muObs - muBase) < 1e-9 ? "flat" : (muObs > muBase ? "up" : "down");

  return {
    direction,
    luckPct,
    deltaRtp_pp: (muObs - muBase), // 便宜上：差そのものをpp欄に
    luckEV_per1000G: 0,
    rtpObs: muObs,
    sigmaSpinUsed: sigmaHit,
    z
  };
}
