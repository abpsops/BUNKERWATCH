import React from 'react';
import { ReconciledRecord } from '../../types';
import { Target } from 'lucide-react';

interface DeliveryVarianceSpectrumProps {
  gpsMatchedRecords: ReconciledRecord[];
  totalGpsDeliveredMT: number;
  totalGpsRequestedMT: number;
  netGpsVarianceMT: number;
  deliveryAccuracyPct: number;
}

export const DeliveryVarianceSpectrum: React.FC<DeliveryVarianceSpectrumProps> = ({
  gpsMatchedRecords,
  totalGpsDeliveredMT,
  totalGpsRequestedMT,
  netGpsVarianceMT,
  deliveryAccuracyPct
}) => {
  return (
    <div className="lg:col-span-5 glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-ink-700">
        <div className="flex items-center space-x-2">
          <Target className="w-4 h-4 text-emerald-700" />
          <h3 className="text-xs font-bold text-paper-100">
            GPS Delivery Accuracy &amp; Variance
          </h3>
        </div>
        <span className="text-[10px] font-mono text-emerald-700 font-bold">
          {deliveryAccuracyPct}% Fulfillment Accuracy
        </span>
      </div>

      <div className="py-2 space-y-3">
        {/* Accuracy Progress Meter */}
        <div className="p-3 bg-ink-900 rounded-lg border border-ink-700 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-paper-300">Requested vs Supplied Mass:</span>
            <span className="font-mono text-paper-100 font-bold">
              {totalGpsDeliveredMT.toLocaleString()} / {totalGpsRequestedMT.toLocaleString()} MT
            </span>
          </div>
          <div className="h-2.5 bg-white rounded-full overflow-hidden flex border border-ink-700">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, deliveryAccuracyPct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-paper-500 font-mono">
            <span>
              Net Variance:{' '}
              <strong className={netGpsVarianceMT >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                {netGpsVarianceMT >= 0 ? `+${netGpsVarianceMT}` : netGpsVarianceMT} MT
              </strong>
            </span>
            <span className="text-paper-300 font-semibold">{gpsMatchedRecords.length} Confirmed Stems</span>
          </div>
        </div>

        {/* Individual Vessel Variances Scroll List */}
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
          <div className="text-[10px] font-semibold text-paper-500">
            Vessel-Level Match Quantities:
          </div>
          {gpsMatchedRecords.length === 0 ? (
            <div className="text-xs text-paper-500 py-4 text-center italic">No GPS matched vessels</div>
          ) : (
            gpsMatchedRecords.slice(0, 7).map((rec) => (
              <div
                key={rec.id}
                className="p-2 rounded bg-ink-900 border border-ink-700 flex items-center justify-between font-mono text-[11px]"
              >
                <span className="font-sans font-bold text-paper-100 truncate max-w-[130px]" title={rec.vesselName}>
                  {rec.vesselName}
                </span>
                <div className="flex items-center space-x-2 text-right">
                  <span className="text-paper-500">Enq: {rec.enquiryQty}</span>
                  <span className="text-emerald-700 font-bold">GPS: {rec.gpsQty}</span>
                  {rec.matchDelta !== null && rec.matchDelta !== 0 ? (
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded font-bold ${
                        rec.matchDelta > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {rec.matchDelta > 0 ? `+${rec.matchDelta}` : rec.matchDelta}
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                      Exact
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-ink-700 text-[11px] text-paper-500 flex items-center justify-between font-mono">
        <span>Matching Algorithm:</span>
        <span className="text-emerald-700 font-semibold">Nearest Quantity Matching</span>
      </div>
    </div>
  );
};
