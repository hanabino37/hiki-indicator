// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import SchemaForm from "./components/SchemaForm";
import "./styles/schema.css";

import type { MachineRecord } from "./types/schema";
import { computeOutputs } from "./lib/scoring";
import IndicatorChart from "./components/IndicatorChart";
import { computeIndicators, toChartRows } from "./lib/indicator";
import type { ChartRow as ViewChartRow } from "./components/IndicatorChart";
import { CATALOG, type MachineOption } from "./machines/catalog";

const LS_KEY_SELECTED = "hiki:selectedMachineId";

export default function App() {
  // --- 機種選択 ---
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem(LS_KEY_SELECTED) || (CATALOG[0]?.id ?? "");
  });
  // 表示名も保持（id照合で見つからない場合のフォールバックに使用）
  const [selectedLabel, setSelectedLabel] = useState<string>("");

  const [machine, setMachine] = useState<MachineRecord | null>(null);

  // 入力・表示の状態
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [show, setShow] = useState(false);

  // フォームを強制的に再マウントするための key
  const [formKey, setFormKey] = useState(0);

  // 決定ボタン押下で機種を確定（フォームはクリーンスタート）
  function confirmMachine() {
    console.log("[confirm] selectedId =", selectedId, " selectedLabel =", selectedLabel);
    const optById = CATALOG.find((o: MachineOption) => o.id === selectedId);
    const optByLabel = selectedLabel
      ? CATALOG.find((o: MachineOption) => o.label === selectedLabel)
      : undefined;
    const opt = optById ?? optByLabel;
    console.log("[confirm] matched =", opt?.id, "|", opt?.label, "from", opt?.path);

    if (opt) {
      setMachine(opt.data);
      setInputs({});
      setShow(false);
      setFormKey((k) => k + 1); // 再マウントで内部入力も初期化
      localStorage.setItem(LS_KEY_SELECTED, opt.id);
    }
  }

  // 入力のリセット
  function resetInputs() {
    setInputs({});
    setShow(false);
    setFormKey((k) => k + 1);
    try {
      if (machine?.machineId) {
        const prefixes = [
          `hiki:inputs:${machine.machineId}`,
          `hiki:form:${machine.machineId}`,
        ];
        const toDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || "";
          if (prefixes.some((p) => k.startsWith(p))) toDelete.push(k);
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
      }
    } catch {}
  }

  // 初回：前回選択を復元（※ === に修正、表示名も復元）
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY_SELECTED);
    if (saved) {
      const opt = CATALOG.find((o: MachineOption) => o.id === saved);
      if (opt) {
        setMachine(opt.data);
        setSelectedId(opt.id);
        setSelectedLabel(opt.label);
      }
    }
  }, []);

  // --- 入出力と指標 ---
  const outputs = useMemo(
    () => (machine ? computeOutputs(machine, inputs) : {}),
    [machine, inputs]
  );

  // 1つでも入力されているか？
  const hasData = useMemo(() => {
    if (!machine) return false;
    const defs = machine.io.inputs || [];
    for (const d of defs) {
      const v = (inputs as any)[d.key];
      if (v === "" || v === undefined || v === null) continue;
      if (d.type === "number") {
        if (typeof v === "number" && Number.isFinite(v)) return true;
        continue;
      }
      if (d.type === "boolean") {
        if (v === true) return true;
        continue;
      }
      if (String(v).trim().length > 0) return true;
    }
    return false;
  }, [machine, inputs]);

  // ChartRow[]（ビュー側の型）に変換
  const indicators = useMemo<ViewChartRow[]>(
    () =>
      machine && show && hasData
        ? (toChartRows(
            computeIndicators(machine, inputs, outputs),
            // 第二引数を受ける版に合わせて渡している場合の互換（不要なら削除OK）
            outputs as any
          ) as ViewChartRow[])
        : [],
    [machine, inputs, outputs, show, hasData]
  );

  return (
    <div>
      <div style={{ padding: 8, color: "#0a0" }}>OK: App mounted</div>

      {/* 機種選択エリア */}
      <section className="hi-sec" style={{ marginBottom: 12 }}>
        <h2 className="hi-sec-title hi-sec-title--center">機種選択</h2>

        <div className="hi-pick">
          <select
            className="hi-select"
            value={selectedId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const val = e.target.value;
              const txt = e.target.selectedOptions?.[0]?.text ?? "";
              console.log("[select] id=", val, " label=", txt);
              setSelectedId(val);
              setSelectedLabel(txt);
            }}
          >
            {CATALOG.map((opt: MachineOption) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <button className="hi-btn" type="button" onClick={confirmMachine}>
            決定
          </button>
        </div>
      </section>

      {/* 入力フォーム（機種決定後に表示） */}
      {machine && (
        <>
          {/* 選択中の機種名を明示（任意） */}
          <h2 className="hi-machine-name" style={{ margin: "8px 0" }}>
            {machine.name?.jp ?? machine.machineId}
          </h2>

          <SchemaForm
            key={formKey}
            machine={machine}
            onChange={setInputs}
            outputs={outputs}
            showOutputs={false}
          />

          <div
            className="hi-actions"
            style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <button className="hi-btn" onClick={() => setShow(true)}>
              データを確認する
            </button>
            <button className="hi-btn" onClick={resetInputs}>
              入力をリセット
            </button>
          </div>

          {show && (
            <section className="hi-sec">
              <h2 className="hi-sec-title hi-sec-title--center">指標</h2>

              {!hasData ? (
                <div className="hi-no-data">NO DATA</div>
              ) : (
                <>
                  <IndicatorChart rows={indicators} />
                  <div
                    className="hi-note--center"
                    style={{ marginTop: 6, fontSize: ".9rem" }}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
