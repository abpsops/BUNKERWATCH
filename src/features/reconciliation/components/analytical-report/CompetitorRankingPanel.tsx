import React from 'react';
import { CompetitorBreakdown, ReconciliationSummary } from '../../types';
import { Award } from 'lucide-react';

interface CompetitorRankingPanelProps {
  competitorBreakdown: CompetitorBreakdown[];
  maxCompQty: number;
  activeSummary: ReconciliationSummary;
  compLossRate: number;
}

export const CompetitorRankingPanel: React.FC<CompetitorRankingPanelProps> = ({
  competitorBreakdown,
  maxCompQty,
  activeSummary,
  compLossRate
}) => {
  const topCompetitor = competitorBreakdown.length > 0 ? competitorBreakdown[0] : null;

  return (
    <div className="lg:col-span-7 glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-ink-700">
        <div className="flex items-center space-x-2">
          <Award className="w-4 h-4 text-amber-700" />
          <h3 className="text-xs font-bold text-paper-100">
            Competitor Infiltration &amp; Market Share Ranking
          </h3>
        </div>
        <span className="text-[10px] text-amber-700 font-mono font-semibold">
          Total Lost: {activeSummary.competitorMatchedQty.toLocaleString()} MT ({compLossRate}%)
        </span>
      </div>

      {competitorBreakdown.length === 0 ? (
        <div className="py-12 text-center text-xs text-paper-500 italic">
          No competitor matched enquiries recorded in this dataset.
        </div>
      ) : (
        <div className="space-y-3.5 py-3">
          {competitorBreakdown.map((comp, idx) => {
            const barWidth = Math.max(8, Math.round((comp.totalEnquiryQty / maxCompQty) * 100));
            const shareOfLoss = activeSummary.competitorMatchedQty > 0
              ? Math.round((comp.totalEnquiryQty / activeSummary.competitorMatchedQty) * 1000) / 10
              : 0;

            return (
              <div key={comp.competitor} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                      idx === 0
                        ? 'bg-amber-500 text-paper-100 font-semibold'
                        : idx === 1
                        ? 'bg-amber-500/30 text-amber-300'
                        : 'bg-ink-800 text-paper-500'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-paper-100 truncate max-w-[200px] sm:max-w-[260px]">
                      {comp.competitor}
                    </span>
                    {comp.barges.length > 0 && (
                      <span className="text-[10px] text-paper-500 hidden md:inline">
                        via {comp.barges.slice(0, 2).join(', ')}{comp.barges.length > 2 ? ` (+${comp.barges.length - 2})` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 font-mono">
                    <span className="font-bold text-amber-700 text-xs">
                      {comp.totalEnquiryQty.toLocaleString()} MT
                    </span>
                    <span className="text-paper-500 text-[11px] font-normal">
                      ({shareOfLoss}% of lost volume)
                    </span>
                  </div>
                </div>

                <div className="h-4 bg-ink-900 rounded-lg overflow-hidden flex items-center p-0.5 border border-ink-700">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 rounded transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-3 border-t border-ink-700 text-[11px] text-paper-500 flex items-center justify-between">
        <span>Primary Competitor Threat:</span>
        <span className="text-amber-700 font-bold font-mono">
          {topCompetitor
            ? `${topCompetitor.competitor} (${topCompetitor.totalEnquiryQty.toLocaleString()} MT · ${topCompetitor.vesselCount} stems)`
            : 'None'}
        </span>
      </div>
    </div>
  );
};
