import React from 'react';
import { ReconciliationSummary } from '../types';
import { Ship, CheckCircle2, UserX, HelpCircle, ArrowRight, Fuel } from 'lucide-react';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => {
  const gpsQtyPct = summary.totalEnquiryQty > 0
    ? Math.round((summary.gpsMatchedQty / summary.totalEnquiryQty) * 100)
    : 0;
  const compQtyPct = summary.totalEnquiryQty > 0
    ? Math.round((summary.competitorMatchedQty / summary.totalEnquiryQty) * 100)
    : 0;
  const unverifiedQtyPct = summary.totalEnquiryQty > 0
    ? Math.round((summary.unverifiedQty / summary.totalEnquiryQty) * 100)
    : 0;

  return (
    <div className="space-y-4 mb-6">
      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL ENQUIRIES */}
        <div className="glass rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Ship className="w-16 h-16 text-blue-700" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-paper-500">
                Total enquiries
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 border border-blue-500/20">
                {summary.totalEnquiries} records
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-semibold text-paper-100 tracking-tight">
                {summary.totalEnquiryQty.toLocaleString()} <span className="text-sm font-semibold text-paper-500">MT</span>
              </div>
              <div className="text-xs text-paper-500 mt-0.5">
                Total Requested Quantity
              </div>
            </div>
          </div>

          {/* Separate VLSFO and MGO breakdown */}
          <div className="mt-3 pt-2.5 border-t border-ink-700 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1 text-blue-700">
              <span className="text-paper-500 font-sans font-medium">VLSFO:</span>
              <span className="font-bold">{summary.totalVlsfoQty.toLocaleString()} MT</span>
            </div>
            <div className="flex items-center space-x-1 text-cyan-700">
              <span className="text-paper-500 font-sans font-medium">MGO:</span>
              <span className="font-bold">{summary.totalMgoQty.toLocaleString()} MT</span>
            </div>
          </div>
        </div>

        {/* 2. GPS MATCHED */}
        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <CheckCircle2 className="w-16 h-16 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700">
                GPS matched
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                {summary.gpsMatchedCount} matched
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-semibold text-emerald-700 tracking-tight">
                {summary.gpsMatchedQty.toLocaleString()} <span className="text-sm font-semibold text-emerald-700">MT</span>
              </div>
              <div className="text-xs text-paper-500 mt-0.5 flex items-center justify-between">
                <span>FLOW / GPS Nearest Match</span>
                <span className="font-mono text-emerald-700 font-semibold">{gpsQtyPct}% of Total</span>
              </div>
            </div>
          </div>

          {/* Separate VLSFO and MGO breakdown */}
          <div className="mt-3 pt-2.5 border-t border-ink-700 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1 text-emerald-700">
              <span className="text-paper-500 font-sans font-medium">VLSFO:</span>
              <span className="font-bold">{summary.gpsMatchedVlsfoQty.toLocaleString()} MT</span>
            </div>
            <div className="flex items-center space-x-1 text-cyan-700">
              <span className="text-paper-500 font-sans font-medium">MGO:</span>
              <span className="font-bold">{summary.gpsMatchedMgoQty.toLocaleString()} MT</span>
            </div>
          </div>
        </div>

        {/* 3. COMPETITOR MATCHED */}
        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <UserX className="w-16 h-16 text-amber-700" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700">
                Competitor matched
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
                {summary.competitorMatchedCount} matched
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-semibold text-amber-700 tracking-tight">
                {summary.competitorMatchedQty.toLocaleString()} <span className="text-sm font-semibold text-amber-700">MT</span>
              </div>
              <div className="text-xs text-paper-500 mt-0.5 flex items-center justify-between">
                <span>STS Bunkering Verified</span>
                <span className="font-mono text-amber-700 font-semibold">{compQtyPct}% of Total</span>
              </div>
            </div>
          </div>

          {/* Separate VLSFO and MGO breakdown */}
          <div className="mt-3 pt-2.5 border-t border-ink-700 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1 text-amber-700">
              <span className="text-paper-500 font-sans font-medium">VLSFO:</span>
              <span className="font-bold">{summary.competitorMatchedVlsfoQty.toLocaleString()} MT</span>
            </div>
            <div className="flex items-center space-x-1 text-cyan-700">
              <span className="text-paper-500 font-sans font-medium">MGO:</span>
              <span className="font-bold">{summary.competitorMatchedMgoQty.toLocaleString()} MT</span>
            </div>
          </div>
        </div>

        {/* 4. UNVERIFIED */}
        <div className="bg-white border border-ink-600 rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <HelpCircle className="w-16 h-16 text-paper-500" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-paper-300">
                Unverified
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-ink-700/40 text-paper-300 border border-ink-600">
                {summary.unverifiedCount} unverified
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl sm:text-3xl font-semibold text-paper-100 tracking-tight">
                {summary.unverifiedQty.toLocaleString()} <span className="text-sm font-semibold text-paper-500">MT</span>
              </div>
              <div className="text-xs text-paper-500 mt-0.5 flex items-center justify-between">
                <span>No Confirmed Supply Match</span>
                <span className="font-mono text-paper-300 font-semibold">{unverifiedQtyPct}% of Total</span>
              </div>
            </div>
          </div>

          {/* Separate VLSFO and MGO breakdown */}
          <div className="mt-3 pt-2.5 border-t border-ink-700 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1 text-paper-300">
              <span className="text-paper-500 font-sans font-medium">VLSFO:</span>
              <span className="font-bold">{summary.unverifiedVlsfoQty.toLocaleString()} MT</span>
            </div>
            <div className="flex items-center space-x-1 text-cyan-700">
              <span className="text-paper-500 font-sans font-medium">MGO:</span>
              <span className="font-bold">{summary.unverifiedMgoQty.toLocaleString()} MT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fuel Specification Breakdown Strip */}
      <div className="glass rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <Fuel className="w-4 h-4 text-blue-700" />
          <span className="font-bold text-paper-100 text-[11px]">
            Enquiry Fuel Totals (Separate Specifications):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <div className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-paper-300 font-sans font-medium">Total VLSFO:</span>
            <span className="font-bold text-paper-100">{summary.totalVlsfoQty.toLocaleString()} MT</span>
          </div>

          <div className="px-2.5 py-1 rounded bg-cyan-50 border border-cyan-200 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-paper-300 font-sans font-medium">Total LSMGO / MGO:</span>
            <span className="font-bold text-paper-100">{summary.totalMgoQty.toLocaleString()} MT</span>
          </div>

          {summary.totalHsfoQty > 0 && (
            <div className="px-2.5 py-1 rounded bg-purple-50 border border-purple-200 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-paper-300 font-sans font-medium">Total HSFO:</span>
              <span className="font-bold text-paper-100">{summary.totalHsfoQty.toLocaleString()} MT</span>
            </div>
          )}

          <div className="px-2.5 py-1 rounded bg-ink-900 border border-ink-600 flex items-center space-x-1.5">
            <span className="text-paper-500 font-sans font-medium">Grand Total:</span>
            <span className="font-bold text-emerald-700">{summary.totalEnquiryQty.toLocaleString()} MT</span>
          </div>
        </div>
      </div>

      {/* Reconciliation Equation Strip */}
      <div className="bg-ink-900 border border-ink-700 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between text-xs text-paper-300 gap-2">
        <div className="flex items-center space-x-2 font-medium">
          <span className="text-paper-500">Reconciliation Flow:</span>
          <span className="text-paper-100 font-bold">{summary.totalEnquiryQty.toLocaleString()} MT</span>
          <ArrowRight className="w-3.5 h-3.5 text-paper-500 inline" />
          <span className="text-emerald-700 font-semibold">{summary.gpsMatchedQty.toLocaleString()} MT (GPS)</span>
          <span>+</span>
          <span className="text-amber-700 font-semibold">{summary.competitorMatchedQty.toLocaleString()} MT (Competitor)</span>
          <span>+</span>
          <span className="text-paper-300 font-semibold">{summary.unverifiedQty.toLocaleString()} MT (Unverified)</span>
        </div>

        {/* Visual Progress Ratio Bar */}
        <div className="w-full sm:w-64 h-2.5 bg-ink-800 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${gpsQtyPct}%` }}
            title={`GPS: ${gpsQtyPct}%`}
          />
          <div
            className="bg-amber-500 h-full transition-all"
            style={{ width: `${compQtyPct}%` }}
            title={`Competitor: ${compQtyPct}%`}
          />
          <div
            className="bg-ink-600 h-full transition-all"
            style={{ width: `${unverifiedQtyPct}%` }}
            title={`Unverified: ${unverifiedQtyPct}%`}
          />
        </div>
      </div>
    </div>
  );
};
