// src/machines/catalog.ts
import type { MachineRecord } from "../types/schema";

export type MachineOption = {
  id: string;
  label: string;
  data: MachineRecord;
  path: string;
};

// data/machines/ 以下の JSON を全部集める（サブフォルダOK）
const modules: Record<string, unknown> = import.meta.glob(
  // Vite の glob は POSIX パス扱い。相対で OK。
  "../../data/machines/**/*.json",
  { eager: true }
);

// パス正規化（Windows/Posix どちらでもファイル名抽出できるように）
function basenameNoExt(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const base = norm.split("/").pop() ?? norm;
  return base.replace(/\.json$/i, "");
}

// JSON → MachineOption へ正規化
function toOption(path: string, mod: unknown): MachineOption | null {
  // Vite の JSON import は default に入ってくる場合がある
  const data = (mod as any)?.default ?? (mod as any);
  if (!data) return null;

  const machine = data as MachineRecord;

  const fileId = basenameNoExt(path);
  const id =
    machine?.machineId && String(machine.machineId).trim()
      ? String(machine.machineId)
      : fileId;

  const label =
    machine?.name?.jp?.trim() ||
    machine?.name?.en?.trim() ||
    id;

  return { id, label, data: machine, path };
}

// いったん配列化（null を除く）
const allOptions: MachineOption[] = Object.entries(modules)
  .map(([p, m]) => toOption(p, m))
  .filter((v): v is MachineOption => !!v);

// id 重複ガード（先勝ち）
const uniqById = new Map<string, MachineOption>();
for (const opt of allOptions) {
  if (!uniqById.has(opt.id)) uniqById.set(opt.id, opt);
}

// 並びは日本語に優しい & 数値順も意識
export const CATALOG: MachineOption[] = Array.from(uniqById.values()).sort((a, b) =>
  a.label.localeCompare(b.label, "ja", { sensitivity: "base", numeric: true })
);

// 便利ユーティリティ
export const CATALOG_BY_ID: Record<string, MachineOption> = Object.fromEntries(
  CATALOG.map((o) => [o.id, o])
);

export function getMachineOption(id: string): MachineOption | undefined {
  return CATALOG_BY_ID[id];
}

export function getMachine(id: string): MachineRecord | undefined {
  return CATALOG_BY_ID[id]?.data;
}
