import React, { useState, useMemo } from 'react';
import { ReconciledRecord, PeriodSummary } from '../../types';
import { calculatePeriodSummaries } from '../../utils/engine';
import { TrendingUp, Calendar } from 'lucide-react';

interface PeriodTimelineChartProps {
  records: ReconciledRecord[];
}

type TimelineMode = 'daily' | 'weekly' | 'monthly';

export const PeriodTimelineChart: React.FC<PeriodTimelineChartProps> = ({ records }) => {
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('weekly');
  const [hoveredPeriodKey, setHoveredPeriodKey] = useState<string | null>(null);

  const periodSummaries: PeriodSummary[] = useMemo(
    () => calculatePeriodSummaries(records, timelineMode),
    [records, timelineMode]
  );

  return (
    <div className="glass rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-ink-700 gap-3">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-emerald-700" />
          <h3 className="text-xs font-bold text-paper-100">
            Chronological Reconciliation Evolution (
            {timelineMode === 'daily' ? 'Daily' : timelineMode === 'weekly' ? 'Weekly' : 'Monthly'} Timeline)
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-paper-500 font-mono hidden sm:inline">Grouping:</span>
          <div className="inline-flex bg-ink-900 p-1 rounded-lg border border-ink-700 text-xs font-semibold">
            <button
              onClick={() => setTimelineMode('daily')}
              className={`px-3 py-1 rounded transition ${
                timelineMode === 'daily' ? 'bg-blue-600 text-white shadow-sm' : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTimelineMode('weekly')}
              className={`px-3 py-1 rounded transition ${
                timelineMode === 'weekly' ? 'bg-blue-600 text-white shadow-sm' : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setTimelineMode('monthly')}
              className={`px-3 py-1 rounded transition ${
                timelineMode === 'monthly' ? 'bg-blue-600 text-white shadow-sm' : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* Multi-series stacked timeline bars */}
      <div className="space-y-3.5">
        {periodSummaries.length === 0 ? (
          <div className="text-xs text-paper-500 py-8 text-center italic">No period records available</div>
        ) : (
          periodSummaries.map((p) => {
            const gpsPct = p.totalEnquiryQty > 0 ? (p.gpsMatchedQty / p.totalEnquiryQty) * 100 : 0;
            const compPct = p.totalEnquiryQty > 0 ? (p.competitorMatchedQty / p.totalEnquiryQty) * 100 : 0;
            const unvPct = p.totalEnquiryQty > 0 ? (p.unverifiedQty / p.totalEnquiryQty) * 100 : 0;

            return (
              <div
                key={p.periodKey}
                onMouseEnter={() => setHoveredPeriodKey(p.periodKey)}
                onMouseLeave={() => setHoveredPeriodKey(null)}
                className={`p-3.5 rounded-lg border transition-all ${
                  hoveredPeriodKey === p.periodKey
                    ? 'bg-white border-blue-500 shadow-md'
                    : 'bg-ink-900 border-ink-700 hover:border-ink-600'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-700" />
                    <span className="font-bold text-paper-100 font-mono text-sm">{p.periodLabel}</span>
                    <span className="text-[11px] text-paper-500 font-mono">({p.enquiryCount} enquiries)</span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono text-[11px]">
                    <span className="text-paper-300">
                      Demand: <strong className="text-paper-100">{p.totalEnquiryQty.toLocaleString()} MT</strong>
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      GPS: {p.gpsMatchedQty.toLocaleString()} MT ({Math.round(gpsPct)}%)
                    </span>
                    <span className="text-amber-700 font-semibold">
                      Comp: {p.competitorMatchedQty.toLocaleString()} MT ({Math.round(compPct)}%)
                    </span>
                    <span className="text-paper-500">
                      Unv: {p.unverifiedQty.toLocaleString()} MT ({Math.round(unvPct)}%)
                    </span>
                  </div>
                </div>

                {/* Multi-series stacked progress bar with proportional width */}
                <div className="space-y-1">
                  <div className="h-5 bg-white rounded overflow-hidden flex border border-ink-700 p-0.5">
                    {p.gpsMatchedQty > 0 && (
                      <div
                        className="bg-emerald-500 h-full rounded-l transition-all duration-500 flex items-center justify-center text-[10px] text-paper-100 font-bold font-mono"
                        style={{ width: `${gpsPct}%` }}
                        title={`GPS Matched: ${p.gpsMatchedQty} MT (${Math.round(gpsPct)}%)`}
                      >
                        {gpsPct > 12 && `${p.gpsMatchedQty.toLocaleString()} MT`}
                      </div>
                    )}
                    {p.competitorMatchedQty > 0 && (
                      <div
                        className="bg-amber-500 h-full transition-all duration-500 flex items-center justify-center text-[10px] text-paper-100 font-bold font-mono"
                        style={{ width: `${compPct}%` }}
                        title={`Competitor Matched: ${p.competitorMatchedQty} MT (${Math.round(compPct)}%)`}
                      >
                        {compPct > 12 && `${p.competitorMatchedQty.toLocaleString()} MT`}
                      </div>
                    )}
                    {p.unverifiedQty > 0 && (
                      <div
                        className="bg-ink-600 h-full rounded-r transition-all duration-500 flex items-center justify-center text-[10px] text-paper-100 font-bold font-mono"
                        style={{ width: `${unvPct}%` }}
                        title={`Unverified: ${p.unverifiedQty} MT (${Math.round(unvPct)}%)`}
                      >
                        {unvPct > 12 && `${p.unverifiedQty.toLocaleString()} MT`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
