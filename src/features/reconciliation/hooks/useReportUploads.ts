import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  EnquiryRecord,
  GpsRecord,
  StsTrackingRecord,
  RawReportState,
  EnquiryColumnConfig,
  GpsColumnConfig,
  TrackingColumnConfig
} from '../types';
import {
  fileToWorkbook,
  sheetTo2DArray,
  parseFlowReport,
  parseTrackingReport,
  parseEnquiryReport
} from '../utils/parsers';

export type ReportType = 'gps' | 'tracking' | 'enquiry';

interface UploadConfig<T> {
  reportType: ReportType;
  parse: (wb: XLSX.WorkBook) => T[];
  setRecords: (records: T[]) => void;
  setRaw: (raw: RawReportState) => void;
  setWb: (wb: XLSX.WorkBook) => void;
  emptyWarning: string;
  errorMessage: string;
  describeSuccess: (records: T[]) => string;
}

/**
 * Manages the raw/parsed state for all three uploaded reports (FLOW/GPS, STS
 * Tracking, Enquiry) plus the shared upload -> parse -> preview pipeline they
 * all follow, so each report type only needs to supply its own parser and
 * success/warning copy instead of re-implementing the whole flow.
 */
export function useReportUploads(showToast: (text: string, type?: 'success' | 'warning') => void) {
  const [gpsRecords, setGpsRecords] = useState<GpsRecord[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<StsTrackingRecord[]>([]);
  const [enquiryRecords, setEnquiryRecords] = useState<EnquiryRecord[]>([]);

  const [rawGps, setRawGps] = useState<RawReportState | null>(null);
  const [rawTracking, setRawTracking] = useState<RawReportState | null>(null);
  const [rawEnquiry, setRawEnquiry] = useState<RawReportState | null>(null);

  const [wbGps, setWbGps] = useState<XLSX.WorkBook | null>(null);
  const [wbTracking, setWbTracking] = useState<XLSX.WorkBook | null>(null);
  const [wbEnquiry, setWbEnquiry] = useState<XLSX.WorkBook | null>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [columnConfigType, setColumnConfigType] = useState<ReportType | null>(null);

  async function handleUpload<T>(file: File, config: UploadConfig<T>) {
    setIsParsing(true);
    try {
      const wb = await fileToWorkbook(file);
      config.setWb(wb);

      const firstSheet = wb.SheetNames[0] || '';
      const sheetRows = firstSheet && wb.Sheets[firstSheet] ? sheetTo2DArray(wb.Sheets[firstSheet]) : [];
      config.setRaw({ fileName: file.name, sheetNames: wb.SheetNames, selectedSheet: firstSheet, rows: sheetRows });

      const parsed = config.parse(wb);
      if (parsed.length === 0) {
        showToast(config.emptyWarning, 'warning');
        setColumnConfigType(config.reportType);
      } else {
        config.setRecords(parsed);
        showToast(config.describeSuccess(parsed));
      }
    } catch (err) {
      console.error(err);
      showToast(config.errorMessage, 'warning');
    } finally {
      setIsParsing(false);
    }
  }

  const handleUploadGps = (file: File) =>
    handleUpload(file, {
      reportType: 'gps',
      parse: parseFlowReport,
      setRecords: setGpsRecords,
      setRaw: setRawGps,
      setWb: setWbGps,
      emptyWarning: 'No records detected automatically. Opening column mapping...',
      errorMessage: 'Error reading FLOW report file. Ensure it is a valid Excel or CSV.',
      describeSuccess: (records) => {
        const qtyCount = records.filter(r => r.quantity && r.quantity > 0).length;
        return `Parsed ${records.length} FLOW/GPS records (${qtyCount} with actual supply quantities).`;
      }
    });

  const handleUploadTracking = (file: File) =>
    handleUpload(file, {
      reportType: 'tracking',
      parse: parseTrackingReport,
      setRecords: setTrackingRecords,
      setRaw: setRawTracking,
      setWb: setWbTracking,
      emptyWarning: 'No tracking records detected automatically. Opening column mapping...',
      errorMessage: 'Error reading Tracking report file.',
      describeSuccess: (records) => `Parsed ${records.length} STS Bunkering tracking operations.`
    });

  const handleUploadEnquiry = (file: File) =>
    handleUpload(file, {
      reportType: 'enquiry',
      parse: parseEnquiryReport,
      setRecords: setEnquiryRecords,
      setRaw: setRawEnquiry,
      setWb: setWbEnquiry,
      emptyWarning: 'No enquiries detected automatically. Opening column mapping...',
      errorMessage: 'Error reading Enquiry report file.',
      describeSuccess: (records) => {
        const totalMT = records.reduce((acc, r) => acc + r.totalEnquiryQty, 0);
        return `Parsed ${records.length} enquiries (${totalMT.toLocaleString()} MT requested).`;
      }
    });

  // Sheet switching inside the ColumnMappingModal
  const handleSwitchSheet = (sheetName: string) => {
    if (columnConfigType === 'enquiry' && wbEnquiry && wbEnquiry.Sheets[sheetName]) {
      const newRows = sheetTo2DArray(wbEnquiry.Sheets[sheetName]);
      setRawEnquiry(prev => (prev ? { ...prev, selectedSheet: sheetName, rows: newRows } : null));
    } else if (columnConfigType === 'gps' && wbGps && wbGps.Sheets[sheetName]) {
      const newRows = sheetTo2DArray(wbGps.Sheets[sheetName]);
      setRawGps(prev => (prev ? { ...prev, selectedSheet: sheetName, rows: newRows } : null));
    } else if (columnConfigType === 'tracking' && wbTracking && wbTracking.Sheets[sheetName]) {
      const newRows = sheetTo2DArray(wbTracking.Sheets[sheetName]);
      setRawTracking(prev => (prev ? { ...prev, selectedSheet: sheetName, rows: newRows } : null));
    }
  };

  // Manual column-mapping apply handlers
  const applyEnquiryConfig = (records: EnquiryRecord[], _config: EnquiryColumnConfig) => {
    setEnquiryRecords(records);
    const totalMT = records.reduce((acc, r) => acc + r.totalEnquiryQty, 0);
    showToast(`Applied column mapping: ${records.length} enquiries (${totalMT.toLocaleString()} MT).`);
  };

  const applyGpsConfig = (records: GpsRecord[], _config: GpsColumnConfig) => {
    setGpsRecords(records);
    const qtyCount = records.filter(r => r.quantity && r.quantity > 0).length;
    showToast(`Applied column mapping: ${records.length} GPS records (${qtyCount} with quantities).`);
  };

  const applyTrackingConfig = (records: StsTrackingRecord[], _config: TrackingColumnConfig) => {
    setTrackingRecords(records);
    showToast(`Applied column mapping: ${records.length} STS operations.`);
  };

  const clearAll = () => {
    setGpsRecords([]);
    setTrackingRecords([]);
    setEnquiryRecords([]);
    setRawGps(null);
    setRawTracking(null);
    setRawEnquiry(null);
    showToast('Cleared all uploaded report data.');
  };

  return {
    // records
    gpsRecords,
    trackingRecords,
    enquiryRecords,
    // raw preview state
    rawGps,
    rawTracking,
    rawEnquiry,
    // modal / progress state
    isParsing,
    columnConfigType,
    setColumnConfigType,
    // handlers
    handleUploadGps,
    handleUploadTracking,
    handleUploadEnquiry,
    handleSwitchSheet,
    applyEnquiryConfig,
    applyGpsConfig,
    applyTrackingConfig,
    clearAll
  };
}
