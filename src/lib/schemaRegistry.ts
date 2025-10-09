import type { MachineRecord } from "../types/schema";

export const CURRENT_MACHINE_SCHEMA = "1.0.0";

export function isSupportedMachineSchema(v?: string) {
  return v === CURRENT_MACHINE_SCHEMA;
}

export function ensureSupported(record: MachineRecord): MachineRecord {
  if (!isSupportedMachineSchema(record.schemaVersion)) {
    throw new Error(`Unsupported schema version: ${record.schemaVersion}`);
  }
  return record;
}

export function jpLabel(record: MachineRecord, key: string, fallback?: string) {
  return record.labelsJP?.[key] ?? fallback ?? key;
}
