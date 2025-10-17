// src/components/SchemaForm.tsx
import React, { useEffect, useMemo } from "react";
import type { MachineRecord, FieldDef } from "../types/schema";
import { jpLabel } from "../lib/schemaRegistry";
import { formatNumber, formatRateFromDenom } from "../lib/format";
import { useMachineInputs } from "../lib/useMachineInputs";

type Props = {
  machine: MachineRecord;
  onChange?: (values: Record<string, any>) => void;
  outputs?: Record<string, number | string | boolean | null | undefined>;
  /** 入力グリッドの直下に差し込むアクション領域（外部から注入） */
  actions?: React.ReactNode;
  /** 出力セクションの表示/非表示（既定: 表示） */
  showOutputs?: boolean;
};

type Values = Record<string, any>;

// 出力表示用の軽量メタ（schema 側の有無に依存しない安全な参照）
type OutputDisplay = "number" | "percent" | "rate";
type OutputMeta = {
  display?: OutputDisplay;   // "rate" のときだけ 1/xxxx 表記にする
  precision?: number;        // 出力時の小数桁
};

function InputControl({
  def, value, onChange,
}: { def: FieldDef; value: any; onChange: (v: any) => void; }) {
  if (def.visible === false) return null;

  const commonProps = {
    id: def.key,
    required: !!def.required,
    placeholder: def.placeholder || "",
  };

  // 差枚数など、マイナス許可のフィールド判定
  const allowNegative =
    (def as any).allowNegative === true || def.key === "diffCoins";

  switch (def.type) {
    case "number": {
      if (allowNegative) {
        // iOS の数値キーボードに「-」がないため、±ボタンで符号を切り替える
        const n = typeof value === "number" ? value : (value === "" ? 0 : Number(value) || 0);
        return (
          <div className="hi-input-wrap">
            <button
              type="button"
              className="hi-sign"
              onClick={() => onChange(-n)}
              aria-label="符号を反転"
              title="符号を反転"
            >
              ±
            </button>
            <input
              {...commonProps}
              type="number"
              inputMode="decimal"   // 10キーを出しつつ小数も許可
              step={def.step ?? "any"}
              min={def.min ?? undefined}  // 必要なら負値も入るように設定しておく
              max={def.max ?? undefined}
              value={value ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onChange(v === "" ? "" : Number(v));
              }}
              className="hi-input"
            />
          </div>
        );
      }

      // 通常の数値入力
      return (
        <input
          {...commonProps}
          type="number"
          inputMode="numeric"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          step={def.step ?? "any"}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v));
          }}
          className="hi-input"
        />
      );
    }
    case "string":
      return (
        <input
          {...commonProps}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="hi-input"
        />
      );
    case "boolean":
      return (
        <input
          {...commonProps}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "enum":
      return (
        <select
          {...commonProps}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="hi-select"
        >
          <option value="" disabled>
            {def.placeholder || "選択してください"}
          </option>
          {(def.options || []).map((opt, i) => (
            <option key={i} value={String(opt.value)}>
              {opt.labelJP}
            </option>
          ))}
        </select>
      );
    default:
      return null;
  }
}

export default function SchemaForm({
  machine,
  onChange,
  outputs,
  actions,
  showOutputs = true,
}: Props) {
  // ★ ここで machine.io.inputs を仮想的に差し替え
  //    firstHitRate → firstHitCount（ラベル: 初当り回数、整数入力）
  const inputDefs: FieldDef[] = useMemo(() => {
    const defs = machine.io.inputs || [];
    return defs.map((d) => {
      if ((d.key ?? "") === "firstHitRate") {
        return {
          ...d,
          key: "firstHitCount",
          labelJP: "初当り回数",
          type: "number",
          min: 0,
          step: 1,
          precision: 0,
          unit: undefined,
        } as FieldDef;
      }
      return d;
    });
  }, [machine]);

  const outputDefs = machine.io.outputs || [];

  const initialValues: Values = useMemo(() => {
    const v: Values = {};
    for (const d of inputDefs) {
      if (d.default !== undefined) v[d.key] = d.default;
      else v[d.key] = d.type === "boolean" ? false : "";
    }
    return v;
  }, [inputDefs]);

  // 機種ごとの保存・復元（キー: hiki:inputs:<machineId>）
  const { inputs, setInputs } = useMachineInputs(
    machine.machineId,
    initialValues
  );

  // 親へ変更通知
  useEffect(() => {
    onChange?.(inputs);
  }, [inputs, onChange]);

  // —— 出力レンダラ（1/xxxx 表記対応） ——
  function renderOutputText(raw: any, def: any): string {
    // meta（任意）： { display: "number" | "percent" | "rate", precision?: number }
    const meta: OutputMeta | undefined = (def && (def.meta as OutputMeta)) || undefined;

    const display: OutputDisplay = (meta?.display as OutputDisplay) ?? "number";
    const precision: number =
      (typeof meta?.precision === "number" ? meta?.precision : undefined) ??
      (typeof def?.precision === "number" ? def?.precision : undefined) ??
      (display === "rate" ? 1 : 0);

    if (raw === null || raw === undefined || raw === "") return "";

    if (typeof raw === "number") {
      if (display === "rate") {
        return formatRateFromDenom(raw, precision);
      }
      return formatNumber(raw, precision);
    }
    return String(raw);
  }
  // —— ここまで出力レンダラ ——

  return (
    <div className="hi-wrap">
      <header className="hi-head">
        <h1 className="hi-title">{machine.name.jp}</h1>
      </header>

      <section className="hi-sec">
        <h2 className="hi-sec-title">入力</h2>
        <div className="hi-grid hi-grid--form">
          {inputDefs.map((def) => (
            <label key={def.key} className="hi-field">
              <div className="hi-label">
                {jpLabel(machine, def.key, def.labelJP)}
                {def.unit ? <span className="hi-unit">（{def.unit}）</span> : null}
                {def.required ? <span className="hi-req">＊</span> : null}
              </div>
              <InputControl
                def={def}
                value={inputs[def.key]}
                onChange={(v) => setInputs((s: Values) => ({ ...s, [def.key]: v }))}
              />
            </label>
          ))}
        </div>

        {/* 入力直下のアクション（外部から注入） */}
        {actions ? (
          <div className="hi-actions" style={{ marginTop: 8 }}>
            {actions}
          </div>
        ) : null}
      </section>

      {/* 出力セクションはフラグで制御（レイアウトごと非表示） */}
      {showOutputs && (
        <section className="hi-sec">
          <h2 className="hi-sec-title">出力</h2>
          <div className="hi-grid">
            {outputDefs.map((def) => {
              const raw = outputs ? (outputs as any)[def.key] : "";
              const text = renderOutputText(raw, def);
              return (
                <div key={def.key} className="hi-field">
                  <div className="hi-label">
                    {jpLabel(machine, def.key, def.labelJP)}
                    {def.unit ? <span className="hi-unit">（{def.unit}）</span> : null}
                  </div>
                  <div className="hi-output">{text}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
