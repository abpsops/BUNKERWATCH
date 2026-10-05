import React, { useState, useMemo } from 'react';
import { ReconciledRecord, ReconciliationSummary } from '../../types';
import { calculateCompetitorBreakdown } from '../../utils/engine';
import {
  downloadColoredPdfReport,
  downloadColoredPngReport,
  exportColorizedExcel,
  downloadColoredHtmlReport
} from '../../utils/exportUtils';
import { ReportToolbar, FuelFilter } from './ReportToolbar';
import { KpiBadges } from './KpiBadges';
import { VolumeDonutChart } from './VolumeDonutChart';
import { FuelBreakdownPanel } from './FuelBreakdownPanel';
import { CompetitorRankingPanel } from './CompetitorRankingPanel';
import { DeliveryVarianceSpectrum } from './DeliveryVarianceSpectrum';
import { PeriodTimelineChart } from './PeriodTimelineChart';
import { StrategicTakeaways } from './StrategicTakeaways';

interface AnalyticalReportProps {
  records: ReconciledRecord[];
  summary: ReconciliationSummary;
  onNotify: (text: string, type?: 'success' | 'warning') => void;
}

/**
 * Executive analytics dashboard: KPI badges, volume allocation donut, fuel-grade
 * breakdown, competitor ranking, delivery variance, and a chronological trend chart.
 * Each visual section lives in its own file under this folder; this component owns
 * only the state and derived numbers that are shared across more than one section.
 */
export const AnalyticalReport: React.FC<AnalyticalReportProps> = ({
  records,
  summary,
  onNotify
}) => {
  const [fuelFilter, setFuelFilter] = useState<FuelFilter>('ALL');

  // Colored export state
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);

  // Filter records based on the selected fuel focus
  const filteredRecords = useMemo(() => {
    if (fuelFilter === 'ALL') return records;
    if (fuelFilter === 'VLSFO') {
      return records.filter(r => r.vlsfoQty > 0 || (r.gpsVlsfoQty ?? 0) > 0);
    }
    if (fuelFilter === 'MGO') {
      return records.filter(r => r.mgoQty > 0 || (r.gpsMgoQty ?? 0) > 0);
    }
    return records;
  }, [records, fuelFilter]);

  // Dynamic summary based on fuel filter
  const activeSummary: ReconciliationSummary = useMemo(() => {
    if (fuelFilter === 'ALL') return summary;

    let totalEnquiryQty = 0;
    let gpsMatchedQty = 0;
    let competitorMatchedQty = 0;
    let unverifiedQty = 0;
    let gpsMatchedCount = 0;
    let competitorMatchedCount = 0;
    let unverifiedCount = 0;

    for (const r of filteredRecords) {
      const q = fuelFilter === 'VLSFO' ? r.vlsfoQty : r.mgoQty;
      totalEnquiryQty += q;
      if (r.status === 'GPS MATCHED') {
        gpsMatchedCount++;
        gpsMatchedQty += q;
      } else if (r.status === 'COMPETITOR MATCHED') {
        competitorMatchedCount++;
        competitorMatchedQty += q;
      } else {
        unverifiedCount++;
        unverifiedQty += q;
      }
    }

    return {
      ...summary,
      totalEnquiries: filteredRecords.length,
      totalEnquiryQty: Math.round(totalEnquiryQty * 100) / 100,
      gpsMatchedQty: Math.round(gpsMatchedQty * 100) / 100,
      gpsMatchedCount,
      competitorMatchedQty: Math.round(competitorMatchedQty * 100) / 100,
      competitorMatchedCount,
      unverifiedQty: Math.round(unverifiedQty * 100) / 100,
      unverifiedCount
    };
  }, [filteredRecords, fuelFilter, summary]);

  const competitorBreakdown = useMemo(() => calculateCompetitorBreakdown(filteredRecords), [filteredRecords]);
  const maxCompQty = useMemo(() => {
    if (competitorBreakdown.length === 0) return 1;
    return Math.max(...competitorBreakdown.map(c => c.totalEnquiryQty), 1);
  }, [competitorBreakdown]);
  const topCompetitor = competitorBreakdown.length > 0 ? competitorBreakdown[0] : null;

  // Key ratios (fuel-filter aware)
  const totalQty = activeSummary.totalEnquiryQty > 0 ? activeSummary.totalEnquiryQty : 1;
  const gpsWinRate = Math.round((activeSummary.gpsMatchedQty / totalQty) * 1000) / 10;
  const compLossRate = Math.round((activeSummary.competitorMatchedQty / totalQty) * 1000) / 10;
  const unvRate = Math.max(0, Math.round((100 - gpsWinRate - compLossRate) * 10) / 10);

  // Fuel product shares across all records (independent of fuelFilter)
  const overallDemandQty = summary.totalEnquiryQty > 0 ? summary.totalEnquiryQty : 1;
  const vlsfoShare = Math.round((summary.totalVlsfoQty / overallDemandQty) * 100);
  const mgoShare = Math.round((summary.totalMgoQty / overallDemandQty) * 100);
  const gpsVlsfoWinRate = summary.totalVlsfoQty > 0
    ? Math.round((summary.gpsMatchedVlsfoQty / summary.totalVlsfoQty) * 1000) / 10
    : 0;
  const gpsMgoWinRate = summary.totalMgoQty > 0
    ? Math.round((summary.gpsMatchedMgoQty / summary.totalMgoQty) * 1000) / 10
    : 0;

  // Actual GPS delivery quantities (from FLOW report matched records)
  const gpsMatchedRecords = useMemo(() => {
    return filteredRecords.filter(r => r.status === 'GPS MATCHED' && r.gpsQty !== null && r.gpsQty !== undefined);
  }, [filteredRecords]);

  const totalGpsDeliveredMT = useMemo(() => {
    return Math.round(gpsMatchedRecords.reduce((acc, r) => acc + (r.gpsQty || 0), 0) * 1000) / 1000;
  }, [gpsMatchedRecords]);

  const totalGpsRequestedMT = useMemo(() => {
    return Math.round(gpsMatchedRecords.reduce((acc, r) => acc + r.enquiryQty, 0) * 1000) / 1000;
  }, [gpsMatchedRecords]);

  const netGpsVarianceMT = Math.round((totalGpsDeliveredMT - totalGpsRequestedMT) * 1000) / 1000;
  const deliveryAccuracyPct = totalGpsRequestedMT > 0
    ? Math.round((1 - Math.abs(netGpsVarianceMT) / totalGpsRequestedMT) * 1000) / 10
    : 100;

  const totalGpsVlsfoDeliveredMT = useMemo(() => {
    return Math.round(
      gpsMatchedRecords.reduce((acc, r) => acc + (r.gpsVlsfoQty ?? (r.vlsfoQty > 0 ? r.gpsQty || 0 : 0)), 0) * 1000
    ) / 1000;
  }, [gpsMatchedRecords]);

  const totalGpsMgoDeliveredMT = useMemo(() => {
    return Math.round(
      gpsMatchedRecords.reduce(
        (acc, r) => acc + (r.gpsMgoQty ?? (r.mgoQty > 0 && r.vlsfoQty === 0 ? r.gpsQty || 0 : 0)),
        0
      ) * 1000
    ) / 1000;
  }, [gpsMatchedRecords]);

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    onNotify('Generating coloured PDF report...');
    try {
      const success = await downloadColoredPdfReport('analytical-report-view');
      if (success) onNotify('Coloured PDF report downloaded.');
      else onNotify('Could not generate the PDF. Try Print instead.', 'warning');
    } catch (e) {
      console.error(e);
      onNotify('Error generating PDF.', 'warning');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadPng = async () => {
    setIsDownloadingPng(true);
    onNotify('Generating image...');
    try {
      const success = await downloadColoredPngReport('analytical-report-view');
      if (success) onNotify('Image downloaded.');
      else onNotify('Could not generate the image.', 'warning');
    } catch (e) {
      console.error(e);
      onNotify('Error generating image.', 'warning');
    } finally {
      setIsDownloadingPng(false);
    }
  };

  const handleDownloadColorExcel = () => {
    exportColorizedExcel(filteredRecords, activeSummary);
    onNotify('Coloured spreadsheet (.xls) downloaded.');
  };

  const handleDownloadColoredHtml = () => {
    downloadColoredHtmlReport(filteredRecords, activeSummary);
    onNotify('Standalone HTML report downloaded.');
  };

  const handlePrint = () => window.print();

  return (
    <div id="analytical-report-view" className="space-y-6 mb-8 print:p-0 print:space-y-4">
      <ReportToolbar
        fuelFilter={fuelFilter}
        onFuelFilterChange={setFuelFilter}
        isDownloadingPdf={isDownloadingPdf}
        isDownloadingPng={isDownloadingPng}
        onDownloadPdf={handleDownloadPdf}
        onDownloadPng={handleDownloadPng}
        onDownloadColorExcel={handleDownloadColorExcel}
        onDownloadColoredHtml={handleDownloadColoredHtml}
        onPrint={handlePrint}
      />

      <KpiBadges
        activeSummary={activeSummary}
        gpsWinRate={gpsWinRate}
        compLossRate={compLossRate}
        unvRate={unvRate}
        totalGpsDeliveredMT={totalGpsDeliveredMT}
        netGpsVarianceMT={netGpsVarianceMT}
        deliveryAccuracyPct={deliveryAccuracyPct}
      />

      {/* ROW A: Volume Allocation & Fuel Specification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <VolumeDonutChart
          activeSummary={activeSummary}
          gpsWinRate={gpsWinRate}
          compLossRate={compLossRate}
          unvRate={unvRate}
        />
        <FuelBreakdownPanel
          summary={summary}
          vlsfoShare={vlsfoShare}
          mgoShare={mgoShare}
          gpsVlsfoWinRate={gpsVlsfoWinRate}
          gpsMgoWinRate={gpsMgoWinRate}
          totalGpsDeliveredMT={totalGpsDeliveredMT}
          totalGpsVlsfoDeliveredMT={totalGpsVlsfoDeliveredMT}
          totalGpsMgoDeliveredMT={totalGpsMgoDeliveredMT}
          netGpsVarianceMT={netGpsVarianceMT}
        />
      </div>

      {/* ROW B: Competitor Infiltration & GPS Delivery Variance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <CompetitorRankingPanel
          competitorBreakdown={competitorBreakdown}
          maxCompQty={maxCompQty}
          activeSummary={activeSummary}
          compLossRate={compLossRate}
        />
        <DeliveryVarianceSpectrum
          gpsMatchedRecords={gpsMatchedRecords}
          totalGpsDeliveredMT={totalGpsDeliveredMT}
          totalGpsRequestedMT={totalGpsRequestedMT}
          netGpsVarianceMT={netGpsVarianceMT}
          deliveryAccuracyPct={deliveryAccuracyPct}
        />
      </div>

      {/* ROW C: Chronological Trend */}
      <PeriodTimelineChart records={filteredRecords} />

      <StrategicTakeaways
        summary={summary}
        gpsWinRate={gpsWinRate}
        compLossRate={compLossRate}
        deliveryAccuracyPct={deliveryAccuracyPct}
        vlsfoShare={vlsfoShare}
        mgoShare={mgoShare}
        gpsVlsfoWinRate={gpsVlsfoWinRate}
        gpsMgoWinRate={gpsMgoWinRate}
        topCompetitor={topCompetitor}
      />
    </div>
  );
};
