import React, { useMemo, useState } from "react";
import DynamicForm, { InputValues } from "./components/DynamicForm";
import ResultsSection from "./components/ResultsSection";
import SettingsModal from "./components/SettingsModal";
import { loadSettings } from "./lib/settings";

type Machine = {
  machineId: string;
  name: string;
  settingOptions: string[]; // 表示用（設定1..n）
};

const defaultMachine: Machine = {
  machineId: "monkey_v",
  name: "モンキーV（サンプル）",
  settingOptions: ["設定1","設定2","設定3","設定4","設定5","設定6"],
};

export default function App() {
  const [machine, setMachine] = useState<Machine>(defaultMachine);
  const [showSettings, setShowSettings] = useState(false);
  const [submitted, setSubmitted] = useState<InputValues | null>(null);
  const s = loadSettings();

  const onSubmit = (v: InputValues) => setSubmitted(v);

  // 1/xxx → xxx の分母を返す
  const atDenom = useMemo(()=>{
    if (!submitted) return NaN;
    const m = submitted.atHitText.match(/1\s*\/\s*(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  },[submitted]);

  return (
    <div style={{padding:"24px", fontFamily:"system-ui, -apple-system, Segoe UI, Noto Sans JP, sans-serif"}}>
      <header style={{display:"flex",alignItems:"center",gap:12, marginBottom:12}}>
        <h1 style={{margin:0, fontSize:24}}>Hiki Indicator</h1>
        <span style={{color:"#666"}}>{machine.name}</span>
        <div style={{flex:1}}/>
        <button onClick={()=>setShowSettings(true)} aria-label="設定">⚙️ 設定</button>
      </header>

      <section style={{display:"grid", gap:16}}>
        <DynamicForm
          settings={{ settingOptions: machine.settingOptions }}
          onSubmit={onSubmit}
          onOpenSettings={()=>setShowSettings(true)}
        />

        {submitted && isFinite(atDenom) && (
          <div className="card" style={{border:"1px solid #eee", borderRadius:12, padding:12}}>
            <ResultsSection
              machineId={machine.machineId}
              totalSpins={submitted.totalSpins}
              atDenom={atDenom}
              atAvgMedals={submitted.atAvgMedals}
            />
          </div>
        )}
      </section>

      <SettingsModal
        open={showSettings}
        onClose={()=>setShowSettings(false)}
        onApply={()=>{/* 反映は loadSettings 経由で再読込 */}}
      />
    </div>
  );
}
