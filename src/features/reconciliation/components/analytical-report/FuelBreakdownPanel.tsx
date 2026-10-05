import React from 'react';
import { ReconciliationSummary } from '../../types';
import { Fuel } from 'lucide-react';

interface FuelBreakdownPanelProps {
  summary: ReconciliationSummary;
  vlsfoShare: number;
  mgoShare: number;
  gpsVlsfoWinRate: number;
  gpsMgoWinRate: number;
  totalGpsDeliveredMT: number;
  totalGpsVlsfoDeliveredMT: number;
  totalGpsMgoDeliveredMT: number;
  netGpsVarianceMT: number;
}

export const FuelBreakdownPanel: React.FC<FuelBreakdownPanelProps> = ({
  summary,
  vlsfoShare,
  mgoShare,
  gpsVlsfoWinRate,
  gpsMgoWinRate,
  totalGpsDeliveredMT,
  totalGpsVlsfoDeliveredMT,
  totalGpsMgoDeliveredMT,
  netGpsVarianceMT
}) => {
  return (
    <div className="lg:col-span-7 glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-ink-700">
        <div className="flex items-center space-x-2">
          <Fuel className="w-4 h-4 text-blue-700" />
          <h3 className="text-xs font-bold text-paper-100">
            Fuel Specification Analysis: VLSFO vs MGO (Enquiry vs Actual GPS Supplied)
          </h3>
        </div>
        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="flex items-center space-x-1.5 text-blue-700">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            <span>VLSFO ({summary.totalVlsfoQty.toLocaleString()} MT)</span>
          </span>
          <span className="flex items-center space-x-1.5 text-cyan-700">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
            <span>MGO ({summary.totalMgoQty.toLocaleString()} MT)</span>
          </span>
        </div>
      </div>

      <div className="py-3 space-y-4">
        {/* Total Demand Stacked Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-paper-100">1. Total Enquiry Demand Split</span>
            <span className="font-mono text-paper-300 font-bold">
              {summary.totalEnquiryQty.toLocaleString()} MT (VLSFO: {vlsfoShare}% | MGO: {mgoShare}%)
            </span>
          </div>
          <div className="h-6 bg-ink-900 rounded-lg overflow-hidden flex border border-ink-700 p-0.5">
            <div
              className="bg-blue-600 h-full rounded-l flex items-center px-2 text-[10px] text-white font-mono font-bold transition-all duration-500"
              style={{ width: `${vlsfoShare}%` }}
              title={`VLSFO: ${summary.totalVlsfoQty.toLocaleString()} MT`}
            >
              {vlsfoShare > 14 && `VLSFO: ${summary.totalVlsfoQty.toLocaleString()} MT (${vlsfoShare}%)`}
            </div>
            <div
              className="bg-cyan-500 h-full rounded-r flex items-center px-2 text-[10px] text-paper-100 font-mono font-bold transition-all duration-500"
              style={{ width: `${mgoShare}%` }}
              title={`MGO: ${summary.totalMgoQty.toLocaleString()} MT`}
            >
              {mgoShare > 14 && `MGO: ${summary.totalMgoQty.toLocaleString()} MT (${mgoShare}%)`}
            </div>
          </div>
        </div>

        {/* GPS Won Split vs Actual Supply */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-emerald-700">2. GPS Matched (Enquiry Volume Won)</span>
              <span className="text-[10px] text-paper-500 font-mono">
                VLSFO Win: <strong className="text-emerald-700">{gpsVlsfoWinRate}%</strong> &bull; MGO Win: <strong className="text-cyan-700">{gpsMgoWinRate}%</strong>
              </span>
            </div>
            <span className="font-mono text-emerald-700 font-bold">
              {summary.gpsMatchedQty.toLocaleString()} MT
            </span>
          </div>
          <div className="h-6 bg-ink-900 rounded-lg overflow-hidden flex border border-ink-700 p-0.5">
            {summary.gpsMatchedQty > 0 ? (
              <>
                <div
                  className="bg-emerald-600 h-full rounded-l flex items-center px-2 text-[10px] text-white font-mono font-bold transition-all duration-500"
                  style={{ width: `${(summary.gpsMatchedVlsfoQty / summary.gpsMatchedQty) * 100}%` }}
                  title={`GPS VLSFO: ${summary.gpsMatchedVlsfoQty.toLocaleString()} MT`}
                >
                  {summary.gpsMatchedVlsfoQty > 0 && `VLSFO: ${summary.gpsMatchedVlsfoQty.toLocaleString()} MT`}
                </div>
                <div
                  className="bg-teal-400 h-full rounded-r flex items-center px-2 text-[10px] text-paper-100 font-mono font-bold transition-all duration-500"
                  style={{ width: `${(summary.gpsMatchedMgoQty / summary.gpsMatchedQty) * 100}%` }}
                  title={`GPS MGO: ${summary.gpsMatchedMgoQty.toLocaleString()} MT`}
                >
                  {summary.gpsMatchedMgoQty > 0 && `MGO: ${summary.gpsMatchedMgoQty.toLocaleString()} MT`}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-paper-500 italic text-xs py-0.5">No GPS matches</div>
            )}
          </div>
        </div>

        {/* Actual GPS Supplied Delivered (From GPS/FLOW log) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-teal-700">3. Actual FLOW Delivery (Supplied Mass)</span>
              <span className="text-[10px] text-paper-500 font-mono">
                Net variance:{' '}
                <strong className={netGpsVarianceMT >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {netGpsVarianceMT >= 0 ? `+${netGpsVarianceMT}` : netGpsVarianceMT} MT
                </strong>
              </span>
            </div>
            <span className="font-mono text-teal-700 font-bold">
              {totalGpsDeliveredMT.toLocaleString()} MT
            </span>
          </div>
          <div className="h-6 bg-ink-900 rounded-lg overflow-hidden flex border border-teal-200 p-0.5">
            {totalGpsDeliveredMT > 0 ? (
              <>
                <div
                  className="bg-teal-600 h-full rounded-l flex items-center px-2 text-[10px] text-white font-mono font-bold transition-all duration-500"
                  style={{
                    width: `${totalGpsDeliveredMT > 0 ? (totalGpsVlsfoDeliveredMT / totalGpsDeliveredMT) * 100 : 0}%`
                  }}
                  title={`Actual VLSFO Supplied: ${totalGpsVlsfoDeliveredMT.toLocaleString()} MT`}
                >
                  {totalGpsVlsfoDeliveredMT > 0 && `VLSFO: ${totalGpsVlsfoDeliveredMT.toLocaleString()} MT`}
                </div>
                <div
                  className="bg-cyan-400 h-full rounded-r flex items-center px-2 text-[10px] text-paper-100 font-mono font-bold transition-all duration-500"
                  style={{
                    width: `${totalGpsDeliveredMT > 0 ? (totalGpsMgoDeliveredMT / totalGpsDeliveredMT) * 100 : 0}%`
                  }}
                  title={`Actual MGO Supplied: ${totalGpsMgoDeliveredMT.toLocaleString()} MT`}
                >
                  {totalGpsMgoDeliveredMT > 0 && `MGO: ${totalGpsMgoDeliveredMT.toLocaleString()} MT`}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-paper-500 italic text-xs py-0.5">No actual supply rows</div>
            )}
          </div>
        </div>

        {/* Competitor Split */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-700">4. Competitor Captured Split</span>
            <span className="font-mono text-amber-700 font-bold">
              {summary.competitorMatchedQty.toLocaleString()} MT
            </span>
          </div>
          <div className="h-6 bg-ink-900 rounded-lg overflow-hidden flex border border-ink-700 p-0.5">
            {summary.competitorMatchedQty > 0 ? (
              <>
                <div
                  className="bg-amber-600 h-full rounded-l flex items-center px-2 text-[10px] text-white font-mono font-bold transition-all duration-500"
                  style={{ width: `${(summary.competitorMatchedVlsfoQty / summary.competitorMatchedQty) * 100}%` }}
                >
                  {summary.competitorMatchedVlsfoQty > 0 && `VLSFO: ${summary.competitorMatchedVlsfoQty.toLocaleString()} MT`}
                </div>
                <div
                  className="bg-amber-400 h-full rounded-r flex items-center px-2 text-[10px] text-paper-100 font-mono font-bold transition-all duration-500"
                  style={{ width: `${(summary.competitorMatchedMgoQty / summary.competitorMatchedQty) * 100}%` }}
                >
                  {summary.competitorMatchedMgoQty > 0 && `MGO: ${summary.competitorMatchedMgoQty.toLocaleString()} MT`}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-paper-500 italic text-xs py-0.5">No competitor captures</div>
            )}
          </div>
        </div>
      </div>

      {/* Direct Comparative Fuel KPI Pills */}
      <div className="pt-3 border-t border-ink-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <div className="bg-ink-900 p-2 rounded-lg border border-ink-700">
          <span className="text-paper-500 block text-[10px]">VLSFO Demand</span>
          <span className="font-bold text-blue-700 text-xs">{summary.totalVlsfoQty.toLocaleString()} MT</span>
        </div>
        <div className="bg-ink-900 p-2 rounded-lg border border-ink-700">
          <span className="text-paper-500 block text-[10px]">MGO Demand</span>
          <span className="font-bold text-cyan-700 text-xs">{summary.totalMgoQty.toLocaleString()} MT</span>
        </div>
        <div className="bg-ink-900 p-2 rounded-lg border border-emerald-200">
          <span className="text-emerald-700 block text-[10px]">GPS VLSFO Won</span>
          <span className="font-bold text-emerald-700 text-xs">
            {summary.gpsMatchedVlsfoQty.toLocaleString()} MT ({gpsVlsfoWinRate}%)
          </span>
        </div>
        <div className="bg-ink-900 p-2 rounded-lg border border-teal-200">
          <span className="text-cyan-700 block text-[10px]">GPS MGO Won</span>
          <span className="font-bold text-cyan-700 text-xs">
            {summary.gpsMatchedMgoQty.toLocaleString()} MT ({gpsMgoWinRate}%)
          </span>
        </div>
      </div>
    </div>
  );
};
