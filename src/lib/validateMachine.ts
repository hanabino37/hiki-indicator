import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import schema from "../schema/machine.schema.json";
import type { MachineRecord } from "../types/schema";

// ★ 共通の戻り値型
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

let ajv: Ajv | null = null;
let validateFn: ValidateFunction | null = null;

function getAjv() {
  if (!ajv) {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  }
  return ajv;
}

export function getMachineValidator(): ValidateFunction {
  if (!validateFn) {
    validateFn = getAjv().compile(schema as any);
  }
  return validateFn;
}

export function validateMachine(obj: unknown): ValidationResult<MachineRecord> {
  const validate = getMachineValidator();
  const ok = validate(obj) as boolean;
  if (ok) {
    // obj は MachineRecord とみなせる
    return { ok: true, value: obj as MachineRecord };
  }
  const errors = (validate.errors || []).map(
    e => `path:${e.instancePath || "/"} ${e.message}`
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
