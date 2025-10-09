// src/lib/validateMachine.ts
// AJV v8 — JSON Schema Draft 2020-12 対応版（メタスキーマ読み込み不要）

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../schema/machine.schema.json";
import type { ValidateFunction } from "ajv";
import type { MachineRecord } from "../types/schema";

// 共通の戻り値型：成功時は value を同梱、失敗時は errors を返す
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

// シングルトンで AJV を保持
let ajv: Ajv2020 | null = null;
let validateFn: ValidateFunction | null = null;

function getAjv(): Ajv2020 {
  if (!ajv) {
    ajv = new Ajv2020({
      allErrors: true,
      strict: false, // 既存データの受け入れ幅を確保
    });
    addFormats(ajv); // uri 等のformatサポート
  }
  return ajv;
}

export function getMachineValidator(): ValidateFunction {
  if (!validateFn) {
    // JSON を直接 import して compile（tsconfig: resolveJsonModule 必須）
    validateFn = getAjv().compile(schema as any);
  }
  return validateFn;
}

export function validateMachine(obj: unknown): ValidationResult<MachineRecord> {
  const validate = getMachineValidator();
  const ok = validate(obj) as boolean;
  if (ok) {
    return { ok: true, value: obj as MachineRecord };
  }
  const errors = (validate.errors || []).map(
    (e) => `path:${e.instancePath || "/"} ${e.message}`
  );
  return { ok: false, errors };
}

export function validateMachines(objs: unknown[]): ValidationResult<MachineRecord[]> {
  const results: MachineRecord[] = [];
  const allErrors: string[] = [];

  for (let i = 0; i < objs.length; i++) {
    const r = validateMachine(objs[i]);
    if (r.ok) {
      results.push(r.value);
    } else {
      allErrors.push(`[${i}]\n` + r.errors.join("\n"));
    }
  }

  if (allErrors.length === 0) {
    return { ok: true, value: results };
  }
  return { ok: false, errors: allErrors };
}
