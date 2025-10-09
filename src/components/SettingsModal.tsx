import React, { useEffect, useState } from "react";
import { AppSettings, defaultSettings, exportSettings, importSettings, loadSettings, saveSettings } from "../lib/settings";
import { ColorBand } from "../lib/color";

export default function SettingsModal({
  open, onClose, onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (s: AppSettings) => void;
}) {
  const [s, setS] = useState<AppSettings>(loadSettings());
  useEffect(() => { if (open) setS(loadSettings()); }, [open]);

  const updateBand = (i: number, patch: Partial<ColorBand>) => {
    const next = [...s.bands];
    next[i] = { ...next[i], ...patch };
    setS({ ...s, bands: next });
  };

  const addBand = () => setS({ ...s, bands: [...s.bands, { name: "新色", color: "#cccccc", min: 1.2 }] });
  const removeBand = (i: number) => setS({ ...s, bands: s.bands.filter((_, idx) => idx !== i) });

  const doApply = () => { saveSettings(s); onApply(s); onClose(); };
  const doExport = () => navigator.clipboard.writeText(exportSettings(s));
  const doImport = async () => {
    const text = prompt("設定JSONを貼り付け");
    if (!text) return;
    try { const next = importSettings(text); setS(next); } catch { alert("JSONの形式が不正です"); }
  };
  const doReset = () => setS(defaultSettings);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <h3>設定</h3>
        <div className="row">
          <label>指標スキーム</label>
          <select value={s.scheme} onChange={(e)=>setS({ ...s, scheme: e.target.value as any })}>
            <option value="ratio">ratio（倍率）</option>
            <option value="z">z（偏差値）</option>
          </select>
        </div>
        <div className="row">
          <label>倍率キャップ</label>
          <input type="number" value={s.ratioCap} step={0.1} min={1} onChange={(e)=>setS({ ...s, ratioCap: Number(e.target.value) })}/>
        </div>
        <details>
          <summary>色帯（白 &lt; 青 &lt; 黄 &lt; 緑 &lt; 赤）</summary>
          {s.bands.map((b, i)=>(
            <div key={i} className="row" style={{gap:8, alignItems:"center"}}>
              <input value={b.name} onChange={(e)=>updateBand(i,{name:e.target.value})} style={{width:80}}/>
              <label>min</label><input type="number" step={0.01} value={b.min ?? ""} onChange={(e)=>updateBand(i,{min: e.target.value===""? undefined : Number(e.target.value)})} style={{width:80}}/>
              <label>max</label><input type="number" step={0.01} value={b.max ?? ""} onChange={(e)=>updateBand(i,{max: e.target.value===""? undefined : Number(e.target.value)})} style={{width:80}}/>
              <label>color</label><input type="color" value={b.color} onChange={(e)=>updateBand(i,{color:e.target.value})}/>
              <button onClick={()=>removeBand(i)}>削除</button>
            </div>
          ))}
          <div><button onClick={addBand}>色帯を追加</button></div>
        </details>

        <div className="btns">
          <button onClick={doExport}>Export</button>
          <button onClick={doImport}>Import</button>
          <button onClick={doReset}>Reset</button>
          <div style={{flex:1}}/>
          <button onClick={onClose}>閉じる</button>
          <button onClick={doApply}>適用</button>
        </div>
        <style>{`
          .modal-backdrop{position:fixed;inset:0;background:#0005;display:flex;align-items:center;justify-content:center;z-index:50}
          .modal{width:min(680px,90vw);background:#fff;border-radius:12px;padding:16px;box-shadow:0 10px 20px #0003}
          .row{display:flex;gap:12px;margin:8px 0}
          .btns{display:flex;gap:8px;margin-top:12px}
        `}</style>
      </div>
    </div>
  );
}
