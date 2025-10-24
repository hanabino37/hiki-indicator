// src/lib/machineKind.ts
import type { MachineRecord } from "../types/schema";

/**
 * ノーマル系を判定する多段ロジック
 * 優先度: 明示フラグ > 個別オーバーライド > スキーマ推論 > ベンチマーク推論
 */
const NORMAL_ID_OVERRIDES = new Set<string>([
  // 必要に応じて machineId を追加
  "arexbright",
  // "some_juggler_xx",
]);

export function isNormalType(m: MachineRecord): boolean {
  const id = (m.machineId || "").toLowerCase();

  // 1) 明示フラグ（あれば最優先）
  const kind =
    ((m as any).kind ??
      (m as any).gameStyle ??
      (m as any).meta?.kind ??
      null) as string | null;

  if (typeof kind === "string") {
    const v = kind.toLowerCase();
    if (v === "normal" || v === "a" || v === "a-type") return true;
    if (["at", "st", "lt"].includes(v)) return false;
  }

  const tags: string[] = Array.isArray((m as any).tags)
    ? (m as any).tags.map((t: any) => String(t).toLowerCase())
    : [];
  if (tags.includes("normal") || tags.includes("a-type")) return true;
  if (tags.some((t) => ["at", "st", "lt"].includes(t))) return false;

  // 2) 個別オーバーライド
  if (NORMAL_ID_OVERRIDES.has(id)) return true;

  // 3) スキーマからの推論
  const inputKeys = (m.io?.inputs ?? [])
    .map((d) => (d.key || "").toLowerCase());
  const hasBigRegRate = inputKeys.some((k) => /(big|reg).*rate$/.test(k));
  const hasBigRegCount =
    inputKeys.includes("bigcount") || inputKeys.includes("regcount");
  const hasFirstHit = inputKeys.some((k) => /^firsthit(rate|count|s)$/.test(k));

  if ((hasBigRegRate || hasBigRegCount) && !hasFirstHit) return true;

  // 4) ベンチマークからの推論
  const bmKeys = Object.keys((m as any).benchmarks ?? {}).map((k) =>
    k.toLowerCase()
  );
  if (bmKeys.includes("bigrate") || bmKeys.includes("regrate")) return true;

  return false;
}
