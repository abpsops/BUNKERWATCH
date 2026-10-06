import React, { useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, Award, Calendar, Download, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { ReconciledRecord, ReconciliationSummary } from '@/features/reconciliation/types';
import { performReconciliation, calculateSummary } from '@/features/reconciliation/utils/engine';
import { exportReconciliationToExcel, exportReconciliationToCSV } from '@/features/reconciliation/utils/exportUtils';
import { useToast } from '@/features/reconciliation/hooks/useToast';
import { useReportUploads } from '@/features/reconciliation/hooks/useReportUploads';
import { useBargeCompetitorMappings } from '@/features/reconciliation/hooks/useBargeCompetitorMappings';
import { UploadSection } from '@/features/reconciliation/components/UploadSection';
import { SummaryCards } from '@/features/reconciliation/components/SummaryCards';
import { MainReconciliationTable } from '@/features/reconciliation/components/MainReconciliationTable';
import { CompetitorInfoSection } from '@/features/reconciliation/components/CompetitorInfoSection';
import { PeriodAnalysisSection } from '@/features/reconciliation/components/PeriodAnalysisSection';
import { AnalyticalReport } from '@/features/reconciliation/components/analytical-report';
import { UnmappedBargesNotice } from '@/features/reconciliation/components/UnmappedBargesNotice';
import { ColumnMappingModal } from '@/features/reconciliation/components/ColumnMappingModal';
import { InspectModal } from '@/features/reconciliation/components/InspectModal';

type ActiveView = 'analytics' | 'table' | 'competitors' | 'periods';

const VIEW_TABS: { id: ActiveView; label: string; icon: React.ElementType }[] = [
  { id: 'analytics', label: 'Analytical report', icon: BarChart3 },
  { id: 'table', label: 'Market table', icon: FileSpreadsheet },
  { id: 'competitors', label: 'Competitor intelligence', icon: Award },
  { id: 'periods', label: 'Period analysis', icon: Calendar }
];

export default function Reconciliation() {
  const [activeView, setActiveView] = useState<ActiveView>('analytics');
  const [inspectType, setInspectType] = useState<'gps' | 'tracking' | 'enquiry' | null>(null);

  const { toastMessage, showToast } = useToast();
  const mappings = useBargeCompetitorMappings();
  const {
    gpsRecords,
    trackingRecords,
    enquiryRecords,
    rawGps,
    rawTracking,
    rawEnquiry,
    isParsing,
    columnConfigType,
    setColumnConfigType,
    handleUploadGps,
    handleUploadTracking,
    handleUploadEnquiry,
    handleSwitchSheet,
    applyEnquiryConfig,
    applyGpsConfig,
    applyTrackingConfig,
    clearAll
  } = useReportUploads(showToast);

  const reconciledRecords: ReconciledRecord[] = useMemo(
    () => performReconciliation(enquiryRecords, gpsRecords, trackingRecords, mappings),
    [enquiryRecords, gpsRecords, trackingRecords, mappings]
  );
  const summary: ReconciliationSummary = useMemo(() => calculateSummary(reconciledRecords), [reconciledRecords]);

  const hasData = enquiryRecords.length > 0;
  const hasAnyUpload = hasData || gpsRecords.length > 0 || trackingRecords.length > 0;

  const handleExportExcel = () => {
    exportReconciliationToExcel(reconciledRecords, summary);
    showToast('Market analysis exported to Excel (.xlsx).');
  };
  const handleExportCSV = () => {
    exportReconciliationToCSV(reconciledRecords);
    showToast('Market analysis exported to CSV.');
  };

  return (
    <div>
      <PageHeader
        title="Market Analyzer"
        subtitle="Match enquiries against FLOW/GPS supplies and STS tracking to see what was won, lost to competitors, or left unverified."
        actions={
          <>
            <button
              onClick={handleExportExcel}
              disabled={!hasData}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-white text-paper-300 hover:bg-ink-800 px-3 py-1.5 text-xs font-medium transition focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} /> Excel
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!hasData}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-white px-3 py-1.5 text-xs font-medium text-paper-300 transition hover:bg-ink-800 focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} /> CSV
            </button>
            <button
              onClick={clearAll}
              disabled={!hasAnyUpload}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-white px-3 py-1.5 text-xs font-medium text-paper-500 transition hover:border-signal-crit/40 hover:text-signal-crit focus-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={13} /> Clear all
            </button>
          </>
        }
      />

      <div className="px-6 pb-10">
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50">
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg ${
                toastMessage.type === 'success'
                  ? 'border-vivid-green/40 bg-vivid-green-tint text-paper-100'
                  : 'border-vivid-amber/40 bg-vivid-amber-tint text-paper-100'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 size={14} className="text-vivid-green" />
              ) : (
                <AlertTriangle size={14} className="text-vivid-amber" />
              )}
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        <UploadSection
          gpsRecords={gpsRecords}
          trackingRecords={trackingRecords}
          enquiryRecords={enquiryRecords}
          rawGps={rawGps}
          rawTracking={rawTracking}
          rawEnquiry={rawEnquiry}
          onUploadGps={handleUploadGps}
          onUploadTracking={handleUploadTracking}
          onUploadEnquiry={handleUploadEnquiry}
          onInspect={setInspectType}
          onConfigureColumns={setColumnConfigType}
          isParsing={isParsing}
        />

        <UnmappedBargesNotice trackingRecords={trackingRecords} mappings={mappings} />

        {!hasData ? (
          <div className="glass rounded-xl p-10 text-center">
            <h2 className="font-display text-lg font-semibold text-paper-100">No enquiry data uploaded</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-paper-500">
              Upload the Enquiry, FLOW/GPS and STS Tracking reports above to start. The Enquiry report is the minimum.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-white p-1.5 shadow-sm">
              <div className="flex flex-wrap items-center gap-1">
                {VIEW_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveView(id)}
                    className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition focus-ring ${
                      activeView === id ? 'bg-brand-500 text-white shadow-sm' : 'text-paper-500 hover:bg-ink-800 hover:text-paper-100'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                    {id === 'table' && (
                      <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${activeView === id ? 'bg-white/25 text-white' : 'bg-ink-800 text-paper-500'}`}>
                        {reconciledRecords.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="hidden px-2 font-mono text-[11px] text-paper-500 md:block">
                Reconciled: <span className="font-semibold text-paper-100">{summary.totalEnquiryQty.toLocaleString()} MT</span>
                {' · '}Win rate:{' '}
                <span className="font-semibold text-signal-ok">
                  {Math.round((summary.gpsMatchedQty / (summary.totalEnquiryQty || 1)) * 100)}%
                </span>
              </div>
            </div>

            {activeView === 'analytics' ? (
              <AnalyticalReport records={reconciledRecords} summary={summary} onNotify={showToast} />
            ) : (
              <>
                <SummaryCards summary={summary} />
                {activeView === 'table' && <MainReconciliationTable records={reconciledRecords} />}
                {activeView === 'competitors' && <CompetitorInfoSection records={reconciledRecords} />}
                {activeView === 'periods' && <PeriodAnalysisSection records={reconciledRecords} />}
              </>
            )}
          </>
        )}
      </div>

      <ColumnMappingModal
        isOpen={columnConfigType !== null}
        onClose={() => setColumnConfigType(null)}
        reportType={columnConfigType}
        rawReport={columnConfigType === 'enquiry' ? rawEnquiry : columnConfigType === 'gps' ? rawGps : rawTracking}
        onApplyEnquiry={applyEnquiryConfig}
        onApplyGps={applyGpsConfig}
        onApplyTracking={applyTrackingConfig}
        onSwitchSheet={handleSwitchSheet}
      />

      <InspectModal
        isOpen={inspectType !== null}
        onClose={() => setInspectType(null)}
        type={inspectType}
        gpsRecords={gpsRecords}
        trackingRecords={trackingRecords}
        enquiryRecords={enquiryRecords}
      />
    </div>
  );
}
