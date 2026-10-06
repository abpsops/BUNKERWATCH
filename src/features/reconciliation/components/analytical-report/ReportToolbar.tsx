import React, { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, FileText, Image, FileSpreadsheet, Globe, Printer, Loader2 } from 'lucide-react';

export type FuelFilter = 'ALL' | 'VLSFO' | 'MGO';

const FUEL_OPTIONS: { id: FuelFilter; label: string }[] = [
  { id: 'ALL', label: 'All fuels' },
  { id: 'VLSFO', label: 'VLSFO only' },
  { id: 'MGO', label: 'MGO only' }
];

interface ReportToolbarProps {
  fuelFilter: FuelFilter;
  onFuelFilterChange: (filter: FuelFilter) => void;
  isDownloadingPdf: boolean;
  isDownloadingPng: boolean;
  onDownloadPdf: () => void;
  onDownloadPng: () => void;
  onDownloadColorExcel: () => void;
  onDownloadColoredHtml: () => void;
  onPrint: () => void;
}

/**
 * Header of the analytical report: fuel focus filter plus the single menu for
 * every report-style download (PDF, image, colour spreadsheet, HTML, print).
 * Plain data exports (Excel / CSV) live once, in the page header.
 */
export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  fuelFilter,
  onFuelFilterChange,
  isDownloadingPdf,
  isDownloadingPng,
  onDownloadPdf,
  onDownloadPng,
  onDownloadColorExcel,
  onDownloadColoredHtml,
  onPrint
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const busy = isDownloadingPdf || isDownloadingPng;
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const items = [
    { label: 'Coloured PDF', icon: FileText, onClick: onDownloadPdf, disabled: isDownloadingPdf },
    { label: 'Image (PNG)', icon: Image, onClick: onDownloadPng, disabled: isDownloadingPng },
    { label: 'Coloured spreadsheet (.xls)', icon: FileSpreadsheet, onClick: onDownloadColorExcel, disabled: false },
    { label: 'Standalone HTML', icon: Globe, onClick: onDownloadColoredHtml, disabled: false },
    { label: 'Print', icon: Printer, onClick: onPrint, disabled: false }
  ];

  return (
    <div className="glass rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-semibold text-paper-100">Analytical report</h2>
        <p className="mt-0.5 text-xs text-paper-500">
          Demand fulfilment, GPS market capture, competitor share, fuel split and delivery accuracy
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-1 text-xs font-medium">
          {FUEL_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => onFuelFilterChange(opt.id)}
              className={`rounded-md px-2.5 py-1 transition focus-ring ${
                fuelFilter === opt.id ? 'bg-brand-500 text-white shadow-sm' : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-brand-500 hover:bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition focus-ring disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {busy ? 'Preparing…' : 'Download'}
            <ChevronDown size={12} />
          </button>
          {open && (
            <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-ink-700 bg-white py-1 shadow-lg">
              {items.map(({ label, icon: Icon, onClick, disabled }) => (
                <button
                  key={label}
                  onClick={run(onClick)}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-paper-300 transition hover:bg-ink-800 disabled:opacity-50"
                >
                  <Icon size={13} className="text-paper-500" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
