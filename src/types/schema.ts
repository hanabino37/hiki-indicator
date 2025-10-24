// Schema version
export const MACHINE_SCHEMA_VERSION = "1.0.0" as const;

export type FieldType = "number" | "string" | "boolean" | "enum";

export interface FieldOption {
  value: string | number | boolean;
  labelJP: string;
}

export interface FieldDef {
  key: string;
  labelJP: string;
  type: FieldType;
  unit?: string;
  placeholder?: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  precision?: number; // 表示小数桁
  options?: FieldOption[]; // type === "enum" のとき
  visible?: boolean;
  mobileOnly?: boolean;
  tags?: string[];
}

export interface MachineIO {
  inputs: FieldDef[];
  outputs: FieldDef[];
}

/* ===== Benchmarks（基準比較） ===== */
export type BenchmarkMethod = "ratio" | "diff" | "z";

export interface BenchmarkDef {
  method: BenchmarkMethod;

  // 値の取り方
  valueKey?: string;
  numeratorKey?: string;
  denominatorKey?: string;
  nKey?: string;

  // 基準
  baseline?: number;
  stddev?: number;

  // 評価ロジック
  higherIsBetter?: boolean;
  bands?: number[];

  // 見た目のスケール
  scale?: { min: number; mid: number; max: number };
}

/* ===== 機種レコード（任意メタは持たない） ===== */
export interface MachineRecord {
  schemaVersion: typeof MACHINE_SCHEMA_VERSION;
  machineId: string; // 小文字英数・-_
  name: { jp: string; en?: string };

  labelsJP?: Record<string, string>;

  // 入出力定義（スキーマ駆動UI）
  io: MachineIO;

  // 既存スコア（温存）
  scoring?: {
    method?: "ratio" | "z" | "shrinkage";
    params?: Record<string, unknown>;
  };

  // 基準比較の定義（キー=メトリクス名）
  benchmarks?: Record<string, BenchmarkDef>;

  /* ====== LUCK%・σ推定などに使う任意メタ ======
     - coinUnitPriceYen: コイン単価（20スロ基準、例: 3.1）
     - rateYenPerCoin  : 1枚あたりの円（20円スロなら 20）
     - sigmaSpinDefault: 機種デフォルトの1回転あたりσ（あればこちらを優先）
     これらは存在すれば利用し、未指定でも可。 */
  coinUnitPriceYen?: number;
  rateYenPerCoin?: number;
  sigmaSpinDefault?: number;
}

/* ===== Utility ===== */
export const getField = (defs: FieldDef[], key: string) =>
  defs.find((d) => d.key === key);

export type DisplayKind = "number" | "percent" | "rate"; // rate=1/xxxx表記

export interface OutputFieldMeta {
  display?: DisplayKind;
  precision?: number; // 出力時の小数桁（rate/percent/number 共通）
}

export interface OutputFieldDef {
  id: string;
  label: string;
  // 計算は indicator/scoring 側。UI はこの meta を参照して描画だけ行う
  meta?: OutputFieldMeta;
}
