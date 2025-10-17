// scripts/patch-from-csv.mjs
// 使い方:
//   node scripts/patch-from-csv.mjs "<csvPath>" "<jsonPath>" [--prune-to-csv]
//
// 機能（今回拡張点★）:
// - CSV 1行目=ヘッダ, 2行目=《設定1》から JSON を更新
//   * machineId …… CSV「機種ID」から更新（安全なスラッグに）
//   * name.jp …… CSV「機種名」から更新
//   * ★ firstHitRate …… BIG初当り（「BIG初当り」系ヘッダを優先）→ baseline p
//   * ★ regHitRate …… REG初当り → baseline p（新キー）
//   * ★ grapeRate …… ブドウ確率 → baseline p（新キー）
//   * avgCoins …… BIG平均獲得枚数 → baseline number
//   * payoutPct …… 設定1_公表機械割 → baseline number
//   * coinUnitPriceYen …… コイン単価 → ルート直下
// - ベンチマーク定義が無いキーは自動付与：
//   * 確率系: {method:"z", nKey:"normalSpins", higherIsBetter:false, stddev:0, bands:[-1,-0.3,0.3,1]}
//   * avgCoins/payoutPct は diff
// - --prune-to-csv 付きで、labelsJP / io.inputs / io.outputs / benchmarks を CSVで検出できたキーのみに抜粋

import fs from "fs/promises";
import path from "path";

const argv = process.argv.slice(2);
const csvPath = argv[0];
const jsonPath = argv[1];
const PRUNE = argv.includes("--prune-to-csv");

if (!csvPath || !jsonPath) {
  console.error("Usage: node scripts/patch-from-csv.mjs <csvPath> <jsonPath> [--prune-to-csv]");
  process.exit(1);
}

/* ===== utils ===== */
const z2hTbl = Object.fromEntries(
  "０１２３４５６７８９％　（）／－".split("").map((c, i) => [c, "0123456789% ()/-"[i] || ""])
);
const normalize = (s) =>
  String(s ?? "")
    .split("")
    .map((ch) => z2hTbl[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[,:;|]/g, "");

const readText = async (p) => {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    console.error(`File not found: ${p}\nCWD: ${process.cwd()}`);
    process.exit(1);
  }
};

function lookupFuzzy(headers, row, groups) {
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    const ok = groups.every((group) => group.some((tok) => h.includes(normalize(tok))));
    if (ok) return row[i];
  }
  return null;
}

function parseDenom(str) {
  if (str == null) return null;
  const s = String(str);
  const m = s.match(/1\s*\/\s*([0-9.]+)/) || s.match(/([0-9.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}
function toProb(str) {
  if (str == null) return null;
  const s = String(str).trim();
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num) && num > 0 && num <= 1) return num;
  const d = parseDenom(s);
  return d ? 1 / d : null;
}
function toNumber(str) {
  if (str == null) return null;
  const v = parseFloat(String(str).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function toNonEmptyString(str) {
  const v = String(str ?? "").trim();
  return v.length ? v : null;
}
function toSafeId(raw) {
  if (!raw) return null;
  const half = String(raw)
    .trim()
    .split("")
    .map((ch) => z2hTbl[ch] ?? ch)
    .join("");
  let id = half.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  id = id.replace(/^[_-]+/, "");
  return id || null;
}

/* ===== CSV ===== */
const csv = await readText(csvPath);
const lines = csv.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) {
  console.error("CSV needs header + at least one data row (設定1).");
  process.exit(1);
}
const headers = lines[0].replace(/^\uFEFF/, "").split(",").map((s) => s.trim());
const row1 = lines[1].split(",").map((s) => s.trim());
console.log(`CSV: ${path.basename(csvPath)} | Headers: ${headers.join(" | ")}`);

/* ===== fuzzy RULES ===== */
const RULES = {
  machineId: [["機種id", "id", "機種ｉｄ", "機種コード", "code", "型番", "modelid"]],
  machineNameJP: [["機種名", "名称", "name", "タイトル"]],

  // Aタイプ：BIG/REG/ブドウ（日本語カラム）
  firstHitRateBig: [
    ["big"],
    ["初当", "確率", "1/", "1/x", "分母"],
    ["設定1", "s1"],
  ],
  regHitRate: [
    ["reg"],
    ["初当", "確率", "1/", "1/x", "分母"],
    ["設定1", "s1"],
  ],
  avgBigCoins: [["big", "平均獲得", "平均枚", "avg"]],
  grapeRate: [
    ["ブドウ", "葡萄", "grape"],
    ["確率", "1/", "1/x", "分母"],
  ],

  // 汎用（AT機など）
  firstHitRate: [
    ["初当", "rush"],
    ["確率", "1/x", "1/", "分母", "当り"],
    ["設定1", "設定_1", "s1"],
  ],

  payoutPct: [["機械割", "公表機械割", "rtp", "割"], ["設定1", "s1"]],
  coinUnitPriceYen: [["コイン単価", "coin単価", "coinprice", "コイン/単価"]],
};

/* ===== JSON ===== */
const json = JSON.parse(await readText(jsonPath));
json.benchmarks = json.benchmarks || {};
json.labelsJP = json.labelsJP || {};
json.io = json.io || {};
json.io.inputs = Array.isArray(json.io.inputs) ? json.io.inputs : [];
json.io.outputs = Array.isArray(json.io.outputs) ? json.io.outputs : [];

const changed = [];
const detected = new Set(); // CSVから見つかったキーを記録

/* ===== setters ===== */
function ensureBmShapeForProbKey(key) {
  const bm = (json.benchmarks[key] = json.benchmarks[key] || {});
  if (!bm.method) bm.method = "z";
  if (!bm.nKey) bm.nKey = "normalSpins";
  if (bm.higherIsBetter === undefined) bm.higherIsBetter = false;
  if (bm.stddev === undefined) bm.stddev = 0;
  if (!bm.bands) bm.bands = [-1, -0.3, 0.3, 1];
}
function ensureBmShapeForDiffKey(key) {
  const bm = (json.benchmarks[key] = json.benchmarks[key] || {});
  if (!bm.method) bm.method = "diff";
  if (bm.higherIsBetter === undefined) bm.higherIsBetter = key === "payoutPct" || key === "avgCoins";
  if (!bm.bands) bm.bands = [-0.15, -0.05, 0.05, 0.15];
}

function setMachineId(value) {
  const raw = toNonEmptyString(value);
  const safe = toSafeId(raw);
  if (!safe) return;
  const before = json.machineId ? String(json.machineId) : "";
  if (before && before !== safe) {
    console.warn(`[patch] machineId changed: "${before}" -> "${safe}"`);
  }
  json.machineId = safe;
  changed.push(`machineId="${safe}"`);
}
function setNameJP(value) {
  const s = toNonEmptyString(value);
  if (s == null) return;
  json.name = json.name || {};
  json.name.jp = s;
  changed.push(`name.jp="${s}"`);
}

function setBaselineP(key, value) {
  const p = toProb(value);
  if (p == null) return;
  ensureBmShapeForProbKey(key);
  json.benchmarks[key].baseline = p;
  changed.push(`${key}=p:${p}`);
  detected.add(key);
}
function setBaselineNumber(key, value) {
  const v = toNumber(value);
  if (v == null) return;
  ensureBmShapeForDiffKey(key);
  json.benchmarks[key].baseline = v;
  changed.push(`${key}=n:${v}`);
  detected.add(key);
}
function setMachineNumber(key, value) {
  const v = toNumber(value);
  if (v == null) return;
  json[key] = v;
  changed.push(`${key}=n:${v}`);
}

/* ===== apply CSV ===== */
// id / name
setMachineId(lookupFuzzy(headers, row1, RULES.machineId));
setNameJP(lookupFuzzy(headers, row1, RULES.machineNameJP));

// Aタイプ優先で BIG/REG/ブドウ
setBaselineP("firstHitRate", lookupFuzzy(headers, row1, RULES.firstHitRateBig)); // BIG初当りを firstHitRate に
setBaselineP("regHitRate", lookupFuzzy(headers, row1, RULES.regHitRate));
setBaselineP("grapeRate", lookupFuzzy(headers, row1, RULES.grapeRate));

// AT汎用（BIGが拾えなかった場合の保険）
setBaselineP("firstHitRate", lookupFuzzy(headers, row1, RULES.firstHitRate) ?? null);

// 枚数・割・単価
setBaselineNumber("avgCoins", lookupFuzzy(headers, row1, RULES.avgBigCoins));
setBaselineNumber("payoutPct", lookupFuzzy(headers, row1, RULES.payoutPct));
setMachineNumber("coinUnitPriceYen", lookupFuzzy(headers, row1, RULES.coinUnitPriceYen));

/* ===== prune（CSV準拠に抜粋） ===== */
if (PRUNE) {
  // UI/計算で常に使う基本キー
  const ALWAYS = new Set(["totalSpins", "normalSpins", "diffCoins", "payoutPct"]);
  const keep = new Set([...ALWAYS, ...detected]);

  const DEFAULT_LABELS = {
    totalSpins: "総回転数",
    normalSpins: "通常ゲーム数",
    diffCoins: "差枚数",
    payoutPct: "機械割（％）",
    // 任意系
    firstHitRate: "BIG初当り確率",
    regHitRate: "REG初当り確率",
    avgCoins: "BIG平均獲得枚数",
    grapeRate: "ブドウ確率",
  };

  // labelsJP
  const newLabels = {};
  for (const k of keep) {
    if (DEFAULT_LABELS[k]) newLabels[k] = json.labelsJP[k] ?? DEFAULT_LABELS[k];
  }
  json.labelsJP = newLabels;

  // inputs
  const inputDefs = {
    totalSpins: { key: "totalSpins", labelJP: newLabels.totalSpins, type: "number", required: true, min: 0, step: 1, precision: 0 },
    normalSpins: { key: "normalSpins", labelJP: newLabels.normalSpins, type: "number", required: true, min: 1, step: 1, precision: 0 },
    firstHitRate: { key: "firstHitRate", labelJP: newLabels.firstHitRate, type: "number", min: 1, step: 0.1, precision: 1 },
    regHitRate: { key: "regHitRate", labelJP: newLabels.regHitRate, type: "number", min: 1, step: 0.1, precision: 1 },
    avgCoins: { key: "avgCoins", labelJP: newLabels.avgCoins, type: "number", min: 0, step: 1, precision: 0, unit: "枚" },
    grapeRate: { key: "grapeRate", labelJP: newLabels.grapeRate, type: "number", min: 1, step: 0.1, precision: 1 },
    diffCoins: { key: "diffCoins", labelJP: newLabels.diffCoins, type: "number", step: 1, precision: 0, unit: "枚" },
  };
  const INPUT_ORDER = ["totalSpins", "normalSpins", "firstHitRate", "regHitRate", "avgCoins", "grapeRate", "diffCoins"];
  json.io.inputs = INPUT_ORDER.filter((k) => keep.has(k)).map((k) => inputDefs[k]);

  // outputs
  const outputDefs = {
    totalSpins: { key: "totalSpins", labelJP: newLabels.totalSpins, type: "number", precision: 0 },
    firstHitRate: { key: "firstHitRate", labelJP: newLabels.firstHitRate, type: "number", precision: 1 },
    regHitRate: { key: "regHitRate", labelJP: newLabels.regHitRate, type: "number", precision: 1 },
    avgCoins: { key: "avgCoins", labelJP: newLabels.avgCoins, type: "number", precision: 0 },
    grapeRate: { key: "grapeRate", labelJP: newLabels.grapeRate, type: "number", precision: 1 },
    payoutPct: { key: "payoutPct", labelJP: newLabels.payoutPct, type: "number", precision: 1 },
  };
  const OUTPUT_ORDER = ["totalSpins", "firstHitRate", "regHitRate", "avgCoins", "grapeRate", "payoutPct"];
  json.io.outputs = OUTPUT_ORDER.filter((k) => keep.has(k)).map((k) => outputDefs[k]);

  // benchmarks（不要キー削除）
  const newBm = {};
  for (const k of Object.keys(json.benchmarks || {})) {
    if (keep.has(k)) newBm[k] = json.benchmarks[k];
  }
  json.benchmarks = newBm;
}

/* ===== save ===== */
console.log("WRITE TO:", path.resolve(jsonPath));
await fs.writeFile(jsonPath, JSON.stringify(json, null, 2) + "\n", "utf-8");

console.log(
  `OK: ${path.basename(jsonPath)} updated -> [${changed.join(", ")}] from ${path.basename(csvPath)}`
);
if (changed.length === 0) {
  console.warn("Note: No fields were changed. Adjust RULES.* to fit your CSV headers.");
}
