export type ReconciliationStatus = 'GPS MATCHED' | 'COMPETITOR MATCHED' | 'UNVERIFIED';

export interface FuelDetail {
  grade: string;
  qty: number;
  category: 'VLSFO' | 'MGO' | 'HSFO' | 'OTHER';
}

export interface EnquiryRecord {
  id: string;
  date: string;
  vesselName: string;
  normalizedVessel: string;
  fuelGrade1?: string;
  qty1: number;
  fuelGrade2?: string;
  qty2: number;
  fuelGrade3?: string;
  qty3: number;
  vlsfoQty: number;
  mgoQty: number;
  hsfoQty: number;
  totalEnquiryQty: number;
}

export interface GpsRecord {
  id: string;
  vesselName: string;
  normalizedVessel: string;
  barge: string;
  quantity?: number;
  vlsfoQty?: number;
  mgoQty?: number;
  date?: string;
  sectionSource?: string;
}

export interface StsTrackingRecord {
  id: string;
  vesselName: string;
  normalizedVessel: string;
  barge: string;
  competitor: string;
  quantity?: number;
  date?: string;
}

export interface ReconciledRecord {
  id: string;
  date: string;
  vesselName: string;
  normalizedVessel: string;
  enquiryQty: number;
  vlsfoQty: number;
  mgoQty: number;
  hsfoQty: number;
  fuelDetails: FuelDetail[];
  gpsQty: number | null;
  gpsVlsfoQty?: number | null;
  gpsMgoQty?: number | null;
  matchDelta: number | null; // Difference between matched quantity and enquiry quantity
  barge: string;
  competitor: string;
  trackingQty: number | null;
  status: ReconciliationStatus;
}

export interface CompetitorMapping {
  bargeName: string;
  competitorName: string;
}

export interface ReconciliationSummary {
  totalEnquiries: number;
  totalEnquiryQty: number;
  totalVlsfoQty: number;
  totalMgoQty: number;
  totalHsfoQty: number;

  gpsMatchedCount: number;
  gpsMatchedQty: number;
  gpsMatchedVlsfoQty: number;
  gpsMatchedMgoQty: number;

  competitorMatchedCount: number;
  competitorMatchedQty: number;
  competitorMatchedVlsfoQty: number;
  competitorMatchedMgoQty: number;

  unverifiedCount: number;
  unverifiedQty: number;
  unverifiedVlsfoQty: number;
  unverifiedMgoQty: number;
}

export interface PeriodSummary {
  periodKey: string;
  periodLabel: string;
  totalEnquiryQty: number;
  vlsfoQty: number;
  mgoQty: number;
  gpsMatchedQty: number;
  competitorMatchedQty: number;
  unverifiedQty: number;
  enquiryCount: number;
  gpsCount: number;
  competitorCount: number;
  unverifiedCount: number;
}

export interface CompetitorBreakdown {
  competitor: string;
  vesselCount: number;
  totalEnquiryQty: number;
  totalTrackingQty: number;
  barges: string[];
}

export interface RawReportState {
  fileName: string;
  sheetNames: string[];
  selectedSheet: string;
  rows: unknown[][];
}

export interface EnquiryColumnConfig {
  headerRow: number;
  startRow?: number;
  endRow?: number;
  vesselCol: number;
  dateCol: number;
  fuel1GradeCol: number;
  fuel1QtyCol: number;
  fuel1Category?: 'VLSFO' | 'MGO' | 'HSFO' | 'AUTO';
  fuel2GradeCol: number;
  fuel2QtyCol: number;
  fuel2Category?: 'VLSFO' | 'MGO' | 'HSFO' | 'AUTO';
  fuel3GradeCol: number;
  fuel3QtyCol: number;
  fuel3Category?: 'VLSFO' | 'MGO' | 'HSFO' | 'AUTO';
}

export interface GpsColumnConfig {
  headerRow: number;
  startRow?: number;
  endRow?: number;
  vesselCol: number;
  bargeCol: number;
  qtyCol: number;
  vlsfoQtyCol?: number;
  mgoQtyCol?: number;
  dateCol: number;
}

export interface TrackingColumnConfig {
  headerRow: number;
  startRow?: number;
  endRow?: number;
  vesselCol: number;
  bargeCol: number;
  competitorCol: number;
  qtyCol: number;
  dateCol: number;
}
