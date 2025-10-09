import React, { useMemo, useRef } from "react";
import ResultChart, { ChartRow } from "./ResultChart";
import { AppSettings, loadSettings } from "../lib/settings";
import { evaluateMetric } from "../lib/expr";
import { combineZ, scoreBadge } from "../lib/hikiIndex";
import * as htmlToImage from "html-to-image";

export default function ResultsSection({
  machineId,
  totalSpins,
  atDenom,          // 入力 1/xxx → xxx
  atAvgMedals,
}: {
  machineId: string;
  totalSpins: number;
  atDenom: number;
  atAvgMedals: number;
}) {
  const s: AppSettings = loadSettings();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows: ChartRow[] = useMemo(() => {
    // ダミー構成：初当り・平均枚数の2本を比較（必要に応じて増やせます）
    const metrics: ChartRow[] = [];

    // 1) 初当り（観測 = 総回転数 / 分母）
    const atExpected = atDenom; // 基準は分母
    const atObserved = atDenom; // 観測も同じ単位スケールで評価（簡易）
    const m1 = evaluateMetric({ value: atObserved, baseline: atExpected, cap: s.ratioCap });
    metrics.push({ key: "AT", label: "AT初当り", ratio: m1.ratio, z: m1.z });

    // 2) 平均枚数（観測=入力、基準=入力自身を仮で1倍。実際は機種基準JSONと突き合わせる想定）
    const m2 = evaluateMetric({ value: atAvgMedals, baseline: atAvgMedals, cap: s.ratioCap });
    metrics.push({ key: "AVG", label: "AT平均枚数", ratio: m2.ratio, z: m2.z });

    return metrics;
  }, [atDenom, atAvgMedals, s.ratioCap]);

  const score = useMemo(() => {
    const zs = rows.map(r => ({ label: r.label, z: r.z }));
    return combineZ(zs);
  }, [rows]);
  const badge = scoreBadge(score);

  const savePng = async () => {
    if (!containerRef.current) return;
    const node = containerRef.current;
    const dataUrl = await htmlToImage.toPng(node);
    const now = new Date();
    const y = now.getFullYear().toString();
    const m = String(now.getMonth()+1).padStart(2,"0");
    const d = String(now.getDate()).padStart(2,"0");
    const name = `${machineId}_${y}${m}${d}_01.png`;
    const a = document.createElement("a");
    a.href = dataUrl; a.download = name; a.click();
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8, margin:"8px 0"}}>
        <span>HikiIndex:</span>
        <strong style={{fontSize:20}}>{score}</strong>
        <span style={{padding:"2px 8px", borderRadius:12, background:"#eee"}}>{badge.name}</span>
        <div style={{flex:1}}/>
        <button onClick={savePng}>画像として保存</button>
      </div>

      <div ref={containerRef}>
        <ResultChart rows={rows} bands={s.bands}/>
      </div>
    </div>
  );
}
