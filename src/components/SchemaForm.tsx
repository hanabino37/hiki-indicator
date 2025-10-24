/* ---------- src/components/SchemaForm.tsx (tags-v1) ---------- */
import React, { useEffect, useMemo } from "react";
import type { MachineRecord, FieldDef } from "../types/schema";
import { jpLabel } from "../lib/schemaRegistry";
import { formatNumber, formatRateFromDenom } from "../lib/format";
import { useMachineInputs } from "../lib/useMachineInputs";

type Props = {
  machine: MachineRecord;
  onChange?: (values: Record<string, any>) => void;
  outputs?: Record<string, number | string | boolean | null | undefined>;
  actions?: React.ReactNode;
  showOutputs?: boolean;
};

type Values = Record<string, any>;

// 出力表示用の軽量メタ
type OutputDisplay = "number" | "percent" | "rate";
type OutputMeta = { display?: OutputDisplay; precision?: number };

// ---------- ユーティリティ ----------
const arr = <T,>(x: T | T[] | undefined | null): T[] =>
  Array.isArray(x) ? x : x == null ? [] : [x];

/** tags から "kind:part" という1本のキーを作る（例: spins:total / count:big など） */
function getTagKey(d: FieldDef): string | null {
  const tags = arr((d as any).tags).map(String);
  if (tags.length === 0) return null;
  // role:totalSpins, role:normalSpins → spins:total / spins:normal に正規化
  if (tags.includes("role:totalSpins")) return "spins:total";
  if (tags.includes("role:normalSpins")) return "spins:normal";
  // 通常の組み合わせ（kind + part）を拾う
  const kinds = ["spins", "count", "rate", "avg", "diff"];
  for (const t of tags) {
    const [k, v] = String(t).split(":");
    if (kinds.includes(k) && v) return `${k}:${v}`;
  }
  return null;
}

/** 機種の tags から「ノーマル系」っぽいかを判定（無ければ従来のキー推測） */
function isNormalType(m: MachineRecord): boolean {
  const t = new Set(arr((m as any).tags).map(s => String(s).toLowerCase()));
  if (t.has("type:normal")) return true;
  if (t.has("type:at")) return false;
  // フォールバック：inputs のキーに葡萄などがあればノーマルっぽい
  const keys = (m.io?.inputs ?? []).map(d => d.key);
  const marks = new Set(["regRate","bigRate","budouRate","grapeRate","bellRate","cherryRate"]);
  return keys.some(k => marks.has(k));
}

// ---------- 入力コントロール ----------
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
        const n = typeof value === "number" ? value : (value === "" ? 0 : Number(value) || 0);
        return (
          <div className="hi-input-wrap">
            <button
              type="button"
              className="hi-sign"
              onClick={() => onChange(-n)}
              aria-label="符号を反転"
              title="符号を反転"
            >±</button>
            <input
              {...commonProps}
              type="number"
              inputMode="decimal"
              step={def.step ?? "any"}
              min={def.min ?? undefined}
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
            <option key={i} value={String(opt.value)}>{opt.labelJP}</option>
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
  // ---------- 入力定義：tags を考慮したフィルタ & 並び ----------
  const inputDefs: FieldDef[] = useMemo(() => {
    const base = machine.io?.inputs || [];
    const normal = isNormalType(machine);

    // firstHit* は **ノーマル系の時だけ** UI 入力から外す
    const dropFirstHit = (d: FieldDef) => {
      if (!normal) return false;
      const k = (d.key || "").toLowerCase();
      return /^firsthit(?:count|rate|s)$/.test(k);
    };

    // ノーマル系の時だけ「REG確率（確率欄）」を除外
    // 1) タグ: ["prob","reg"]（ただし BIG の確率は残す）
    // 2) フォールバック: キー/ラベルから判定
    const dropRegProbForNormal = (d: FieldDef) => {
      if (!normal) return false;

      const tags = arr((d as any).tags).map(s => String(s).toLowerCase());
      if (tags.includes("prob") && tags.includes("reg")) return true;
      if (tags.includes("prob") && tags.includes("big")) return false;

      const k = (d.key || "").toLowerCase();
      const lbl = String(d.labelJP || "");
      const isKeyProb =
        /(big|reg)/i.test(k) && /(rate|prob|probability|denom)/i.test(k);
      const isLabelProb = /確率/.test(lbl);
      // REG の確率だけ落とす
      return (isKeyProb && /reg/i.test(k)) || (isLabelProb && /REG/.test(lbl));
    };

    // ▼ 除外を適用
    const without = base.filter(
      (d) => !(dropFirstHit(d) || dropRegProbForNormal(d))
    );

    // ▼ BIG/REG の自動追加は「ノーマル系のときだけ」
    let withAuto: FieldDef[] = without;
    if (normal) {
      const exists = (k: string) =>
        without.some((d) => (d.key || "").toLowerCase() === k.toLowerCase());
      const add: FieldDef[] = [];
      if (!exists("bigCount")) {
        add.push({
          key: "bigCount",
          labelJP: "BIG回数",
          type: "number",
          min: 0, step: 1, precision: 0, required: false,
          placeholder: "例）12",
          ...( { tags: ["count","big"] } as any ),
        } as FieldDef);
      }
      if (!exists("regCount")) {
        add.push({
          key: "regCount",
          labelJP: "REG回数",
          type: "number",
          min: 0, step: 1, precision: 0, required: false,
          placeholder: "例）6",
          ...( { tags: ["count","reg"] } as any ),
        } as FieldDef);
      }
      withAuto = [...without, ...add];
    }

    // debug removed

    // ▼ AT系では BIG/REG を **最終的に必ず** 強制除去（混入対策）
    const afterForceDrop = normal
      ? withAuto
      : withAuto.filter(d => {
          const k = (d.key || "").toLowerCase();
          return k !== "bigcount" && k !== "regcount";
        });

    // debug removed

    // ▼ 並びの決定（formOrder > フォールバック）
    const formOrder = arr((machine.io as any)?.formOrder).map((s) => String(s).toLowerCase());
    const hasFormOrder = formOrder.length > 0;

    const AVG_KEYS = ["avgcoinsobs","avgcoins","avgcoinsperhit","avggetcoins"];

    // ノーマル用：ブドウ等の「回数」検出（rate ではなく count/hit 系）
    const FRUIT_COUNT_RE = /(budou|grape|bell|cherry|suika|melon|fruit).*(count|hits?)$/i;
    // AT用：従来の「確率/レート」
    const FRUIT_RATE_RE  = /(budou|grape|bell|cherry|suika|melon|fruit).*rate$/i;

    // ★ フォールバックデフォ順（formOrder が無い時）
    const fallbackOrderIndex = (kRaw: string) => {
     const k = (kRaw || "").toLowerCase();

     if (normal) {
       // ノーマル系：総回転 → 通常 → BIG回 → REG回 → ブドウ回数(等) → 平均獲得 → 差枚
       if (k === "totalspins") return 0;
       if (k === "normalspins") return 1;
       if (k === "bigcount")    return 2;
       if (k === "regcount")    return 3;
       if (FRUIT_COUNT_RE.test(k)) return 4;
       if (AVG_KEYS.includes(k)) return 5;
       if (k === "diffcoins")   return 6;
       return Number.MAX_SAFE_INTEGER;
     }

       // AT系（現状どおり）
       if (k === "totalspins") return 0;
       if (k === "normalspins") return 1;
       if (k === "firsthits")   return 2;
       if (AVG_KEYS.includes(k)) return 3;
       if (FRUIT_RATE_RE.test(k)) return 4;
       if (k === "diffcoins")   return 5;
      return Number.MAX_SAFE_INTEGER; 
    };

    const orderIndexByFormOrder = (d: FieldDef): number => {
      const tk = getTagKey(d); // "spins:total" 等
      if (tk) {
        const idx = formOrder.indexOf(tk);
        if (idx >= 0) return idx;
      }
      return fallbackOrderIndex(d.key || "");
    };

    const merged = [...afterForceDrop].sort((a, b) => {
      if (hasFormOrder) return orderIndexByFormOrder(a) - orderIndexByFormOrder(b);
      return fallbackOrderIndex(a.key || "") - fallbackOrderIndex(b.key || "");
    });

    // debug removed

    return merged;
  }, [machine]);

  const outputDefs = machine.io?.outputs || [];

  const initialValues: Values = useMemo(() => {
    const v: Values = {};
    for (const d of inputDefs) {
      if ((d as any).default !== undefined) v[d.key] = (d as any).default;
      else v[d.key] = d.type === "boolean" ? false : "";
    }
    return v;
  }, [inputDefs]);

  // 機種ごとの保存・復元
  const { inputs, setInputs } = useMachineInputs(
    machine.machineId,
    initialValues
  );

  // 親へ変更通知
  useEffect(() => { onChange?.(inputs); }, [inputs, onChange]);

  // —— 出力レンダラ（1/xxxx 表記対応） ——
  function renderOutputText(raw: any, def: any): string {
    const meta: OutputMeta | undefined = (def && (def.meta as OutputMeta)) || undefined;

    const display: OutputDisplay = (meta?.display as OutputDisplay) ?? "number";
    const precision: number =
      (typeof meta?.precision === "number" ? meta?.precision : undefined) ??
      (typeof def?.precision === "number" ? def?.precision : undefined) ??
      (display === "rate" ? 1 : 0);

    if (raw === null || raw === undefined || raw === "") return "";

    if (typeof raw === "number") {
      if (display === "rate") return formatRateFromDenom(raw, precision);
      return formatNumber(raw, precision);
    }
    return String(raw);
  }
  // —— ここまで出力レンダラ ——

  return (
    <div className="hi-wrap">
      <header className="hi-head">
        <h1 className="hi-title">{machine.name.jp}</h1>
        <div style={{ fontSize: 12, opacity: .6 }}>form-ver: <b>tags-v1</b></div>
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

        {actions ? <div className="hi-actions" style={{ marginTop: 8 }}>{actions}</div> : null}
      </section>

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
