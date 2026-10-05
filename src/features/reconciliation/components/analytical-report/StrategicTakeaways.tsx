import React from 'react';
import { ReconciliationSummary, CompetitorBreakdown } from '../../types';
import { Zap, CheckCircle2, UserX, Compass } from 'lucide-react';

interface StrategicTakeawaysProps {
  summary: ReconciliationSummary;
  gpsWinRate: number;
  compLossRate: number;
  deliveryAccuracyPct: number;
  vlsfoShare: number;
  mgoShare: number;
  gpsVlsfoWinRate: number;
  gpsMgoWinRate: number;
  topCompetitor: CompetitorBreakdown | null;
}

export const StrategicTakeaways: React.FC<StrategicTakeawaysProps> = ({
  summary,
  gpsWinRate,
  compLossRate,
  deliveryAccuracyPct,
  vlsfoShare,
  mgoShare,
  gpsVlsfoWinRate,
  gpsMgoWinRate,
  topCompetitor
}) => {
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm text-xs space-y-3">
      <div className="flex items-center space-x-2 text-blue-700 font-bold text-xs">
        <Zap className="w-4 h-4" />
        <span>Strategic Executive Takeaways &amp; Operational Insights</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-paper-300">
        <div className="p-3 bg-ink-900 rounded-lg border border-ink-700 space-y-1">
          <span className="font-bold text-paper-100 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>GPS Performance Rating</span>
          </span>
          <p className="text-paper-500 text-[11px] leading-relaxed">
            GPS successfully captured <strong className="text-emerald-700">{summary.gpsMatchedQty.toLocaleString()} MT</strong>{' '}
            ({gpsWinRate}% of total requested volume) with a delivery fulfillment accuracy of{' '}
            <strong className="text-teal-700">{deliveryAccuracyPct}%</strong> across {summary.gpsMatchedCount} stems.
          </p>
        </div>

        <div className="p-3 bg-ink-900 rounded-lg border border-ink-700 space-y-1">
          <span className="font-bold text-paper-100 flex items-center space-x-1.5">
            <UserX className="w-3.5 h-3.5 text-amber-700" />
            <span>Competitor Infiltration</span>
          </span>
          <p className="text-paper-500 text-[11px] leading-relaxed">
            Competitors captured <strong className="text-amber-700">{summary.competitorMatchedQty.toLocaleString()} MT</strong>{' '}
            ({compLossRate}% of market volume). Key competitor threat is{' '}
            <strong className="text-paper-100">{topCompetitor ? topCompetitor.competitor : 'N/A'}</strong> holding the largest
            share of lost stems.
          </p>
        </div>

        <div className="p-3 bg-ink-900 rounded-lg border border-ink-700 space-y-1">
          <span className="font-bold text-paper-100 flex items-center space-x-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-700" />
            <span>Fuel Demand &amp; Capture Dynamics</span>
          </span>
          <p className="text-paper-500 text-[11px] leading-relaxed">
            Demand was split <strong className="text-blue-700">{vlsfoShare}% VLSFO</strong> and{' '}
            <strong className="text-cyan-700">{mgoShare}% MGO</strong>. GPS secured{' '}
            <strong className="text-emerald-700">{gpsVlsfoWinRate}%</strong> of VLSFO demand and{' '}
            <strong className="text-cyan-700">{gpsMgoWinRate}%</strong> of MGO demand.
          </p>
        </div>
      </div>
    </div>
  );
};
