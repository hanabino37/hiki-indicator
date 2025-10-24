import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

type Row = {
  schemaVersion?: string;
  machineId: string;
  nameJP: string;
  tags?: string; // 例: "type:at,extra:foo"

  // ベンチマーク関連（CSVにあれば使う。なければ書かない）
  baseline_firstHitRate?: string;
  stddev_firstHitRate?: string;

  baseline_avgCoins?: string;
  baseline_payoutPct?: string;

  // 価格系
  coinUnitPriceYen?: string;
  rateYenPerCoin?: string;
};

const LABELS_JP = {
  totalSpins: "総回転数",
  normalSpins: "通常ゲーム数",
  diffCoins: "差枚数",
  payoutPct: "機械割（％）",
  firstHits: "初当り回数",
  firstHitRate: "初当り確率",
  avgCoins: "平均獲得枚数",
};

const FORM_ORDER = ["spins:total","spins:normal","count:firstHit","avg:getCoins","diff:coins"] as const;

const BANDS = {
  totalSpins: [-0.5, -0.1, 0.1, 0.5],
  firstHitRate: [-1, -0.3, 0.3, 1],
  avgCoins: [-0.15, -0.05, 0.05, 0.15],
  payoutPct: [-2, -0.5, 0.5, 2],
};

const SCALE = {
  totalSpins: { min: 0, mid: 5000, max: 10000 },
  payoutPct: { min: 50, mid: 100, max: 150 },
};

function asNumberOrUndef(v?: string) {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function splitTags(s?: string): string[] {
  if (!s || !s.trim()) return ["type:at"]; // AT系固定
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function buildJson(r: Row) {
  const j: any = {
    schemaVersion: r.schemaVersion || "1.0.0",
    machineId: r.machineId,
    name: { jp: r.nameJP },
    tags: splitTags(r.tags),
    labelsJP: LABELS_JP,
    io: {
      formOrder: [...FORM_ORDER],
      inputs: [
        { key:"totalSpins",  labelJP: LABELS_JP.totalSpins,  type:"number", required:true, min:0, step:1, precision:0, tags:["spins","total"] },
        { key:"normalSpins", labelJP: LABELS_JP.normalSpins, type:"number", required:true, min:1, step:1, precision:0, tags:["spins","normal"] },
        { key:"firstHits",   labelJP: LABELS_JP.firstHits,   type:"number", min:0, step:1, precision:0, unit:"回", tags:["count","firstHit"] },
        { key:"avgCoins",    labelJP: LABELS_JP.avgCoins,    type:"number", min:0, step:1, precision:0, unit:"枚", tags:["avg","getCoins"] },
        { key:"diffCoins",   labelJP: LABELS_JP.diffCoins,   type:"number", step:1, precision:0, unit:"枚", tags:["diff","coins"] },
      ],
      outputs: [
        { key:"totalSpins",  labelJP: LABELS_JP.totalSpins,  type:"number", precision:0 },
        { key:"firstHitRate",labelJP: LABELS_JP.firstHitRate,type:"number", precision:1 },
        { key:"avgCoins",    labelJP: LABELS_JP.avgCoins,    type:"number", precision:0 },
        { key:"payoutPct",   labelJP: LABELS_JP.payoutPct,   type:"number", precision:1 },
      ],
    },
    benchmarks: {
      totalSpins: {
        method: "diff",
        higherIsBetter: true,
        bands: BANDS.totalSpins,
        scale: SCALE.totalSpins,
        // baseline は運用的に固定値でも良いなら入れる。CSVに任せたい場合は下行を消す。
        baseline: 5000,
      },
      firstHitRate: {
        method: "z",
        valueKey: "firstHitRate",
        nKey: "normalSpins",
        higherIsBetter: false, // 分母小さいほど優秀 → サンプル準拠
        bands: BANDS.firstHitRate,
      },
      avgCoins: {
        method: "diff",
        higherIsBetter: true,
        bands: BANDS.avgCoins,
      },
      payoutPct: {
        method: "diff",
        valueKey: "payoutPct",
        higherIsBetter: true,
        bands: BANDS.payoutPct,
        scale: SCALE.payoutPct,
      },
    },
  };

  // 数値は「読めたものだけ」入れる
  const fhBase = asNumberOrUndef(r.baseline_firstHitRate);
  if (fhBase !== undefined) j.benchmarks.firstHitRate.baseline = fhBase;

  const fhStd = asNumberOrUndef(r.stddev_firstHitRate);
  if (fhStd !== undefined) j.benchmarks.firstHitRate.stddev = fhStd;

  const avgBase = asNumberOrUndef(r.baseline_avgCoins);
  if (avgBase !== undefined) j.benchmarks.avgCoins.baseline = avgBase;

  const pctBase = asNumberOrUndef(r.baseline_payoutPct);
  if (pctBase !== undefined) j.benchmarks.payoutPct.baseline = pctBase;

  const cupy = asNumberOrUndef(r.coinUnitPriceYen);
  if (cupy !== undefined) j.coinUnitPriceYen = cupy;

  const rypc = asNumberOrUndef(r.rateYenPerCoin);
  if (rypc !== undefined) j.rateYenPerCoin = rypc;

  return j;
}

function main(csvPath: string, outDir: string) {
  const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Row[];
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const r of rows) {
    const json = buildJson(r);
    const out = path.join(outDir, `${r.machineId}.json`);
    fs.writeFileSync(out, JSON.stringify(json, null, 2), "utf8");
    console.log("wrote:", out);
  }
}

// 使い方: ts-node csv2json.ts ./machines.csv ./data/machines
main(process.argv[2], process.argv[3]);
