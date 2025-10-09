import React, { useState } from "react";

export type InputValues = {
  totalSpins: number;
  atHitText: string;      // 1/xxx
  atAvgMedals: number;
  settingIdx: number;     // 1始まり
};

export default function DynamicForm({
  settings, onSubmit, onOpenSettings,
  labels = { totalSpins:"総回転数", atHit:"AT初当り確率", atAvg:"AT平均獲得枚数", setting:"設定" },
}: {
  settings: { settingOptions: string[] };
  onSubmit: (v: InputValues)=>void;
  onOpenSettings: ()=>void;
  labels?: { totalSpins:string; atHit:string; atAvg:string; setting:string; };
}) {
  const [v, setV] = useState<InputValues>({ totalSpins: 0, atHitText: "1/200", atAvgMedals: 400, settingIdx: 1 });

  const parseOneOver = (text: string) => {
    const m = text.match(/1\s*\/\s*(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  };

  const onClick = () => {
    const denom = parseOneOver(v.atHitText);
    if (!isFinite(v.totalSpins) || v.totalSpins < 0) return alert("総回転数が不正です");
    if (!isFinite(denom)) return alert("AT初当り確率は 1/xxx で入力してください");
    if (!isFinite(v.atAvgMedals)) return alert("AT平均獲得枚数が不正です");
    onSubmit(v);
  };

  return (
    <div className="form">
      <div className="row"><label>{labels.totalSpins}</label>
        <input type="number" value={v.totalSpins} onChange={(e)=>setV({...v,totalSpins:Number(e.target.value)})} /></div>
      <div className="row"><label>{labels.atHit}</label>
        <input value={v.atHitText} onChange={(e)=>setV({...v,atHitText:e.target.value})} placeholder="1/xxx"/></div>
      <div className="row"><label>{labels.atAvg}</label>
        <input type="number" value={v.atAvgMedals} onChange={(e)=>setV({...v,atAvgMedals:Number(e.target.value)})} /></div>
      <div className="row"><label>{labels.setting}</label>
        <select value={v.settingIdx} onChange={(e)=>setV({...v,settingIdx:Number(e.target.value)})}>
          {settings.settingOptions.map((s,i)=>(<option key={i} value={i+1}>{s}</option>))}
        </select>
      </div>
      <div className="row" style={{gap:8}}>
        <button onClick={onOpenSettings}>設定</button>
        <div style={{flex:1}}/>
        <button onClick={onClick}>データを確認</button>
      </div>
      <style>{`.form{display:flex;flex-direction:column;gap:8px}.row{display:flex;gap:8px;align-items:center}label{width:9rem}`}</style>
    </div>
  );
}
