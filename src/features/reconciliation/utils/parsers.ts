import * as XLSX from 'xlsx';
import {
  EnquiryRecord,
  GpsRecord,
  StsTrackingRecord,
  FuelDetail,
  EnquiryColumnConfig,
  GpsColumnConfig,
  TrackingColumnConfig
} from '../types';
import { normalizeVesselName, cleanNumber, formatDateStr } from './normalizer';

/**
 * Universal helper to read a file or arraybuffer into a SheetJS Workbook
 */
export async function fileToWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
}

/**
 * Convert any worksheet into a clean 2D array of rows
 */
export function sheetTo2DArray(sheet: XLSX.WorkSheet): unknown[][] {
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!raw || raw.length === 0) return [];

  // Find the last row with actual data to avoid millions of blank rows from full-column Excel formatting
  let lastNonEmpty = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    const row = raw[i];
    if (row && Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
      lastNonEmpty = i;
      break;
    }
  }

  return lastNonEmpty >= 0 ? raw.slice(0, lastNonEmpty + 1) : [];
}

/**
 * Normalizes header cell string for fuzzy matching
 */
export function cleanHeaderStr(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a string contains any of the target keywords
 */
export function matchKeywords(cell: unknown, keywords: string[]): boolean {
  const str = cleanHeaderStr(cell);
  if (!str) return false;
  return keywords.some(kw => {
    const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
    return str.includes(cleanKw);
  });
}

// Negative keywords to avoid false positives (e.g. "Vessel Type", "Vessel Flag", "IMO Number")
const VESSEL_EXCLUDE = ['type', 'flag', 'imo', 'status', 'built', 'dwt', 'agent', 'master', 'callsign', 'class'];
const BARGE_EXCLUDE = ['type', 'status', 'capacity', 'dwt', 'imo', 'flag', 'location', 'master', 'qty', 'quantity', 'mt', 'vlsfo', 'mgo', 'hsfo', 'tons', 'fuel'];
const QTY_EXCLUDE = ['price', 'rate', 'density', 'temp', 'viscosity', 'diff', 'index', 'cost', 'amount_usd'];

// ============================================================================
// 1. ENQUIRY DATA REPORT PARSER
// ============================================================================

/**
 * Automatically inspects rows to find the enquiry table and column layout
 */
export function autoDetectEnquiryConfig(rows: unknown[][]): EnquiryColumnConfig {
  let bestHeaderRow = -1;
  let bestScore = -1;
  let config: EnquiryColumnConfig = {
    headerRow: 0,
    vesselCol: -1,
    dateCol: -1,
    fuel1GradeCol: -1,
    fuel1QtyCol: -1,
    fuel2GradeCol: -1,
    fuel2QtyCol: -1,
    fuel3GradeCol: -1,
    fuel3QtyCol: -1
  };

  // Scan up to the first 25 rows to find the Enquiry header row
  const maxScan = Math.min(rows.length, 30);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Check next row too for merged headers (e.g. Fuel 1 on top, Grade & Qty below)
    const nextRow = r + 1 < rows.length && Array.isArray(rows[r + 1]) ? rows[r + 1] : [];

    let score = 0;
    let vesselIdx = -1;
    let dateIdx = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const combined = `${cell || ''} ${nextRow[c] || ''}`;

      if (vesselIdx === -1 && matchKeywords(cell, ['vessel', 'receivingvessel', 'ship', 'vesselname', 'vsl', 'clientvessel'])) {
        if (!VESSEL_EXCLUDE.some(ex => cleanHeaderStr(cell).includes(ex))) {
          vesselIdx = c;
          score += 10;
        }
      }

      if (dateIdx === -1 && matchKeywords(cell, ['date', 'enquirydate', 'enqdate', 'inquirydate', 'dateofenquiry'])) {
        dateIdx = c;
        score += 5;
      }
    }

    // Look for fuel grade and quantity columns
    const gradeCols: number[] = [];
    const qtyCols: number[] = [];
    const directProductCols: { name: string; col: number }[] = [];

    for (let c = 0; c < row.length; c++) {
      if (c === vesselIdx || c === dateIdx) continue;
      const cell = row[c];
      const combined = `${cell || ''} ${nextRow[c] || ''}`;

      // Check for direct fuel product names
      if (matchKeywords(combined, ['vlsfo', 'vlsfo05', '05vlsfo'])) {
        directProductCols.push({ name: 'VLSFO 0.5%', col: c });
      } else if (matchKeywords(combined, ['lsmgo', 'mgo', 'lsmgo01', '01lsmgo'])) {
        directProductCols.push({ name: 'LSMGO 0.1%', col: c });
      } else if (matchKeywords(combined, ['hsfo', 'hsfo380', '380hsfo', 'ifo380'])) {
        directProductCols.push({ name: 'HSFO 380', col: c });
      } else {
        // Check for Grade vs Qty
        const isQty = matchKeywords(combined, ['qty', 'quantity', 'mt', 'metricton', 'volume', 'qtymt']) &&
                      !QTY_EXCLUDE.some(ex => cleanHeaderStr(combined).includes(ex));
        const isGrade = matchKeywords(combined, ['grade', 'fuel', 'product', 'fuelgrade', 'productgrade']) && !isQty;

        if (isQty) {
          qtyCols.push(c);
        } else if (isGrade) {
          gradeCols.push(c);
        }
      }
    }

    score += (qtyCols.length * 4) + (gradeCols.length * 3) + (directProductCols.length * 5);

    if (vesselIdx !== -1 && (qtyCols.length > 0 || directProductCols.length > 0) && score > bestScore) {
      bestScore = score;
      bestHeaderRow = r;

      config = {
        headerRow: r,
        vesselCol: vesselIdx,
        dateCol: dateIdx,
        fuel1GradeCol: -1,
        fuel1QtyCol: -1,
        fuel2GradeCol: -1,
        fuel2QtyCol: -1,
        fuel3GradeCol: -1,
        fuel3QtyCol: -1
      };

      if (directProductCols.length > 0) {
        // Direct fuel columns format
        if (directProductCols[0]) {
          config.fuel1QtyCol = directProductCols[0].col;
          config.fuel1Category = directProductCols[0].name.includes('MGO')
            ? 'MGO'
            : directProductCols[0].name.includes('HSFO')
            ? 'HSFO'
            : 'VLSFO';
        }
        if (directProductCols[1]) {
          config.fuel2QtyCol = directProductCols[1].col;
          config.fuel2Category = directProductCols[1].name.includes('MGO')
            ? 'MGO'
            : directProductCols[1].name.includes('HSFO')
            ? 'HSFO'
            : 'VLSFO';
        }
        if (directProductCols[2]) {
          config.fuel3QtyCol = directProductCols[2].col;
          config.fuel3Category = directProductCols[2].name.includes('MGO')
            ? 'MGO'
            : directProductCols[2].name.includes('HSFO')
            ? 'HSFO'
            : 'VLSFO';
        }
      } else {
        // Pair Grade & Qty columns sequentially
        if (qtyCols.length >= 1) {
          config.fuel1QtyCol = qtyCols[0];
          config.fuel1GradeCol = gradeCols[0] !== undefined ? gradeCols[0] : -1;
        }
        if (qtyCols.length >= 2) {
          config.fuel2QtyCol = qtyCols[1];
          config.fuel2GradeCol = gradeCols[1] !== undefined ? gradeCols[1] : -1;
        }
        if (qtyCols.length >= 3) {
          config.fuel3QtyCol = qtyCols[2];
          config.fuel3GradeCol = gradeCols[2] !== undefined ? gradeCols[2] : -1;
        }
      }
    }
  }

  return config;
}

/**
 * Categorize fuel grade into VLSFO, MGO, HSFO, or OTHER
 */
export function categorizeFuelGrade(
  grade: string,
  colHeaderName?: string,
  explicit?: 'VLSFO' | 'MGO' | 'HSFO' | 'AUTO'
): 'VLSFO' | 'MGO' | 'HSFO' | 'OTHER' {
  if (explicit && explicit !== 'AUTO') {
    return explicit;
  }
  const text = `${grade || ''} ${colHeaderName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');

  // MGO / Gasoil checks
  if (
    text.includes('lsmgo') ||
    text.includes('mgo') ||
    text.includes('dma') ||
    text.includes('mdo') ||
    text.includes('gasoil') ||
    text.includes('gas_oil') ||
    text.includes('dogo') ||
    text.includes('01') ||
    text.includes('01s') ||
    text.includes('ulsd') ||
    text.includes('ago')
  ) {
    return 'MGO';
  }

  // HSFO checks
  if (
    text.includes('hsfo') ||
    text.includes('380') ||
    text.includes('ifo') ||
    text.includes('rmg') ||
    text.includes('rmk') ||
    text.includes('highsulphur') ||
    text.includes('35') ||
    text.includes('35s')
  ) {
    return 'HSFO';
  }

  // VLSFO checks
  if (
    text.includes('vlsfo') ||
    text.includes('05') ||
    text.includes('05s') ||
    text.includes('ulsfo') ||
    text.includes('lsfo') ||
    text.includes('vls')
  ) {
    return 'VLSFO';
  }

  // Default to VLSFO if not specified
  return 'VLSFO';
}

/**
 * Parse enquiry rows using a resolved column config
 */
export function parseEnquiryWithConfig(rows: unknown[][], config: EnquiryColumnConfig): EnquiryRecord[] {
  const enquiries: EnquiryRecord[] = [];
  if (!rows || rows.length <= config.headerRow + 1 || config.vesselCol === -1) {
    return enquiries;
  }

  const start = (config.startRow !== undefined && config.startRow > config.headerRow) ? config.startRow : config.headerRow + 1;
  const end = (config.endRow !== undefined && config.endRow < rows.length) ? config.endRow : rows.length - 1;

  const headerCells = rows[config.headerRow] || [];
  const col1Name = config.fuel1QtyCol !== -1 && headerCells[config.fuel1QtyCol] ? String(headerCells[config.fuel1QtyCol]) : '';
  const col2Name = config.fuel2QtyCol !== -1 && headerCells[config.fuel2QtyCol] ? String(headerCells[config.fuel2QtyCol]) : '';
  const col3Name = config.fuel3QtyCol !== -1 && headerCells[config.fuel3QtyCol] ? String(headerCells[config.fuel3QtyCol]) : '';

  for (let r = start; r <= end; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawVessel = row[config.vesselCol];
    if (!rawVessel) continue;
    const vesselStr = String(rawVessel).trim();
    if (vesselStr.length < 2) continue;

    // Skip summary / subtotal rows
    if (matchKeywords(vesselStr, ['total', 'grandtotal', 'average', 'summary', 'subtotal', 'vessel', 'date'])) {
      continue;
    }

    const dateStr = config.dateCol !== -1 && row[config.dateCol] ? formatDateStr(row[config.dateCol]) : '';

    // Fuel 1
    const qty1 = config.fuel1QtyCol !== -1 ? cleanNumber(row[config.fuel1QtyCol]) : 0;
    let grade1 = config.fuel1GradeCol !== -1 && row[config.fuel1GradeCol] ? String(row[config.fuel1GradeCol]).trim() : '';
    if (!grade1 && qty1 > 0) {
      grade1 = config.fuel1Category || (col1Name.toLowerCase().includes('mgo') ? 'LSMGO 0.1%' : 'VLSFO 0.5%');
    }

    // Fuel 2
    const qty2 = config.fuel2QtyCol !== -1 ? cleanNumber(row[config.fuel2QtyCol]) : 0;
    let grade2 = config.fuel2GradeCol !== -1 && row[config.fuel2GradeCol] ? String(row[config.fuel2GradeCol]).trim() : '';
    if (!grade2 && qty2 > 0) {
      grade2 = config.fuel2Category || (col2Name.toLowerCase().includes('mgo') ? 'LSMGO 0.1%' : 'Fuel 2');
    }

    // Fuel 3
    const qty3 = config.fuel3QtyCol !== -1 ? cleanNumber(row[config.fuel3QtyCol]) : 0;
    let grade3 = config.fuel3GradeCol !== -1 && row[config.fuel3GradeCol] ? String(row[config.fuel3GradeCol]).trim() : '';
    if (!grade3 && qty3 > 0) {
      grade3 = config.fuel3Category || (col3Name.toLowerCase().includes('hsfo') ? 'HSFO 380' : 'Fuel 3');
    }

    // Clean blank grades if qty is 0
    if (qty1 <= 0) grade1 = '';
    if (qty2 <= 0) grade2 = '';
    if (qty3 <= 0) grade3 = '';

    // Categorize fuel quantities accurately
    let vlsfo = 0;
    let mgo = 0;
    let hsfo = 0;

    if (qty1 > 0) {
      const c1 = categorizeFuelGrade(grade1, col1Name, config.fuel1Category);
      if (c1 === 'MGO') mgo += qty1;
      else if (c1 === 'HSFO') hsfo += qty1;
      else vlsfo += qty1;
    }

    if (qty2 > 0) {
      const c2 = categorizeFuelGrade(grade2, col2Name, config.fuel2Category);
      if (c2 === 'MGO') mgo += qty2;
      else if (c2 === 'HSFO') hsfo += qty2;
      else vlsfo += qty2;
    }

    if (qty3 > 0) {
      const c3 = categorizeFuelGrade(grade3, col3Name, config.fuel3Category);
      if (c3 === 'MGO') mgo += qty3;
      else if (c3 === 'HSFO') hsfo += qty3;
      else vlsfo += qty3;
    }

    const totalEnquiryQty = qty1 + qty2 + qty3;
    const normalizedVessel = normalizeVesselName(vesselStr);
    if (!normalizedVessel) continue;

    enquiries.push({
      id: `enq-${enquiries.length + 1}`,
      date: dateStr,
      vesselName: vesselStr,
      normalizedVessel,
      fuelGrade1: grade1 || undefined,
      qty1,
      fuelGrade2: grade2 || undefined,
      qty2,
      fuelGrade3: grade3 || undefined,
      qty3,
      vlsfoQty: Math.round(vlsfo * 1000) / 1000,
      mgoQty: Math.round(mgo * 1000) / 1000,
      hsfoQty: Math.round(hsfo * 1000) / 1000,
      totalEnquiryQty: Math.round(totalEnquiryQty * 1000) / 1000
    });
  }

  return enquiries;
}

/**
 * Parse Enquiry Report from Workbook (scans all sheets, auto-detects blue table)
 */
export function parseEnquiryReport(workbook: XLSX.WorkBook): EnquiryRecord[] {
  let allEnquiries: EnquiryRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = sheetTo2DArray(sheet);
    if (!rows || rows.length === 0) continue;

    const config = autoDetectEnquiryConfig(rows);
    if (config.vesselCol !== -1 && (config.fuel1QtyCol !== -1 || config.fuel2QtyCol !== -1 || config.fuel3QtyCol !== -1)) {
      const records = parseEnquiryWithConfig(rows, config);
      if (records.length > 0) {
        allEnquiries = records;
        break; // found the primary enquiry table
      }
    }
  }

  return allEnquiries;
}

// ============================================================================
// 2. FLOW REPORT / GPS REPORT PARSER
// ============================================================================

/**
 * Automatically inspects rows to find the GPS / Flow supply section
 */
export function autoDetectGpsConfig(rows: unknown[][]): GpsColumnConfig {
  let bestHeaderRow = -1;
  let bestScore = -1;
  let config: GpsColumnConfig = {
    headerRow: 0,
    vesselCol: -1,
    bargeCol: -1,
    qtyCol: -1,
    vlsfoQtyCol: -1,
    mgoQtyCol: -1,
    dateCol: -1
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let vesselIdx = -1;
    let bargeIdx = -1;
    let qtyIdx = -1;
    let vlsfoIdx = -1;
    let mgoIdx = -1;
    let dateIdx = -1;
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const str = cleanHeaderStr(cell);

      // Vessel Column
      if (vesselIdx === -1 && matchKeywords(cell, ['vessel', 'receivingvessel', 'ship', 'vesselname', 'clientvessel', 'customer', 'buyer', 'vsl', 'receivingship', 'vslname'])) {
        if (!VESSEL_EXCLUDE.some(ex => str.includes(ex))) {
          vesselIdx = c;
          score += 10;
        }
      }

      // VLSFO Quantity Column
      if (vlsfoIdx === -1 && matchKeywords(cell, ['vlsfo', 'vlsfoqty', '05vlsfo', 'vlsfomt', '05qty', 'vls', 'ulsfo', '05%'])) {
        vlsfoIdx = c;
        score += 12;
      }

      // MGO Quantity Column
      if (mgoIdx === -1 && matchKeywords(cell, ['mgo', 'lsmgo', 'mgoqty', 'mgomt', '01mgo', '01qty', 'dma', 'gasoil', '01%'])) {
        mgoIdx = c;
        score += 12;
      }

      // General Quantity Column (if not explicitly VLSFO or MGO)
      if (qtyIdx === -1 && matchKeywords(cell, ['quantity', 'qty', 'mt', 'metrictons', 'delivered', 'supplyqty', 'gpsqty', 'volume', 'actualqty', 'deliveredqty', 'flowmeter', 'netmt', 'mass', 'bunkeredqty', 'totalmt', 'soundings', 'supplied', 'bunkered', 'totalqty'])) {
        if (!QTY_EXCLUDE.some(ex => str.includes(ex)) && c !== vlsfoIdx && c !== mgoIdx) {
          qtyIdx = c;
          score += 15;
        }
      }

      // Barge Column (excluding any column with qty / mt / vlsfo / mgo)
      if (bargeIdx === -1 && matchKeywords(cell, ['barge', 'bargename', 'supplybarge', 'craft', 'tanker', 'supplyingbarge', 'bunkerbarge', 'feeder', 'supplyingcraft'])) {
        if (!BARGE_EXCLUDE.some(ex => str.includes(ex)) && c !== vlsfoIdx && c !== mgoIdx && c !== qtyIdx) {
          bargeIdx = c;
          score += 10;
        }
      }

      // Date Column
      if (dateIdx === -1 && matchKeywords(cell, ['date', 'supplydate', 'deliverydate', 'timestamp', 'bunkerdate', 'operationdate'])) {
        dateIdx = c;
        score += 5;
      }
    }

    if (vesselIdx !== -1 && (bargeIdx !== -1 || qtyIdx !== -1 || vlsfoIdx !== -1 || mgoIdx !== -1) && score > bestScore) {
      bestScore = score;
      bestHeaderRow = r;
      config = {
        headerRow: r,
        vesselCol: vesselIdx,
        bargeCol: bargeIdx,
        qtyCol: qtyIdx,
        vlsfoQtyCol: vlsfoIdx,
        mgoQtyCol: mgoIdx,
        dateCol: dateIdx
      };
    }
  }

  return config;
}

/**
 * Parse GPS records using explicit column config
 */
export function parseGpsWithConfig(rows: unknown[][], config: GpsColumnConfig): GpsRecord[] {
  const records: GpsRecord[] = [];
  if (!rows || rows.length <= config.headerRow + 1 || config.vesselCol === -1) {
    return records;
  }

  const start = (config.startRow !== undefined && config.startRow > config.headerRow) ? config.startRow : config.headerRow + 1;
  const end = (config.endRow !== undefined && config.endRow < rows.length) ? config.endRow : rows.length - 1;

  for (let r = start; r <= end; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawVessel = row[config.vesselCol];
    if (!rawVessel) continue;
    const vesselStr = String(rawVessel).trim();
    if (vesselStr.length < 2) continue;

    if (matchKeywords(vesselStr, ['total', 'grandtotal', 'average', 'summary', 'subtotal', 'vessel', 'date'])) {
      continue;
    }

    const rawBarge = config.bargeCol !== -1 ? row[config.bargeCol] : '';
    const rawQty = config.qtyCol !== -1 ? row[config.qtyCol] : undefined;
    const rawVlsfo = config.vlsfoQtyCol !== undefined && config.vlsfoQtyCol !== -1 ? row[config.vlsfoQtyCol] : undefined;
    const rawMgo = config.mgoQtyCol !== undefined && config.mgoQtyCol !== -1 ? row[config.mgoQtyCol] : undefined;
    const rawDate = config.dateCol !== -1 ? row[config.dateCol] : undefined;

    const bargeStr = rawBarge ? String(rawBarge).trim() : '';
    let qty = rawQty !== undefined && rawQty !== null && rawQty !== '' ? cleanNumber(rawQty) : undefined;
    const vlsfoQty = rawVlsfo !== undefined && rawVlsfo !== null && rawVlsfo !== '' ? cleanNumber(rawVlsfo) : undefined;
    const mgoQty = rawMgo !== undefined && rawMgo !== null && rawMgo !== '' ? cleanNumber(rawMgo) : undefined;
    const dateStr = rawDate ? formatDateStr(rawDate) : '';

    // If total quantity wasn't provided or is 0, sum VLSFO + MGO
    if ((!qty || qty === 0) && ((vlsfoQty && vlsfoQty > 0) || (mgoQty && mgoQty > 0))) {
      qty = Math.round(((vlsfoQty || 0) + (mgoQty || 0)) * 1000) / 1000;
    }

    // If vessel cell contained trailing number e.g. "NORNS - 341.212" or "NORNS -341.212"
    if (!qty || qty === 0) {
      const match = vesselStr.match(/[-–—]?\s*(\d+(?:\.\d+)?)\s*(?:MT|M\/T|MTS|KL)?\s*$/i);
      if (match) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed) && parsed > 0) {
          qty = Math.round(parsed * 1000) / 1000;
        }
      }
    }

    const normalizedVessel = normalizeVesselName(vesselStr);
    if (!normalizedVessel) continue;

    records.push({
      id: `gps-${records.length + 1}`,
      vesselName: vesselStr,
      normalizedVessel,
      barge: bargeStr,
      quantity: qty && qty > 0 ? qty : undefined,
      vlsfoQty: vlsfoQty && vlsfoQty > 0 ? vlsfoQty : undefined,
      mgoQty: mgoQty && mgoQty > 0 ? mgoQty : undefined,
      date: dateStr,
      sectionSource: 'Actual Supply Log'
    });
  }

  return records;
}

/**
 * Parse Flow Report from Workbook
 * MUST parse actual supply records & quantities where present.
 * Searches across all sheets and multi-section tables to prevent returning 0.
 */
export function parseFlowReport(workbook: XLSX.WorkBook): GpsRecord[] {
  const allRecords: GpsRecord[] = [];
  const actualSupplyRecords: GpsRecord[] = [];
  const overviewRecords: GpsRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = sheetTo2DArray(sheet);
    if (!rows || rows.length === 0) continue;

    // Scan for multiple tables / sections in this sheet
    // e.g. Overview section vs Section 2 (Actual Supply records)
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      let vesselCol = -1;
      let bargeCol = -1;
      let qtyCol = -1;
      let vlsfoCol = -1;
      let mgoCol = -1;
      let dateCol = -1;

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (!val) continue;
        const str = cleanHeaderStr(val);

        if (vesselCol === -1 && matchKeywords(val, ['vessel', 'receivingvessel', 'ship', 'vesselname', 'clientvessel', 'customer', 'buyer', 'vsl', 'receivingship', 'vslname'])) {
          if (!VESSEL_EXCLUDE.some(ex => str.includes(ex))) {
            vesselCol = c;
          }
        } else if (vlsfoCol === -1 && matchKeywords(val, ['vlsfo', 'vlsfoqty', '05vlsfo', 'vlsfomt', '05qty', 'vls', 'ulsfo', '05%'])) {
          vlsfoCol = c;
        } else if (mgoCol === -1 && matchKeywords(val, ['mgo', 'lsmgo', 'mgoqty', 'mgomt', '01mgo', '01qty', 'dma', 'gasoil', '01%'])) {
          mgoCol = c;
        } else if (qtyCol === -1 && matchKeywords(val, ['quantity', 'qty', 'mt', 'metrictons', 'delivered', 'supplyqty', 'gpsqty', 'volume', 'actualqty', 'deliveredqty', 'flowmeter', 'netmt', 'mass', 'bunkeredqty', 'totalmt', 'soundings', 'supplied', 'bunkered', 'totalqty'])) {
          if (!QTY_EXCLUDE.some(ex => str.includes(ex)) && c !== vlsfoCol && c !== mgoCol) {
            qtyCol = c;
          }
        } else if (bargeCol === -1 && matchKeywords(val, ['barge', 'bargename', 'supplybarge', 'craft', 'tanker', 'supplyingbarge', 'bunkerbarge', 'feeder', 'supplyingcraft'])) {
          if (!BARGE_EXCLUDE.some(ex => str.includes(ex))) {
            bargeCol = c;
          }
        } else if (dateCol === -1 && matchKeywords(val, ['date', 'supplydate', 'deliverydate', 'timestamp', 'bunkerdate', 'operationdate'])) {
          dateCol = c;
        }
      }

      // If we found a valid section header with vessel and (barge, qty, vlsfo, or mgo)
      if (vesselCol !== -1 && (bargeCol !== -1 || qtyCol !== -1 || vlsfoCol !== -1 || mgoCol !== -1)) {
        for (let dataIdx = r + 1; dataIdx < rows.length; dataIdx++) {
          const dRow = rows[dataIdx];
          if (!dRow || dRow.length === 0) continue;

          // Check if this row is another section header
          const isNextSection = dRow.some(cell => matchKeywords(cell, ['actual supply', 'supply records', 'bunker supply', 'fleet positions', 'daily log', 'bunker delivery']));
          if (isNextSection && dataIdx > r + 1) {
            break;
          }

          const rawVessel = dRow[vesselCol];
          if (!rawVessel) continue;
          const vesselStr = String(rawVessel).trim();
          if (vesselStr.length < 2) continue;
          if (matchKeywords(vesselStr, ['total', 'grandtotal', 'average', 'summary', 'subtotal', 'vessel', 'date'])) continue;

          const rawBarge = bargeCol !== -1 ? dRow[bargeCol] : '';
          const rawQty = qtyCol !== -1 ? dRow[qtyCol] : undefined;
          const rawVlsfo = vlsfoCol !== -1 ? dRow[vlsfoCol] : undefined;
          const rawMgo = mgoCol !== -1 ? dRow[mgoCol] : undefined;
          const rawDate = dateCol !== -1 ? dRow[dateCol] : undefined;

          const bargeStr = rawBarge ? String(rawBarge).trim() : '';
          let qty = rawQty !== undefined && rawQty !== null && rawQty !== '' ? cleanNumber(rawQty) : undefined;
          const vlsfoQty = rawVlsfo !== undefined && rawVlsfo !== null && rawVlsfo !== '' ? cleanNumber(rawVlsfo) : undefined;
          const mgoQty = rawMgo !== undefined && rawMgo !== null && rawMgo !== '' ? cleanNumber(rawMgo) : undefined;
          const dateStr = rawDate ? formatDateStr(rawDate) : '';

          // If total quantity wasn't provided or is 0, sum VLSFO + MGO
          if ((!qty || qty === 0) && ((vlsfoQty && vlsfoQty > 0) || (mgoQty && mgoQty > 0))) {
            qty = Math.round(((vlsfoQty || 0) + (mgoQty || 0)) * 1000) / 1000;
          }

          // Check if vessel string contains trailing quantity (e.g. "NORNS - 341.212" or "NORNS -341.212 MT")
          if (!qty || qty === 0) {
            const trailingMatch = vesselStr.match(/[-–—]?\s*(\d+(?:\.\d+)?)\s*(?:MT|M\/T|MTS|KL)?\s*$/i);
            if (trailingMatch) {
              const parsed = parseFloat(trailingMatch[1]);
              if (!isNaN(parsed) && parsed > 0) {
                qty = Math.round(parsed * 1000) / 1000;
              }
            }
          }

          // If quantity column wasn't explicitly found, scan row cells for a likely delivered quantity (10 - 20000 MT)
          if (!qty || qty === 0) {
            for (let colIdx = 0; colIdx < dRow.length; colIdx++) {
              if (colIdx === vesselCol || colIdx === bargeCol || colIdx === dateCol) continue;
              const cellVal = dRow[colIdx];
              if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
                const testNum = cleanNumber(cellVal);
                if (testNum >= 10 && testNum <= 25000 && !String(cellVal).includes('/') && !String(cellVal).includes(':')) {
                  qty = testNum;
                  break;
                }
              }
            }
          }

          const normalizedVessel = normalizeVesselName(vesselStr);
          if (!normalizedVessel) continue;

          const rec: GpsRecord = {
            id: `gps-${allRecords.length + actualSupplyRecords.length + overviewRecords.length + 1}`,
            vesselName: vesselStr,
            normalizedVessel,
            barge: bargeStr,
            quantity: qty && qty > 0 ? qty : undefined,
            vlsfoQty: vlsfoQty && vlsfoQty > 0 ? vlsfoQty : undefined,
            mgoQty: mgoQty && mgoQty > 0 ? mgoQty : undefined,
            date: dateStr,
            sectionSource: qty && qty > 0 ? `Sheet: ${sheetName} (Actual Supply)` : `Sheet: ${sheetName} (Overview)`
          };

          if (qty && qty > 0) {
            actualSupplyRecords.push(rec);
          } else {
            overviewRecords.push(rec);
          }
        }
      }
    }
  }

  // Combine: prioritize actual supply records with verified quantities
  // If actual supply records exist, they are the primary GPS records
  // For any vessel in overview that has no actual supply record, keep the overview record as confirmed
  const actualVesselSet = new Set(actualSupplyRecords.map(r => r.normalizedVessel));

  for (const rec of actualSupplyRecords) {
    allRecords.push(rec);
  }

  for (const rec of overviewRecords) {
    if (!actualVesselSet.has(rec.normalizedVessel)) {
      allRecords.push(rec);
      actualVesselSet.add(rec.normalizedVessel);
    }
  }

  return allRecords;
}

// ============================================================================
// 3. STS BUNKERING / TRACKING REPORT PARSER
// ============================================================================

/**
 * Automatically inspects rows to find the STS Tracking section
 */
export function autoDetectTrackingConfig(rows: unknown[][]): TrackingColumnConfig {
  let bestHeaderRow = -1;
  let bestScore = -1;
  let config: TrackingColumnConfig = {
    headerRow: 0,
    vesselCol: -1,
    bargeCol: -1,
    competitorCol: -1,
    qtyCol: -1,
    dateCol: -1
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let vesselIdx = -1;
    let bargeIdx = -1;
    let compIdx = -1;
    let qtyIdx = -1;
    let dateIdx = -1;
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;

      if (vesselIdx === -1 && matchKeywords(cell, ['vessel', 'receivingvessel', 'vesselname', 'ship', 'buyer', 'client', 'vsl'])) {
        if (!VESSEL_EXCLUDE.some(ex => cleanHeaderStr(cell).includes(ex))) {
          vesselIdx = c;
          score += 10;
        }
      }

      if (bargeIdx === -1 && matchKeywords(cell, ['barge', 'bargename', 'supplybarge', 'stsbarge', 'craft', 'tanker', 'supplyingcraft'])) {
        if (!BARGE_EXCLUDE.some(ex => cleanHeaderStr(cell).includes(ex))) {
          bargeIdx = c;
          score += 8;
        }
      }

      if (compIdx === -1 && matchKeywords(cell, ['competitor', 'company', 'supplier', 'seller', 'operator', 'trader', 'counterparty', 'physicalsupplier', 'bunkercompany', 'vendor', 'charterer'])) {
        compIdx = c;
        score += 12;
      }

      if (qtyIdx === -1 && matchKeywords(cell, ['quantity', 'qty', 'mt', 'metrictons', 'volume', 'deliveredqty', 'bunkeredqty', 'trackingqty'])) {
        if (!QTY_EXCLUDE.some(ex => cleanHeaderStr(cell).includes(ex))) {
          qtyIdx = c;
          score += 6;
        }
      }

      if (dateIdx === -1 && matchKeywords(cell, ['date', 'stsdate', 'operationdate', 'timestamp', 'deliverydate', 'bunkerdate'])) {
        dateIdx = c;
        score += 4;
      }
    }

    if (vesselIdx !== -1 && (bargeIdx !== -1 || compIdx !== -1) && score > bestScore) {
      bestScore = score;
      bestHeaderRow = r;
      config = {
        headerRow: r,
        vesselCol: vesselIdx,
        bargeCol: bargeIdx,
        competitorCol: compIdx,
        qtyCol: qtyIdx,
        dateCol: dateIdx
      };
    }
  }

  return config;
}

/**
 * Parse STS Tracking records using explicit column config
 */
export function parseTrackingWithConfig(rows: unknown[][], config: TrackingColumnConfig): StsTrackingRecord[] {
  const records: StsTrackingRecord[] = [];
  if (!rows || rows.length <= config.headerRow + 1 || config.vesselCol === -1) {
    return records;
  }

  const start = (config.startRow !== undefined && config.startRow > config.headerRow) ? config.startRow : config.headerRow + 1;
  const end = (config.endRow !== undefined && config.endRow < rows.length) ? config.endRow : rows.length - 1;

  for (let r = start; r <= end; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawVessel = row[config.vesselCol];
    if (!rawVessel) continue;
    const vesselStr = String(rawVessel).trim();
    if (vesselStr.length < 2) continue;

    if (matchKeywords(vesselStr, ['total', 'grandtotal', 'average', 'summary', 'subtotal', 'vessel', 'date'])) continue;

    const rawBarge = config.bargeCol !== -1 ? row[config.bargeCol] : '';
    const rawComp = config.competitorCol !== -1 ? row[config.competitorCol] : '';
    const rawQty = config.qtyCol !== -1 ? row[config.qtyCol] : undefined;
    const rawDate = config.dateCol !== -1 ? row[config.dateCol] : undefined;

    const bargeStr = rawBarge ? String(rawBarge).trim() : '';
    const compStr = rawComp ? String(rawComp).trim() : '';
    const qty = rawQty !== undefined && rawQty !== null && rawQty !== '' ? cleanNumber(rawQty) : undefined;
    const dateStr = rawDate ? formatDateStr(rawDate) : '';

    const normalizedVessel = normalizeVesselName(vesselStr);
    if (!normalizedVessel) continue;

    records.push({
      id: `sts-${records.length + 1}`,
      vesselName: vesselStr,
      normalizedVessel,
      barge: bargeStr,
      competitor: compStr,
      quantity: qty && qty > 0 ? qty : undefined,
      date: dateStr
    });
  }

  return records;
}

/**
 * Parse Tracking Report from Workbook
 */
export function parseTrackingReport(workbook: XLSX.WorkBook): StsTrackingRecord[] {
  let records: StsTrackingRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = sheetTo2DArray(sheet);
    if (!rows || rows.length === 0) continue;

    const config = autoDetectTrackingConfig(rows);
    if (config.vesselCol !== -1 && (config.bargeCol !== -1 || config.competitorCol !== -1)) {
      const parsed = parseTrackingWithConfig(rows, config);
      if (parsed.length > 0) {
        records = parsed;
        break;
      }
    }
  }

  return records;
}
