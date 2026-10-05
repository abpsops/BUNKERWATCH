import React from 'react';
import { ReconciledRecord, CompetitorBreakdown } from '../types';
import { calculateCompetitorBreakdown } from '../utils/engine';
import { UserX, Building2, Anchor } from 'lucide-react';

interface CompetitorInfoSectionProps {
  records: ReconciledRecord[];
}

export const CompetitorInfoSection: React.FC<CompetitorInfoSectionProps> = ({ records }) => {
  const competitorRecords = records.filter(r => r.status === 'COMPETITOR MATCHED');
  const competitorBreakdown: CompetitorBreakdown[] = calculateCompetitorBreakdown(records);

  if (competitorRecords.length === 0) {
    return null;
  }

  const totalCompEnquiryQty = competitorRecords.reduce((acc, r) => acc + r.enquiryQty, 0);

  return (
    <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-ink-700 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center">
            <UserX className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-paper-100">
              Competitor Matched Enquiries
            </h2>
            <p className="text-xs text-paper-500">
              Enquiries identified as handled by competitors via STS Bunkering report
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="text-paper-500">
            Total Matched: <span className="font-bold text-amber-700 font-mono">{competitorRecords.length}</span> vessels
          </span>
          <span className="text-paper-500">&bull;</span>
          <span className="text-paper-500">
            Total Volume: <span className="font-bold text-amber-700 font-mono">{totalCompEnquiryQty.toLocaleString()} MT</span>
          </span>
        </div>
      </div>

      {/* Competitor Summary Cards */}
      <div className="p-4 sm:p-5 border-b border-ink-700 bg-ink-900">
        <div className="text-[11px] font-bold text-paper-500 mb-3">
          Volume Breakdown by Competitor Company
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {competitorBreakdown.map((comp) => (
            <div
              key={comp.competitor}
              className="glass rounded-lg p-3 relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <span className="font-bold text-paper-100 text-xs truncate max-w-[160px]" title={comp.competitor}>
                  {comp.competitor}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-mono">
                  {comp.vesselCount} {comp.vesselCount === 1 ? 'vessel' : 'vessels'}
                </span>
              </div>
              <div className="mt-2 text-lg font-semibold text-amber-700 font-mono">
                {comp.totalEnquiryQty.toLocaleString()} <span className="text-xs text-paper-500">MT</span>
              </div>
              {comp.barges.length > 0 && (
                <div className="text-[10px] text-paper-500 mt-1 truncate" title={comp.barges.join(', ')}>
                  Barges: <span className="text-paper-300 font-mono">{comp.barges.join(', ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Competitor Matched Operations Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-900 border-b border-ink-700 text-paper-500 font-semibold text-[11px]">
            <tr>
              <th className="py-3 px-4">Vessel</th>
              <th className="py-3 px-4 text-right">Enquiry Qty (MT)</th>
              <th className="py-3 px-4">Competitor</th>
              <th className="py-3 px-4">Barge</th>
              <th className="py-3 px-4 text-right">Tracking Qty (MT)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 font-medium">
            {competitorRecords.map((r) => (
              <tr key={r.id} className="hover:bg-ink-800/40 transition">
                <td className="py-3 px-4 font-bold text-paper-100">
                  {r.vesselName}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                  {r.enquiryQty.toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center space-x-1.5 font-semibold text-paper-100">
                    <Building2 className="w-3 h-3 text-amber-700" />
                    <span>{r.competitor || 'Unknown Competitor'}</span>
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-paper-300">
                  <span className="inline-flex items-center space-x-1">
                    <Anchor className="w-3 h-3 text-paper-500" />
                    <span>{r.barge || '—'}</span>
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono">
                  {r.trackingQty !== null ? (
                    <span className="text-paper-300 font-semibold">{r.trackingQty.toLocaleString()}</span>
                  ) : (
                    <span className="text-paper-500 italic">Not reported</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
