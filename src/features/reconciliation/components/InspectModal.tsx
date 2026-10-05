import React from 'react';
import { EnquiryRecord, GpsRecord, StsTrackingRecord } from '../types';
import { X, CheckCircle, Database } from 'lucide-react';

interface InspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'gps' | 'tracking' | 'enquiry' | null;
  gpsRecords: GpsRecord[];
  trackingRecords: StsTrackingRecord[];
  enquiryRecords: EnquiryRecord[];
}

export const InspectModal: React.FC<InspectModalProps> = ({
  isOpen,
  onClose,
  type,
  gpsRecords,
  trackingRecords,
  enquiryRecords
}) => {
  if (!isOpen || !type) return null;

  const getTitleAndData = () => {
    switch (type) {
      case 'gps':
        return {
          title: 'FLOW REPORT / GPS REPORT — PARSED RECORDS',
          subtitle: `${gpsRecords.length} records parsed (including secondary / actual supply section)`,
          headers: ['#', 'Vessel Name', 'Normalized Key', 'Barge', 'Quantity (MT)', 'Date', 'Source Section'],
          rows: gpsRecords.map((r, i) => [
            i + 1,
            r.vesselName,
            r.normalizedVessel,
            r.barge || '—',
            r.quantity ? `${r.quantity.toLocaleString()} MT` : '—',
            r.date || '—',
            r.sectionSource || 'Actual Supply'
          ])
        };
      case 'tracking':
        return {
          title: 'TRACKING REPORT / STS BUNKERING — PARSED RECORDS',
          subtitle: `${trackingRecords.length} operations parsed`,
          headers: ['#', 'Vessel Name', 'Normalized Key', 'Barge', 'Competitor / Company', 'Quantity (MT)', 'Date'],
          rows: trackingRecords.map((r, i) => [
            i + 1,
            r.vesselName,
            r.normalizedVessel,
            r.barge || '—',
            r.competitor || '—',
            r.quantity ? `${r.quantity.toLocaleString()} MT` : '—',
            r.date || '—'
          ])
        };
      case 'enquiry':
        return {
          title: 'ENQUIRY REPORT / ENQUIRY DATA — PARSED RECORDS',
          subtitle: `${enquiryRecords.length} enquiries parsed (with VLSFO & MGO separation)`,
          headers: ['#', 'Date', 'Vessel Name', 'Fuel 1', 'Qty 1', 'Fuel 2', 'Qty 2', 'Fuel 3', 'Qty 3', 'VLSFO (MT)', 'MGO (MT)', 'Total Enquiry Qty (MT)'],
          rows: enquiryRecords.map((r, i) => [
            i + 1,
            r.date || '—',
            r.vesselName,
            r.fuelGrade1 || '—',
            r.qty1 > 0 ? r.qty1.toLocaleString() : '—',
            r.fuelGrade2 || '—',
            r.qty2 > 0 ? r.qty2.toLocaleString() : '—',
            r.fuelGrade3 || '—',
            r.qty3 > 0 ? r.qty3.toLocaleString() : '—',
            r.vlsfoQty > 0 ? `${r.vlsfoQty.toLocaleString()} MT` : '—',
            r.mgoQty > 0 ? `${r.mgoQty.toLocaleString()} MT` : '—',
            `${r.totalEnquiryQty.toLocaleString()} MT`
          ])
        };
    }
  };

  const { title, subtitle, headers, rows } = getTitleAndData();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm">
      <div className="glass rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ink-700 flex items-center justify-between bg-ink-900">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-700 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-paper-100">
                {title}
              </h2>
              <p className="text-xs text-paper-500">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-paper-500 hover:text-paper-100 p-1 rounded-md hover:bg-ink-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Content */}
        <div className="p-4 overflow-auto flex-1 text-xs">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-paper-500 italic">
              No records parsed for this report.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-ink-900 border-b border-ink-700 text-paper-500 font-semibold text-[11px] sticky top-0">
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700 font-mono text-[11px]">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-ink-800/40 transition">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2 px-3 text-paper-300 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-ink-700 bg-ink-900 flex items-center justify-between text-xs text-paper-500">
          <span className="flex items-center space-x-1.5 text-emerald-700">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Parsed and normalized successfully</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-ink-800 hover:bg-ink-700 text-paper-100 text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
