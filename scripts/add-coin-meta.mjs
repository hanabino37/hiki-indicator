// scripts/add-coin-meta.mjs
import { glob } from "glob";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// 未定義のときにだけ入れるデフォルト値（必要なら調整）
const DEFAULTS = {
  coinUnitPriceYen: 3.0,  // 20スロ想定
  rateYenPerCoin: 20.0,   // 20円/枚
};

const files = await glob("data/machines/**/*.json", { nodir: true });

let updated = 0;
let skipped = 0;

for (const file of files) {
  const text = await readFile(file, "utf8");
  const json = JSON.parse(text);

  const hadCup = Object.prototype.hasOwnProperty.call(json, "coinUnitPriceYen");
  const hadRpc = Object.prototype.hasOwnProperty.call(json, "rateYenPerCoin");

  if (hadCup && hadRpc) {
    skipped++;
    continue;
  }

  if (!hadCup) json.coinUnitPriceYen = DEFAULTS.coinUnitPriceYen;
  if (!hadRpc) json.rateYenPerCoin = DEFAULTS.rateYenPerCoin;

  await writeFile(file, JSON.stringify(json, null, 2) + "\n", "utf8");

  console.log(
    `updated: ${path.relative(process.cwd(), file)} ` +
      `${hadCup ? "" : "(+coinUnitPriceYen)"} ${hadRpc ? "" : "(+rateYenPerCoin)"}`
  );
  updated++;
}

console.log(`\nDone. updated=${updated}, skipped=${skipped}, total=${files.length}`);
