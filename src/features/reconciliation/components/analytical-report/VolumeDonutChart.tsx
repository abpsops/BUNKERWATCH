import React, { useState } from 'react';
import { ReconciliationSummary } from '../../types';
import { CheckCircle2 } from 'lucide-react';

interface VolumeDonutChartProps {
  activeSummary: ReconciliationSummary;
  gpsWinRate: number;
  compLossRate: number;
  unvRate: number;
}

type DonutSegment = 'GPS' | 'COMPETITOR' | 'UNVERIFIED';

export const VolumeDonutChart: React.FC<VolumeDonutChartProps> = ({
  activeSummary,
  gpsWinRate,
  compLossRate,
  unvRate
}) => {
  const [activeDonutSegment, setActiveDonutSegment] = useState<DonutSegment | null>(null);

  const totalQty = activeSummary.totalEnquiryQty > 0 ? activeSummary.totalEnquiryQty : 1;
  const donutRadius = 70;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const strokeGps = (activeSummary.gpsMatchedQty / totalQty) * donutCircumference;
  const strokeComp = (activeSummary.competitorMatchedQty / totalQty) * donutCircumference;
  const strokeUnv = (activeSummary.unverifiedQty / totalQty) * donutCircumference;

  return (
    <div className="lg:col-span-5 glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-ink-700">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
          </svg>
          <h3 className="text-xs font-bold text-paper-100">
            Volume Allocation &amp; Win Rate
          </h3>
        </div>
        <span className="text-[11px] font-mono text-paper-500 font-semibold">
          Total: {activeSummary.totalEnquiryQty.toLocaleString()} MT
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-4">
        {/* SVG Donut with active segment hover interaction */}
        <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 180 180">
            {/* Background Ring */}
            <circle cx="90" cy="90" r={donutRadius} strokeWidth="22" fill="transparent" className="stroke-ink-700" />

            {/* GPS Matched Slice */}
            {activeSummary.gpsMatchedQty > 0 && (
              <circle
                cx="90"
                cy="90"
                r={donutRadius}
                stroke="#10b981"
                strokeWidth={activeDonutSegment === 'GPS' ? '28' : '22'}
                fill="transparent"
                strokeDasharray={`${strokeGps} ${donutCircumference}`}
                strokeDashoffset={0}
                className="transition-all duration-300 cursor-pointer hover:stroke-emerald-400"
                onMouseEnter={() => setActiveDonutSegment('GPS')}
                onMouseLeave={() => setActiveDonutSegment(null)}
              />
            )}

            {/* Competitor Matched Slice */}
            {activeSummary.competitorMatchedQty > 0 && (
              <circle
                cx="90"
                cy="90"
                r={donutRadius}
                stroke="#f59e0b"
                strokeWidth={activeDonutSegment === 'COMPETITOR' ? '28' : '22'}
                fill="transparent"
                strokeDasharray={`${strokeComp} ${donutCircumference}`}
                strokeDashoffset={-strokeGps}
                className="transition-all duration-300 cursor-pointer hover:stroke-amber-400"
                onMouseEnter={() => setActiveDonutSegment('COMPETITOR')}
                onMouseLeave={() => setActiveDonutSegment(null)}
              />
            )}

            {/* Unverified Slice */}
            {activeSummary.unverifiedQty > 0 && (
              <circle
                cx="90"
                cy="90"
                r={donutRadius}
                stroke="#64748b"
                strokeWidth={activeDonutSegment === 'UNVERIFIED' ? '28' : '22'}
                fill="transparent"
                strokeDasharray={`${strokeUnv} ${donutCircumference}`}
                strokeDashoffset={-(strokeGps + strokeComp)}
                className="transition-all duration-300 cursor-pointer hover:stroke-ink-500"
                onMouseEnter={() => setActiveDonutSegment('UNVERIFIED')}
                onMouseLeave={() => setActiveDonutSegment(null)}
              />
            )}
          </svg>

          {/* Dynamic Center Badge */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            {activeDonutSegment === 'GPS' ? (
              <>
                <span className="text-[10px] text-emerald-700 font-bold">GPS Won</span>
                <span className="text-lg font-semibold text-paper-100 font-mono">
                  {activeSummary.gpsMatchedQty.toLocaleString()} MT
                </span>
                <span className="text-[11px] text-emerald-700 font-bold font-mono">{gpsWinRate}% Share</span>
              </>
            ) : activeDonutSegment === 'COMPETITOR' ? (
              <>
                <span className="text-[10px] text-amber-700 font-bold">Competitor</span>
                <span className="text-lg font-semibold text-paper-100 font-mono">
                  {activeSummary.competitorMatchedQty.toLocaleString()} MT
                </span>
                <span className="text-[11px] text-amber-700 font-bold font-mono">{compLossRate}% Share</span>
              </>
            ) : activeDonutSegment === 'UNVERIFIED' ? (
              <>
                <span className="text-[10px] text-paper-500 font-bold">Unverified</span>
                <span className="text-lg font-semibold text-paper-100 font-mono">
                  {activeSummary.unverifiedQty.toLocaleString()} MT
                </span>
                <span className="text-[11px] text-paper-300 font-bold font-mono">{unvRate}% Share</span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-paper-500 font-semibold">Total Volume</span>
                <span className="text-lg font-semibold text-paper-100 font-mono">
                  {activeSummary.totalEnquiryQty.toLocaleString()}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold font-mono">{gpsWinRate}% Won</span>
              </>
            )}
          </div>
        </div>

        {/* Interactive Legend Cards */}
        <div className="w-full space-y-2 text-xs">
          <div
            className={`p-2.5 rounded-lg border transition cursor-pointer ${
              activeDonutSegment === 'GPS'
                ? 'bg-emerald-50 border-emerald-500 shadow-md'
                : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-50'
            }`}
            onMouseEnter={() => setActiveDonutSegment('GPS')}
            onMouseLeave={() => setActiveDonutSegment(null)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded bg-emerald-500 shrink-0" />
                <div>
                  <div className="font-bold text-emerald-700">GPS Supplied (Won)</div>
                  <div className="text-[10px] text-paper-500">{activeSummary.gpsMatchedCount} vessels matched</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-paper-100 text-xs">{activeSummary.gpsMatchedQty.toLocaleString()} MT</div>
                <div className="text-[11px] text-emerald-700 font-bold">{gpsWinRate}%</div>
              </div>
            </div>
          </div>

          <div
            className={`p-2.5 rounded-lg border transition cursor-pointer ${
              activeDonutSegment === 'COMPETITOR'
                ? 'bg-amber-50 border-amber-500 shadow-md'
                : 'bg-amber-50 border-amber-200 hover:bg-amber-50'
            }`}
            onMouseEnter={() => setActiveDonutSegment('COMPETITOR')}
            onMouseLeave={() => setActiveDonutSegment(null)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded bg-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-amber-700">Competitors Taken</div>
                  <div className="text-[10px] text-paper-500">{activeSummary.competitorMatchedCount} vessels matched</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-paper-100 text-xs">{activeSummary.competitorMatchedQty.toLocaleString()} MT</div>
                <div className="text-[11px] text-amber-700 font-bold">{compLossRate}%</div>
              </div>
            </div>
          </div>

          <div
            className={`p-2.5 rounded-lg border transition cursor-pointer ${
              activeDonutSegment === 'UNVERIFIED'
                ? 'bg-white border-ink-500 shadow-md'
                : 'bg-ink-900 border-ink-700 hover:bg-white'
            }`}
            onMouseEnter={() => setActiveDonutSegment('UNVERIFIED')}
            onMouseLeave={() => setActiveDonutSegment(null)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded bg-ink-500 shrink-0" />
                <div>
                  <div className="font-bold text-paper-300">Unverified / Pending</div>
                  <div className="text-[10px] text-paper-500">{activeSummary.unverifiedCount} enquiries open</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-paper-100 text-xs">{activeSummary.unverifiedQty.toLocaleString()} MT</div>
                <div className="text-[11px] text-paper-500 font-bold">{unvRate}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mathematical Reconciliation Integrity Seal */}
      <div className="pt-3 border-t border-ink-700 text-[11px] text-paper-500 flex items-center justify-between font-mono">
        <span className="flex items-center space-x-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          <span>Volume Balance Formula:</span>
        </span>
        <span className="text-paper-300">
          {activeSummary.gpsMatchedQty} + {activeSummary.competitorMatchedQty} + {activeSummary.unverifiedQty} = {activeSummary.totalEnquiryQty} MT
        </span>
      </div>
    </div>
  );
};
