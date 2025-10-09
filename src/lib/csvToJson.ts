export type MachineJson = {
  machineId: string;
  name: string;
  params: {
    atAvgMedals: number;
    atHitRateBySetting: number[]; // 1始まり想定
  };
};

export function parsePatternB(csvText: string): MachineJson {
  // 先頭行: 機種ID,機種名,AT平均獲得枚数,設定1_AT初当り確率,...
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSVが短すぎます");
  const header = lines[0].split(",");
  const body = lines[1].split(",");
  const get = (idx: number) => (body[idx] ?? "").trim();

  const machineId = get(0);
  const name = get(1);
  const atAvg = Number(get(2));
  const rates: number[] = [];
  for (let i = 3; i < body.length; i++) {
    const cell = get(i);
    // 1/xxx 形式を数値に
    const m = cell.match(/1\s*\/\s*(\d+(\.\d+)?)/);
    if (m) rates.push(Number(m[1]));
  }
  if (!machineId || !name || !isFinite(atAvg) || !rates.length) {
    throw new Error("CSVの形式が不正です");
  }
  return {
    machineId,
    name,
    params: {
      atAvgMedals: atAvg,
      atHitRateBySetting: rates,
    },
  };
}
