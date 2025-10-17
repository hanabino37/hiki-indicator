import React from "react";

export type ChartRow = {
  id: string;
  label: string;           // 左に出す項目名
  valuePct: number;        // 0–100 のバー長
  display: string;         // 右端の数値
  title?: string;          // 通常ツールチップ（Fallback）
  baselinePct?: number;    // 基準線の位置（0–100, 既定50）
  baselineText?: string;   // 互換用：中央だけ出す場合に使用
  benchmark?: {            // 新規：下限・基準・上限の表示
    min?: string;
    mid?: string;
    max?: string;
  };
  subRight?: string;
  subRightClass?: string; // ← これを追加

  /** LUCK% 専用のリッチツールチップ用メタ（任意）
   *  これが与えられた行は、title属性ではなくカスタムツールチップを表示します。
   */
  luck?: {
    luckPct: number;                 // 0–100
    direction: "up" | "down" | "flat";
    rtpObs: number;                  // 観測RTP (%)
    rtpBase: number;                 // 基準RTP (%)
    deltaRtp_pp: number;             // 観測-基準 (pp)
    evPer1000G: number;              // 枚/1000G
    sigmaSpinUsed: number;           // 採用σ
    sigmaSourceLabel: string;        // manual / preset / estimated / default / fallback など
  };
};

type Props = {
  rows: ChartRow[];
  ariaLabel?: string;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(100, x));
}

/** 白 < 青 < 黄 < 緑 < 赤 */
function colorClass(pct: number) {
  const p = clamp01(pct);
  if (p === 0) return "hi-bar--white";
  if (p <= 25) return "hi-bar--blue";
  if (p <= 50) return "hi-bar--yellow";
  if (p <= 75) return "hi-bar--green";
  return "hi-bar--red";
}

/** LUCK方向の表示テキスト */
function dirLabel(d: "up" | "down" | "flat") {
  if (d === "up") return "↑（上振れ）";
  if (d === "down") return "↓（下振れ）";
  return "＝（概ね同等）";
}

/** LUCK行のみ：バー本体にホバー/フォーカスで出るツールチップを付与 */
function LuckBarWithTooltip({
  row,
  width,
  baseline,
}: {
  row: ChartRow;
  width: string;
  baseline: string;
}) {
  const l = row.luck!;
  const tooltipId = `hi-tip-${row.id}`;

  return (
    <div className="hi-barCol" role="group" aria-label={`${row.label} の指標`}>
      <div
        className="hi-tipRoot"
        tabIndex={0}
        aria-describedby={tooltipId}
      >
        <div className="hi-barTrack" aria-hidden="true">
          <div className="hi-barBaseline" style={{ left: baseline }} />
          <div
            className={`hi-bar ${colorClass(row.valuePct)}`}
            style={{ width }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamp01(row.valuePct))}
            aria-label={`${row.label} の現在値`}
          />
        </div>

        {/* リッチ・ツールチップ：hover/focus で表示（CSSは最低限のインラインを同梱） */}
        <div
          id={tooltipId}
          role="tooltip"
          className="hi-tipBubble"
        >
          <div className="hi-tipTitle">
            <b>LUCK%</b>: {l.luckPct.toFixed(1)}%
          </div>
          <div className="hi-tipRow">
            <b>方向:</b> {dirLabel(l.direction)}
          </div>
          <div className="hi-tipRow">
            <b>観測RTP:</b> {l.rtpObs.toFixed(1)}%　
            <b>基準:</b> {l.rtpBase.toFixed(1)}%
          </div>
          <div className="hi-tipRow">
            <b>差:</b> {l.deltaRtp_pp.toFixed(1)}pp　
            <b>EV:</b> {Math.round(l.evPer1000G)}枚/1000G
          </div>
          <div className="hi-tipRow">
            <b>σ採用:</b> {l.sigmaSpinUsed.toFixed(1)}（ソース: {l.sigmaSourceLabel}）
          </div>
          <div className="hi-tipNote">
            ※ LUCK%は「基準RTPとの差がどれだけレアか」を0–100で表現（大きいほど珍しい）
          </div>
        </div>
      </div>

      {/* 下：下限・基準・上限（中央だけの場合は baselineText をmidに） */}
      {(() => {
        const hasBench =
          !!(row.benchmark?.min || row.benchmark?.mid || row.benchmark?.max) ||
          !!row.baselineText;
        return hasBench ? (
          <div className="hi-benchRow">
            <span className="hi-benchItem hi-benchItem--left">
              {row.benchmark?.min ?? ""}
            </span>
            <span className="hi-benchItem hi-benchItem--mid">
              {row.benchmark?.mid ?? row.baselineText ?? ""}
            </span>
            <span className="hi-benchItem hi-benchItem--right">
              {row.benchmark?.max ?? ""}
            </span>
          </div>
        ) : null;
      })()}
    </div>
  );
}

export default function IndicatorChart({ rows, ariaLabel }: Props) {
  return (
    <div className="hi-chart-wrap" aria-label={ariaLabel}>
      {/* LUCKツールチップ用の最低限スタイル（他のCSSに吸収してOK） */}
      <style>{`
        .hi-tipRoot { position: relative; outline: none; }
        .hi-tipBubble {
          position: absolute;
          left: 50%;
          bottom: 100%;
          transform: translate(-50%, -8px);
          min-width: 240px;
          max-width: 320px;
          background: rgba(20,20,24,0.98);
          color: #fff;
          padding: 10px 12px;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          font-size: 12px;
          line-height: 1.5;
          pointer-events: none;
          opacity: 0;
          transition: opacity .12s ease, transform .12s ease;
          z-index: 20;
        }
        .hi-tipRoot:hover .hi-tipBubble,
        .hi-tipRoot:focus .hi-tipBubble {
          opacity: 1;
          transform: translate(-50%, -12px);
          pointer-events: auto;
        }
        .hi-tipTitle { font-size: 13px; margin-bottom: 4px; }
        .hi-tipRow { display: flex; gap: .5em; margin: 2px 0; }
        .hi-tipNote { opacity: .75; margin-top: 6px; }
      `}</style>

      <div className="hi-chart">
        {rows.map((r) => {
          const width = `${clamp01(r.valuePct)}%`;
          const baseline = `${clamp01(r.baselinePct ?? 50)}%`;
          const hasBench =
            !!(r.benchmark?.min || r.benchmark?.mid || r.benchmark?.max) ||
            !!r.baselineText;

          const isLuckRich = !!r.luck;

          return (
            <div key={r.id} className="hi-row" title={isLuckRich ? undefined : r.title}>
              {/* 左：ラベル */}
              <div className="hi-cell hi-label" aria-hidden="true">
                {r.label}
              </div>

              {/* 中央：バー + 目盛 */}
              {isLuckRich ? (
                <LuckBarWithTooltip row={r} width={width} baseline={baseline} />
              ) : (
                <div className="hi-cell hi-barCol" role="group" aria-label={`${r.label} の指標`}>
                  <div className="hi-barTrack" aria-hidden="true">
                    <div className="hi-barBaseline" style={{ left: baseline }} />
                    <div
                      className={`hi-bar ${colorClass(r.valuePct)}`}
                      style={{ width }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(clamp01(r.valuePct))}
                      aria-label={`${r.label} の現在値`}
                    />
                  </div>

                  {/* 下：下限・基準・上限（中央だけの場合は baselineText をmidに） */}
                  {hasBench ? (
                    <div className="hi-benchRow">
                      <span className="hi-benchItem hi-benchItem--left">
                        {r.benchmark?.min ?? ""}
                      </span>
                      <span className="hi-benchItem hi-benchItem--mid">
                        {r.benchmark?.mid ?? r.baselineText ?? ""}
                      </span>
                      <span className="hi-benchItem hi-benchItem--right">
                        {r.benchmark?.max ?? ""}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* 右・値 */}
              <div className="hi-cell hi-value" aria-hidden="true">
                {r.display}
                {r.subRight && (
                  <div className={`hi-sub hi-sub--right ${r.subRightClass ?? ""}`}>
                     {r.subRight}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
