// scripts/patch-firsthit-baseline.mjs
// 使い方:
//   node scripts/patch-firsthit-baseline.mjs "<csvPath>" "<jsonPath>"
// 例:
//   node scripts/patch-firsthit-baseline.mjs "data/source/東京喰種.csv" "data/machines/tokyoghoul/tokyoghoul.json"

import fs from "fs/promises";

const [, , csvPath, jsonPath] = process.argv;
if (!csvPath || !jsonPath) {
  console.error("Usage: node scripts/patch-firsthit-baseline.mjs <csvPath> <jsonPath>");
  process.exit(1);
}

const csv = await fs.readFile(csvPath, "utf-8");

// 1行目=ヘッダ、2行目=設定1の行、という前提。
// （違う場合は下の rowSelect ロジックを調整してください）
const lines = csv.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) {
  console.error("CSVにヘッダ＋データ行が見つかりません。");
  process.exit(1);
}
const headerLine = lines[0];
const rowSelect = lines[1]; // ★ 設定1の行

const headers = headerLine.split(",").map((s) => s.trim());
const cols = rowSelect.split(",").map((s) => s.trim());

// 初当り（設定1）の列名候補。あなたのCSVヘッダに合わせて必要なら増やしてください。
const FIRSTHIT_CANDIDATES = [
  "RUSH初当り確率_設定1",
  "初当り確率_設定1",
  "firstHitRate_s1",
  "firstHit_denom_s1",
  "初当り1/◯◯_設定1",
  "初当り(1/x)_設定1",
];

// 値抽出（分母 = 1/x）
let denom = null;
for (const key of FIRSTHIT_CANDIDATES) {
  const idx = headers.findIndex((h) => h === key);
  if (idx >= 0) {
    const raw = String(cols[idx] ?? "").replace(/[^0-9.]/g, "");
    const v = parseFloat(raw);
    if (Number.isFinite(v) && v > 0) {
      denom = v;
      break;
    }
  }
}
if (!denom) {
  console.error("初当り（設定1）の列が見つかりませんでした。スクリプト内 FIRSTHIT_CANDIDATES をCSVのヘッダに合わせてください。");
  process.exit(1);
}

const p = 1 / denom; // baseline は確率pで保存

const json = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
json.benchmarks = json.benchmarks || {};
json.benchmarks.firstHitRate = json.benchmarks.firstHitRate || {};
json.benchmarks.firstHitRate.baseline = p;

await fs.writeFile(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf-8");
console.log(`OK: ${jsonPath} を更新しました -> firstHitRate.baseline = ${p} (denom=1/${denom})`);
