// scripts/generateFromCsv.ts
// 使い方:
//   npx tsx scripts/generateFromCsv.ts "C:\path\to\基準データ.csv" [machineId]
// 出力先: data/machines/<machineId>/<machineId>.json

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

// 型は既存のものに依存しない（CLI単体で動くよう最小限）
type Row = Record<string, string>;

type RareCandidate = {
  jp: string;         // ラベル表示名
  key: string;        // JSONで使うキー
  colIncludes: string[]; // CSV列名に含まれていてほしい語（すべて含む）
  colExcludes?: string[]; // 含んでいたら除外
};

const RARE_PRIORITY: RareCandidate[] = [
  { jp: "中段チェリー確率（1/◯◯）", key: "chudanCherryRate", colIncludes: ["中段", "チェリー", "確率"] },
  { jp: "赫眼リプレイ確率（1/◯◯）", key: "kakuganReplayRate", colIncludes: ["赫眼", "リプレイ", "確率"] },
  { jp: "強チェリー確率（1/◯◯）", key: "strongCherryRate", colIncludes: ["強", "チェリー", "確率"] },
  { jp: "弱チェリー確率（1/◯◯）", key: "weakCherryRate", colIncludes: ["弱", "チェリー", "確率"] },
  { jp: "チェリー確率（1/◯◯）",     key: "cherryRate",       colIncludes: ["チェリー", "確率"] },
  { jp: "スイカ確率（1/◯◯）",       key: "suikaRate",        colIncludes: ["スイカ", "確率"] },
  { jp: "チャンス目確率（1/◯◯）",   key: "chanceRate",       colIncludes: ["チャンス", "目", "確率"] },
  { jp: "レア役確率（1/◯◯）",       key: "rareFlagRate",     colIncludes: ["レア", "確率"], colExcludes: ["初当"] },
];

function slugify(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "machine";
}

function readCsv(fp: string): Row[] {
  const buf = fs.readFileSync(fp);
  for (const enc of ["utf-8-sig", "utf-8", "cp932"]) {
    try {
      const text = Buffer.from(buf).toString(enc as BufferEncoding);
      const rows = parse(text, { columns: true, skip_empty_lines: true }) as Row[];
      if (rows.length) return rows;
    } catch {}
  }
  throw new Error("CSVの読み込みに失敗しました: " + fp);
}

function toFloatRateCell(v: string | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/1\s*\/\s*([0-9.]+)/);
  if (m) return parseFloat(m[1]); // 分母
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toPercentCell(v: string | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim().replace("%", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function chooseHitRateColumn(cols: string[]): string | null {
  // 設定1優先 → 無ければ「初当」「確率」を含む最初
  const p1 = cols.find((c) => c.includes("設定1") && c.includes("初当") && c.includes("確率"));
  if (p1) return p1;
  return cols.find((c) => c.includes("初当") && c.includes("確率")) || null;
}

function chooseRareColumn(cols: string[]): { cand: RareCandidate; col: string } | null {
  for (const cand of RARE_PRIORITY) {
    const found = cols.find((c) => {
      const okInc = cand.colIncludes.every((word) => c.includes(word));
      const okExc = !cand.colExcludes || cand.colExcludes.every((ng) => !c.includes(ng));
      return okInc && okExc;
    });
    if (found) return { cand, col: found };
  }
  return null;
}

function buildJsonFromRow(row: Row, columns: string[], machineId?: string) {
  const nameJP = row["機種名"] || row["タイトル"] || "機種";
  const id = machineId || row["機種ID"] || slugify(nameJP);

  // 候補列の抽出
  const cols = columns;

  // 平均獲得枚数（AT or BIG or 汎用）
  const avgCol =
    cols.find((c) => c.includes("AT平均獲得枚数")) ||
    cols.find((c) => c.includes("BIG平均獲得枚数")) ||
    cols.find((c) => c.includes("平均獲得枚数"));
  const avgCoins = avgCol ? toPercentCell(row[avgCol]!) ?? Number(row[avgCol]) : null; // 数値

  // 初当り（設定1優先）
  const hitCol = chooseHitRateColumn(cols);
  const hitDenom = hitCol ? toFloatRateCell(row[hitCol]) : null; // 分母

  // レア枠（優先リストで自動検出）
  const rarePick = chooseRareColumn(cols);
  const rareDenom = rarePick ? toFloatRateCell(row[rarePick.col]) : null;

  // 公表機械割（設定1）
  const payoutCol = cols.find((c) => c.includes("設定1") && c.includes("公表機械割"));
  const payoutPct = payoutCol ? toPercentCell(row[payoutCol]!) : null;

  // ラベルとキー（レア枠は検出結果を反映）
  const rareLabelJP = rarePick?.cand.jp || "レア役確率（1/◯◯）";
  const rareKey = rarePick?.cand.key || "rareFlagRate";

  // ---- JSON 構築 ----
  const data = {
    schemaVersion: "1.0.0",
    machineId: id,
    name: { jp: nameJP },
    labelsJP: {
      totalSpins: "総回転数",
      normalSpins: "通常ゲーム数",
      firstHitRate: "初当り確率（1/◯◯）",
      avgCoins: "平均獲得枚数",
      [rareKey]: rareLabelJP,
      diffCoins: "差枚数",
      payoutPct: "機械割（％）",
    } as Record<string, string>,
    io: {
      inputs: [
        { key: "totalSpins", labelJP: "総回転数", type: "number", required: true, min: 0, step: 1, precision: 0 },
        { key: "normalSpins", labelJP: "通常ゲーム数", type: "number", required: true, min: 1, step: 1, precision: 0 },
        { key: "firstHitRate", labelJP: "初当り確率（1/◯◯）", type: "number", min: 1, step: 0.1, precision: 1 },
        { key: "avgCoins", labelJP: "平均獲得枚数", type: "number", min: 0, step: 1, precision: 0, unit: "枚" },
        { key: rareKey, labelJP: rareLabelJP, type: "number", min: 1, step: 0.1, precision: 1 },
        { key: "diffCoins", labelJP: "差枚数", type: "number", step: 1, precision: 0, unit: "枚" },
      ],
      outputs: [
        { key: "totalSpins", labelJP: "総回転数", type: "number", precision: 0 },
        { key: "firstHitRate", labelJP: "初当り確率（1/◯◯）", type: "number", precision: 1 },
        { key: "avgCoins", labelJP: "平均獲得枚数", type: "number", precision: 0 },
        { key: rareKey, labelJP: rareLabelJP, type: "number", precision: 1 },
        { key: "payoutPct", labelJP: "機械割（％）", type: "number", precision: 1 },
      ],
    },
    benchmarks: {
      totalSpins: {
        method: "diff",
        baseline: 5000,
        higherIsBetter: true,
        bands: [-0.5, -0.1, 0.1, 0.5],
        scale: { min: 0, mid: 5000, max: 10000 },
      },
      firstHitRate: {
        method: "z",
        valueKey: "firstHitRate",
        nKey: "normalSpins",
        baseline: hitDenom ? 1.0 / hitDenom : 0.005, // p0
        stddev: 0, // 0→binomial sd を自動計算（indicator.ts側）
        higherIsBetter: false,
        bands: [-1.0, -0.3, 0.3, 1.0],
      },
      avgCoins: {
        method: "diff",
        baseline: avgCoins ?? 400,
        higherIsBetter: true,
        bands: [-0.15, -0.05, 0.05, 0.15],
      },
      [rareKey]: {
        method: "z",
        valueKey: rareKey,
        nKey: "normalSpins",
        baseline: rareDenom ? 1.0 / rareDenom : 0.02,
        stddev: 0,
        higherIsBetter: false,
        bands: [-1.0, -0.3, 0.3, 1.0],
      },
      payoutPct: {
        method: "diff",
        valueKey: "payoutPct",
        baseline: payoutPct ?? 100.0,
        higherIsBetter: true,
        bands: [-2, -0.5, 0.5, 2],
        scale: { min: 50, mid: 100, max: 150 },
      },
    },
  };

  return data;
}

function main() {
  const csvPath = process.argv[2];
  const idArg = process.argv[3];

  if (!csvPath) {
    console.error("使い方: npx tsx scripts/generateFromCsv.ts <csvPath> [machineId]");
    process.exit(1);
  }

  const rows = readCsv(csvPath);
  if (!rows.length) throw new Error("CSVに行がありません");

  const columns = Object.keys(rows[0]);
  const data = buildJsonFromRow(rows[0], columns, idArg);

  const machineId = data.machineId;
  const outDir = path.join(process.cwd(), "data", "machines", machineId);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${machineId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");

  console.log(`✔ 生成: ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
