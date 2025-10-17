// scripts/patch-all-from-source.mjs
// 使い方:  node scripts/patch-all-from-source.mjs
// data/source/*.csv を走査し、CSVから機種IDを取り出して対応する JSON を探し、
// 既存の scripts/patch-from-csv.mjs を順番に実行します。

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

// === 設定 ===
const SRC_DIR = path.resolve("data/source");
const MACHINES_DIR = path.resolve("data/machines");
const PATCH_SCRIPT = path.resolve("scripts/patch-from-csv.mjs");

// 列名正規化（既存スクリプトと同じロジックの軽量版）
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

// fuzzy 検索（機種ID列用）
function lookupFuzzy(headers, row, groups) {
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i]);
    const ok = groups.every((group) => group.some((tok) => h.includes(normalize(tok))));
    if (ok) return row[i];
  }
  return null;
}

// CSVから機種IDを取得（なければファイル名から推測）
async function getMachineIdFromCsv(csvPath) {
  const txt = await fs.readFile(csvPath, "utf8");
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = lines[0].replace(/^\uFEFF/, "").split(",").map((s) => s.trim());
  const row1 = lines[1].split(",").map((s) => s.trim());

  const RULES_MACHINE_ID = [
    ["機種id", "id", "機種ｉｄ", "機種コード", "code", "型番", "modelid"],
  ];
  let raw = lookupFuzzy(headers, row1, RULES_MACHINE_ID);
  if (!raw || !String(raw).trim()) {
    // ファイル名から推測（拡張子除去）
    raw = path.basename(csvPath).replace(/\.csv$/i, "");
  }

  // 既存の toSafeId と同じ整形
  const half = String(raw)
    .trim()
    .split("")
    .map((ch) => z2hTbl[ch] ?? ch)
    .join("");
  let id = half.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  id = id.replace(/^[_-]+/, "");
  return id || null;
}

// data/machines 以下から、machineId に該当する JSON を探す
// 優先1: 任意フォルダ/任意名だが JSON 内の machineId が一致
// 優先2: data/machines/<id>/<id>.json
async function findTargetJsonByMachineId(id) {
  const candidates = [];

  // 優先1: 全JSONを舐めて machineId 一致
  const stack = [MACHINES_DIR];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.isFile() && /\.json$/i.test(ent.name)) {
        try {
          const j = JSON.parse(await fs.readFile(p, "utf8"));
          if (String(j?.machineId || "").trim() === id) {
            candidates.push(p);
          }
        } catch {}
      }
    }
  }

  if (candidates.length > 0) return candidates[0];

  // 優先2: 規約の場所
  const p2 = path.join(MACHINES_DIR, id, `${id}.json`);
  if (existsSync(p2)) return p2;

  return null;
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`ERROR: source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  if (!existsSync(PATCH_SCRIPT)) {
    console.error(`ERROR: patch script not found: ${PATCH_SCRIPT}`);
    process.exit(1);
  }

  const files = (await fs.readdir(SRC_DIR))
    .filter((f) => /\.csv$/i.test(f))
    .map((f) => path.join(SRC_DIR, f));

  if (files.length === 0) {
    console.warn(`No CSV files under ${SRC_DIR}`);
    return;
  }

  console.log(`Found ${files.length} CSV(s). Processing...\n`);

  for (const csv of files) {
    try {
      const id = await getMachineIdFromCsv(csv);
      if (!id) {
        console.warn(`SKIP: cannot detect machineId from CSV: ${path.basename(csv)}`);
        continue;
      }
      const jsonPath = await findTargetJsonByMachineId(id);
      if (!jsonPath) {
        console.warn(
          `SKIP: JSON not found for machineId="${id}". Expected e.g. data/machines/${id}/${id}.json`
        );
        continue;
      }

      console.log(`==> ${path.basename(csv)} -> ${path.relative(process.cwd(), jsonPath)} (id=${id})`);
      const result = spawnSync(process.execPath, [PATCH_SCRIPT, csv, jsonPath, "--prune-to-csv"], {
        stdio: "inherit",
      });
      if (result.status !== 0) {
        console.warn(`WARN: patch failed for ${path.basename(csv)} (exit ${result.status})`);
      }
      console.log(); // spacing
    } catch (e) {
      console.error(`ERROR while processing ${csv}:`, e);
    }
  }

  console.log("Done. If Vite is running, restart dev server and hard-reload the browser.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
