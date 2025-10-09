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
}

export interface MachineIO {
  inputs: FieldDef[];
  outputs: FieldDef[];
}

export interface ReferenceLink {
  title: string;
  url: string;
}

export interface MachineRecord {
  schemaVersion: typeof MACHINE_SCHEMA_VERSION;
  machineId: string; // 小文字英数・-_
  name: { jp: string; en?: string };
  maker: string;
  introductionMonth: string; // YYYY-MM
  numberClass: string; // 5号機 / 6.0号機 / 6.5号機 / 6.6号機
  type: "AT" | "ART" | "RT" | "ノーマル" | "A+RT" | "ST" | "その他";
  tags?: string[];
  references?: ReferenceLink[];
  notes?: string;
  labelsJP?: Record<string, string>;
  io: MachineIO;
  scoring?: {
    method?: "ratio" | "z" | "shrinkage";
    params?: Record<string, unknown>;
  };
}

// Utility: find field def by key
export const getField = (defs: FieldDef[], key: string) => defs.find(d => d.key === key);
