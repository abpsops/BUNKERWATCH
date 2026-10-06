import React, { useState, useEffect, useMemo } from 'react';
import {
  RawReportState,
  EnquiryColumnConfig,
  GpsColumnConfig,
  TrackingColumnConfig,
  EnquiryRecord,
  GpsRecord,
  StsTrackingRecord
} from '../types';
import {
  parseEnquiryWithConfig,
  parseGpsWithConfig,
  parseTrackingWithConfig,
  autoDetectEnquiryConfig,
  autoDetectGpsConfig,
  autoDetectTrackingConfig
} from '../utils/parsers';
import { Sliders, X, Check, Table, CheckSquare, Square, CheckCircle2, ArrowRight } from 'lucide-react';

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'enquiry' | 'gps' | 'tracking' | null;
  rawReport: RawReportState | null;
  onApplyEnquiry: (records: EnquiryRecord[], config: EnquiryColumnConfig) => void;
  onApplyGps: (records: GpsRecord[], config: GpsColumnConfig) => void;
  onApplyTracking: (records: StsTrackingRecord[], config: TrackingColumnConfig) => void;
  onSwitchSheet: (sheetName: string) => void;
}

export const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  reportType,
  rawReport,
  onApplyEnquiry,
  onApplyGps,
  onApplyTracking,
  onSwitchSheet
}) => {
  if (!isOpen || !reportType || !rawReport) return null;

  const rows = rawReport.rows;
  const numRows = rows.length;

  // Local configs
  const [enqConfig, setEnqConfig] = useState<EnquiryColumnConfig>(() => autoDetectEnquiryConfig(rows));
  const [gpsConfig, setGpsConfig] = useState<GpsColumnConfig>(() => autoDetectGpsConfig(rows));
  const [trackingConfig, setTrackingConfig] = useState<TrackingColumnConfig>(() => autoDetectTrackingConfig(rows));

  // Row processing mode: 'all' or 'range'
  const [rowMode, setRowMode] = useState<'all' | 'range'>('all');
  const [customStartRow, setCustomStartRow] = useState<number>(2);
  const [customEndRow, setCustomEndRow] = useState<number>(numRows);

  // Preview display limit: 10, 25, 50, or 'all'
  const [displayLimit, setDisplayLimit] = useState<number | 'all'>('all');

  // Selected Row IDs set (for user selecting/deselecting individual or all rows)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Reset auto-detection when rows or report type changes
  useEffect(() => {
    if (reportType === 'enquiry') setEnqConfig(autoDetectEnquiryConfig(rows));
    if (reportType === 'gps') setGpsConfig(autoDetectGpsConfig(rows));
    if (reportType === 'tracking') setTrackingConfig(autoDetectTrackingConfig(rows));
    setRowMode('all');
    setCustomStartRow(2);
    setCustomEndRow(numRows);
  }, [reportType, rawReport.selectedSheet, rows, numRows]);

  // Current header row columns
  const activeHeaderRowIdx = reportType === 'enquiry'
    ? enqConfig.headerRow
    : reportType === 'gps'
    ? gpsConfig.headerRow
    : trackingConfig.headerRow;

  const headerRow = Array.isArray(rows[activeHeaderRowIdx]) ? rows[activeHeaderRowIdx] : [];
  const columnOptions = headerRow.map((cell, idx) => ({
    colIndex: idx,
    label: cell !== null && cell !== undefined && String(cell).trim() !== ''
      ? `Col ${String.fromCharCode(65 + idx)}: ${String(cell).trim()}`
      : `Col ${String.fromCharCode(65 + idx)}: [Empty Header]`
  }));

  // Effective config with startRow and endRow applied
  const effectiveEnqConfig: EnquiryColumnConfig = useMemo(() => ({
    ...enqConfig,
    startRow: rowMode === 'range' ? customStartRow - 1 : enqConfig.headerRow + 1,
    endRow: rowMode === 'range' ? customEndRow - 1 : rows.length - 1
  }), [enqConfig, rowMode, customStartRow, customEndRow, rows.length]);

  const effectiveGpsConfig: GpsColumnConfig = useMemo(() => ({
    ...gpsConfig,
    startRow: rowMode === 'range' ? customStartRow - 1 : gpsConfig.headerRow + 1,
    endRow: rowMode === 'range' ? customEndRow - 1 : rows.length - 1
  }), [gpsConfig, rowMode, customStartRow, customEndRow, rows.length]);

  const effectiveTrackingConfig: TrackingColumnConfig = useMemo(() => ({
    ...trackingConfig,
    startRow: rowMode === 'range' ? customStartRow - 1 : trackingConfig.headerRow + 1,
    endRow: rowMode === 'range' ? customEndRow - 1 : rows.length - 1
  }), [trackingConfig, rowMode, customStartRow, customEndRow, rows.length]);

  // Parse all records with current config
  const allParsedRecords = useMemo(() => {
    if (reportType === 'enquiry') {
      return parseEnquiryWithConfig(rows, effectiveEnqConfig);
    } else if (reportType === 'gps') {
      return parseGpsWithConfig(rows, effectiveGpsConfig);
    } else {
      return parseTrackingWithConfig(rows, effectiveTrackingConfig);
    }
  }, [reportType, rows, effectiveEnqConfig, effectiveGpsConfig, effectiveTrackingConfig]);

  // Initialize selectedRowIds to include ALL parsed rows whenever allParsedRecords changes
  useEffect(() => {
    setSelectedRowIds(new Set(allParsedRecords.map(r => r.id)));
  }, [allParsedRecords]);

  // Display slice
  const displayedRecords = useMemo(() => {
    if (displayLimit === 'all') return allParsedRecords;
    return allParsedRecords.slice(0, displayLimit);
  }, [allParsedRecords, displayLimit]);

  // Selection handlers
  const handleSelectAllRows = () => {
    setSelectedRowIds(new Set(allParsedRecords.map(r => r.id)));
  };

  const handleDeselectAllRows = () => {
    setSelectedRowIds(new Set());
  };

  const handleToggleRow = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = allParsedRecords.length > 0 && selectedRowIds.size === allParsedRecords.length;

  // Selected metrics
  const selectedCount = selectedRowIds.size;
  const totalQuantitySelected = useMemo(() => {
    if (reportType === 'enquiry') {
      return (allParsedRecords as EnquiryRecord[])
        .filter(r => selectedRowIds.has(r.id))
        .reduce((sum, r) => sum + r.totalEnquiryQty, 0);
    } else if (reportType === 'gps') {
      return (allParsedRecords as GpsRecord[])
        .filter(r => selectedRowIds.has(r.id))
        .reduce((sum, r) => sum + (r.quantity || 0), 0);
    } else {
      return (allParsedRecords as StsTrackingRecord[])
        .filter(r => selectedRowIds.has(r.id))
        .reduce((sum, r) => sum + (r.quantity || 0), 0);
    }
  }, [allParsedRecords, selectedRowIds, reportType]);

  const handleApply = () => {
    if (reportType === 'enquiry') {
      const filtered = (allParsedRecords as EnquiryRecord[]).filter(r => selectedRowIds.has(r.id));
      onApplyEnquiry(filtered, effectiveEnqConfig);
    } else if (reportType === 'gps') {
      const filtered = (allParsedRecords as GpsRecord[]).filter(r => selectedRowIds.has(r.id));
      onApplyGps(filtered, effectiveGpsConfig);
    } else {
      const filtered = (allParsedRecords as StsTrackingRecord[]).filter(r => selectedRowIds.has(r.id));
      onApplyTracking(filtered, effectiveTrackingConfig);
    }
    onClose();
  };

  const getTitle = () => {
    if (reportType === 'enquiry') return 'ENQUIRY DATA — COLUMN MAPPING & ROW SELECTION';
    if (reportType === 'gps') return 'FLOW / GPS REPORT — COLUMN MAPPING & ROW SELECTION';
    return 'STS BUNKERING TRACKING — COLUMN MAPPING & ROW SELECTION';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy-900/60 backdrop-blur-sm">
      <div className="glass rounded-xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 border-b border-ink-700 flex items-center justify-between bg-ink-900">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-700 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-paper-100">
                {getTitle()}
              </h2>
              <p className="text-[11px] text-paper-500">
                File: <span className="font-mono text-paper-300">{rawReport.fileName}</span> &bull; {numRows} rows in sheet
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

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Top Controls: Sheet Selector, Header Row Selector & Row Range */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-ink-900 p-3 rounded-lg border border-ink-700">
            {/* Sheet Selector */}
            <div>
              <label className="block text-paper-500 font-semibold mb-1">
                Select Worksheet / Tab:
              </label>
              <select
                value={rawReport.selectedSheet}
                onChange={(e) => onSwitchSheet(e.target.value)}
                className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              >
                {rawReport.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Header Row Index */}
            <div>
              <label className="block text-paper-500 font-semibold mb-1">
                Header Row (where titles are):
              </label>
              <select
                value={activeHeaderRowIdx}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (reportType === 'enquiry') setEnqConfig({ ...enqConfig, headerRow: val });
                  if (reportType === 'gps') setGpsConfig({ ...gpsConfig, headerRow: val });
                  if (reportType === 'tracking') setTrackingConfig({ ...trackingConfig, headerRow: val });
                }}
                className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              >
                {Array.from({ length: Math.min(numRows, 40) }, (_, i) => {
                  const sampleCells = Array.isArray(rows[i]) ? rows[i].filter(Boolean).slice(0, 4).join(' | ') : '';
                  return (
                    <option key={i} value={i}>
                      Row {i + 1}: {sampleCells.slice(0, 45) || '[Empty Row]'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Data Rows Option (Select All Rows vs Custom Range) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-paper-500 font-semibold">
                  Data Rows to Process:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRowMode('all');
                    handleSelectAllRows();
                  }}
                  className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-700 border border-blue-500/40 text-[10px] font-bold transition flex items-center space-x-1"
                  title="Include and select all rows in worksheet"
                >
                  <CheckCircle2 className="w-3 h-3 text-blue-700" />
                  <span>Select All Rows</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 pt-1 text-xs">
                <label className="inline-flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    name="rowMode"
                    checked={rowMode === 'all'}
                    onChange={() => setRowMode('all')}
                    className="text-blue-600 focus:ring-0"
                  />
                  <span className="text-paper-100">All Rows ({activeHeaderRowIdx + 2} - {numRows})</span>
                </label>
                <label className="inline-flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    name="rowMode"
                    checked={rowMode === 'range'}
                    onChange={() => setRowMode('range')}
                    className="text-blue-600 focus:ring-0"
                  />
                  <span className="text-paper-300">Custom Range</span>
                </label>
              </div>

              {rowMode === 'range' && (
                <div className="flex items-center space-x-1.5 mt-2">
                  <span className="text-paper-500 text-[10px]">Row:</span>
                  <input
                    type="number"
                    min={activeHeaderRowIdx + 2}
                    max={numRows}
                    value={customStartRow}
                    onChange={(e) => setCustomStartRow(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 px-1.5 py-1 bg-white border border-ink-600 rounded text-center text-paper-100 font-mono text-xs"
                  />
                  <span className="text-paper-500 text-[10px]">to:</span>
                  <input
                    type="number"
                    min={customStartRow}
                    max={numRows}
                    value={customEndRow}
                    onChange={(e) => setCustomEndRow(Math.max(1, parseInt(e.target.value, 10) || numRows))}
                    className="w-16 px-1.5 py-1 bg-white border border-ink-600 rounded text-center text-paper-100 font-mono text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Column Mappings Configuration */}
          <div>
            <div className="text-[11px] font-bold text-paper-300 mb-2 flex items-center justify-between">
              <span>Map Table Columns to Market Analyzer Fields</span>
              <span className="text-blue-700 font-normal">Auto-detected best matches</span>
            </div>

            {/* ENQUIRY FIELDS */}
            {reportType === 'enquiry' && (
              <div className="space-y-3 bg-ink-900 p-3 rounded-lg border border-ink-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Vessel Name Column <span className="text-rose-700">*</span>
                    </label>
                    <select
                      value={enqConfig.vesselCol}
                      onChange={(e) => setEnqConfig({ ...enqConfig, vesselCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- None --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Date Column
                    </label>
                    <select
                      value={enqConfig.dateCol}
                      onChange={(e) => setEnqConfig({ ...enqConfig, dateCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- None --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3 Fuel Grades & Quantities */}
                <div className="pt-2 border-t border-ink-700 space-y-2">
                  <div className="text-[11px] font-semibold text-blue-700">
                    All 3 Fuel Grades and Quantities (Parsed &amp; Summed):
                  </div>

                  {/* Fuel 1 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5">Fuel 1: Grade / Product Name</label>
                      <select
                        value={enqConfig.fuel1GradeCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel1GradeCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs"
                      >
                        <option value={-1}>-- None / Fixed Name --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5 font-bold text-paper-100">Fuel 1: Quantity (MT)</label>
                      <select
                        value={enqConfig.fuel1QtyCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel1QtyCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs font-semibold"
                      >
                        <option value={-1}>-- None --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Fuel 2 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5">Fuel 2: Grade / Product Name</label>
                      <select
                        value={enqConfig.fuel2GradeCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel2GradeCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs"
                      >
                        <option value={-1}>-- None / Fixed Name --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5 font-bold text-paper-100">Fuel 2: Quantity (MT)</label>
                      <select
                        value={enqConfig.fuel2QtyCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel2QtyCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs font-semibold"
                      >
                        <option value={-1}>-- None --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Fuel 3 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5">Fuel 3: Grade / Product Name</label>
                      <select
                        value={enqConfig.fuel3GradeCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel3GradeCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs"
                      >
                        <option value={-1}>-- None / Fixed Name --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-paper-500 text-[10px] mb-0.5 font-bold text-paper-100">Fuel 3: Quantity (MT)</label>
                      <select
                        value={enqConfig.fuel3QtyCol}
                        onChange={(e) => setEnqConfig({ ...enqConfig, fuel3QtyCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-ink-600 rounded px-2 py-1 text-paper-100 font-mono text-xs font-semibold"
                      >
                        <option value={-1}>-- None --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FLOW / GPS FIELDS */}
            {reportType === 'gps' && (
              <div className="space-y-3 bg-ink-900 p-3.5 rounded-lg border border-ink-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Vessel Name Column <span className="text-rose-700">*</span>
                    </label>
                    <select
                      value={gpsConfig.vesselCol}
                      onChange={(e) => setGpsConfig({ ...gpsConfig, vesselCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- None --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Barge Name Column <span className="text-paper-500 font-normal">(Optional)</span>
                    </label>
                    <select
                      value={gpsConfig.bargeCol}
                      onChange={(e) => setGpsConfig({ ...gpsConfig, bargeCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- None / Not in Sheet --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Actual Supply Quantities for VLSFO and MGO */}
                <div className="pt-2.5 border-t border-ink-700">
                  <div className="text-[11px] font-semibold text-emerald-700 mb-2">
                    Actual Supply Quantities (MT) — Separate VLSFO &amp; MGO:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-blue-700 font-semibold mb-1">
                        Actual Supply VLSFO (MT) Column
                      </label>
                      <select
                        value={gpsConfig.vlsfoQtyCol !== undefined ? gpsConfig.vlsfoQtyCol : -1}
                        onChange={(e) => setGpsConfig({ ...gpsConfig, vlsfoQtyCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-blue-200 rounded px-2.5 py-1.5 text-blue-200 font-mono text-xs font-medium"
                      >
                        <option value={-1}>-- None --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-cyan-700 font-semibold mb-1">
                        Actual Supply MGO (MT) Column
                      </label>
                      <select
                        value={gpsConfig.mgoQtyCol !== undefined ? gpsConfig.mgoQtyCol : -1}
                        onChange={(e) => setGpsConfig({ ...gpsConfig, mgoQtyCol: parseInt(e.target.value, 10) })}
                        className="w-full bg-white border border-cyan-200 rounded px-2.5 py-1.5 text-cyan-200 font-mono text-xs font-medium"
                      >
                        <option value={-1}>-- None --</option>
                        {columnOptions.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Total Supply Quantity (MT) Column <span className="text-paper-500 font-normal">(Optional if VLSFO/MGO mapped)</span>
                    </label>
                    <select
                      value={gpsConfig.qtyCol}
                      onChange={(e) => setGpsConfig({ ...gpsConfig, qtyCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- Auto Sum (VLSFO + MGO) --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-paper-300 font-semibold mb-1">
                      Supply Date Column <span className="text-paper-500 font-normal">(Optional)</span>
                    </label>
                    <select
                      value={gpsConfig.dateCol}
                      onChange={(e) => setGpsConfig({ ...gpsConfig, dateCol: parseInt(e.target.value, 10) })}
                      className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                    >
                      <option value={-1}>-- None --</option>
                      {columnOptions.map((c) => (
                        <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TRACKING FIELDS */}
            {reportType === 'tracking' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-ink-900 p-3 rounded-lg border border-ink-700">
                <div>
                  <label className="block text-paper-300 font-semibold mb-1">
                    Vessel Name Column <span className="text-rose-700">*</span>
                  </label>
                  <select
                    value={trackingConfig.vesselCol}
                    onChange={(e) => setTrackingConfig({ ...trackingConfig, vesselCol: parseInt(e.target.value, 10) })}
                    className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                  >
                    <option value={-1}>-- None --</option>
                    {columnOptions.map((c) => (
                      <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-paper-300 font-semibold mb-1">
                    Barge Name Column
                  </label>
                  <select
                    value={trackingConfig.bargeCol}
                    onChange={(e) => setTrackingConfig({ ...trackingConfig, bargeCol: parseInt(e.target.value, 10) })}
                    className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                  >
                    <option value={-1}>-- None --</option>
                    {columnOptions.map((c) => (
                      <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-paper-300 font-semibold mb-1">
                    Competitor / Company Name Column
                  </label>
                  <select
                    value={trackingConfig.competitorCol}
                    onChange={(e) => setTrackingConfig({ ...trackingConfig, competitorCol: parseInt(e.target.value, 10) })}
                    className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                  >
                    <option value={-1}>-- None --</option>
                    {columnOptions.map((c) => (
                      <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-paper-300 font-semibold mb-1">
                    Tracking Quantity (MT) Column
                  </label>
                  <select
                    value={trackingConfig.qtyCol}
                    onChange={(e) => setTrackingConfig({ ...trackingConfig, qtyCol: parseInt(e.target.value, 10) })}
                    className="w-full bg-white border border-ink-600 rounded px-2.5 py-1.5 text-paper-100 font-mono text-xs"
                  >
                    <option value={-1}>-- None --</option>
                    {columnOptions.map((c) => (
                      <option key={c.colIndex} value={c.colIndex}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* LIVE DATA PREVIEW & ROW SELECTION TABLE */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center space-x-2">
                <Table className="w-3.5 h-3.5 text-emerald-700" />
                <span className="font-bold text-paper-100 text-[11px]">
                  Live Extraction &amp; Row Selection
                </span>
                <span className="text-[11px] text-emerald-700 font-mono font-semibold">
                  ({allParsedRecords.length} records parsed from sheet)
                </span>
              </div>

              {/* Row Select All & Deselect Options + Display Limit */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Select All Rows Button */}
                <button
                  type="button"
                  onClick={handleSelectAllRows}
                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] flex items-center space-x-1 shadow-sm transition"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Select All ({allParsedRecords.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeselectAllRows}
                  className="px-2 py-1 rounded bg-ink-800 hover:bg-ink-700 text-paper-300 border border-ink-600 text-[11px] transition"
                >
                  Deselect All
                </button>

                {/* Display limit switcher */}
                <div className="inline-flex bg-ink-900 p-0.5 rounded border border-ink-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(10)}
                    className={`px-1.5 py-0.5 rounded ${displayLimit === 10 ? 'bg-ink-800 text-paper-100 font-bold' : 'text-paper-500'}`}
                  >
                    10
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(50)}
                    className={`px-1.5 py-0.5 rounded ${displayLimit === 50 ? 'bg-ink-800 text-paper-100 font-bold' : 'text-paper-500'}`}
                  >
                    50
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit('all')}
                    className={`px-2 py-0.5 rounded ${displayLimit === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-paper-500'}`}
                  >
                    All ({allParsedRecords.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Selection Summary Pill */}
            <div className="bg-ink-900 px-3 py-1.5 rounded-lg border border-ink-700 mb-2 flex flex-wrap items-center justify-between text-[11px] text-paper-300">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-paper-100">
                  Selected for Reconciliation:
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {selectedCount} of {allParsedRecords.length} rows
                </span>
                {totalQuantitySelected > 0 && (
                  <span className="text-paper-500">
                    &bull; Volume: <span className="font-mono font-bold text-paper-100">{totalQuantitySelected.toLocaleString()} MT</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-paper-500">
                Check / uncheck any row to include or exclude it from the reconciliation
              </span>
            </div>

            {allParsedRecords.length === 0 ? (
              <div className="p-8 bg-ink-900 border border-dashed border-ink-700 rounded-lg text-center text-paper-500">
                No records could be parsed with current column selection. Please ensure the Vessel Name Column is set.
              </div>
            ) : (
              <div className="overflow-x-auto border border-ink-700 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-ink-900 border-b border-ink-700 text-paper-500 sticky top-0 z-10">
                    <tr>
                      {/* Select All Checkbox */}
                      <th className="py-2 px-3 w-8">
                        <button
                          type="button"
                          onClick={() => {
                            if (isAllSelected) handleDeselectAllRows();
                            else handleSelectAllRows();
                          }}
                          className="text-paper-500 hover:text-paper-100 flex items-center"
                          title={isAllSelected ? 'Deselect all rows' : 'Select all rows'}
                        >
                          {isAllSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-700" />
                          ) : (
                            <Square className="w-4 h-4 text-paper-500" />
                          )}
                        </button>
                      </th>
                      <th className="py-2 px-2 w-10">#</th>
                      {reportType === 'enquiry' && (
                        <>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Vessel</th>
                          <th className="py-2 px-3 text-right">Fuel 1</th>
                          <th className="py-2 px-3 text-right">Fuel 2</th>
                          <th className="py-2 px-3 text-right">Fuel 3</th>
                          <th className="py-2 px-3 text-right font-bold text-paper-100">Total Enquiry Qty (MT)</th>
                        </>
                      )}
                      {reportType === 'gps' && (
                        <>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Vessel</th>
                          <th className="py-2 px-3">Barge</th>
                          <th className="py-2 px-3 text-right text-blue-700">VLSFO Qty (MT)</th>
                          <th className="py-2 px-3 text-right text-cyan-700">MGO Qty (MT)</th>
                          <th className="py-2 px-3 text-right font-bold text-paper-100">Total Supply Qty (MT)</th>
                        </>
                      )}
                      {reportType === 'tracking' && (
                        <>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Vessel</th>
                          <th className="py-2 px-3">Barge</th>
                          <th className="py-2 px-3">Competitor</th>
                          <th className="py-2 px-3 text-right">Tracking Qty (MT)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700 bg-white font-mono">
                    {displayedRecords.map((rec, i) => {
                      const isChecked = selectedRowIds.has(rec.id);
                      return (
                        <tr
                          key={rec.id}
                          onClick={() => handleToggleRow(rec.id)}
                          className={`hover:bg-ink-800/40 cursor-pointer transition ${
                            isChecked ? '' : 'opacity-40 bg-ink-900'
                          }`}
                        >
                          {/* Row Checkbox */}
                          <td className="py-1.5 px-3">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-700" />
                            ) : (
                              <Square className="w-4 h-4 text-paper-500" />
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-paper-500 text-[10px]">{i + 1}</td>

                          {reportType === 'enquiry' && (
                            <>
                              <td className="py-1.5 px-3 text-paper-500">{(rec as EnquiryRecord).date || '—'}</td>
                              <td className="py-1.5 px-3 font-sans font-bold text-paper-100">{(rec as EnquiryRecord).vesselName}</td>
                              <td className="py-1.5 px-3 text-right text-paper-300">
                                {(rec as EnquiryRecord).qty1 > 0 ? `${(rec as EnquiryRecord).qty1} MT` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right text-paper-300">
                                {(rec as EnquiryRecord).qty2 > 0 ? `${(rec as EnquiryRecord).qty2} MT` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right text-paper-300">
                                {(rec as EnquiryRecord).qty3 > 0 ? `${(rec as EnquiryRecord).qty3} MT` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                                {(rec as EnquiryRecord).totalEnquiryQty.toLocaleString()} MT
                              </td>
                            </>
                          )}

                          {reportType === 'gps' && (
                            <>
                              <td className="py-1.5 px-3 text-paper-500">{(rec as GpsRecord).date || '—'}</td>
                              <td className="py-1.5 px-3 font-sans font-bold text-paper-100">{(rec as GpsRecord).vesselName}</td>
                              <td className="py-1.5 px-3 text-paper-300">{(rec as GpsRecord).barge || '—'}</td>
                              <td className="py-1.5 px-3 text-right text-blue-700 font-semibold">
                                {(rec as GpsRecord).vlsfoQty !== undefined ? `${(rec as GpsRecord).vlsfoQty?.toLocaleString()} MT` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right text-cyan-700 font-semibold">
                                {(rec as GpsRecord).mgoQty !== undefined ? `${(rec as GpsRecord).mgoQty?.toLocaleString()} MT` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                                {(rec as GpsRecord).quantity ? `${(rec as GpsRecord).quantity?.toLocaleString()} MT` : '—'}
                              </td>
                            </>
                          )}

                          {reportType === 'tracking' && (
                            <>
                              <td className="py-1.5 px-3 text-paper-500">{(rec as StsTrackingRecord).date || '—'}</td>
                              <td className="py-1.5 px-3 font-sans font-bold text-paper-100">{(rec as StsTrackingRecord).vesselName}</td>
                              <td className="py-1.5 px-3 text-paper-300">{(rec as StsTrackingRecord).barge || '—'}</td>
                              <td className="py-1.5 px-3 text-amber-700 font-sans font-semibold">{(rec as StsTrackingRecord).competitor || '—'}</td>
                              <td className="py-1.5 px-3 text-right font-bold text-paper-100">
                                {(rec as StsTrackingRecord).quantity ? `${(rec as StsTrackingRecord).quantity?.toLocaleString()} MT` : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {displayedRecords.length < allParsedRecords.length && (
              <div className="mt-2 text-center text-paper-500 text-[10px]">
                Showing first {displayedRecords.length} of {allParsedRecords.length} parsed records.{' '}
                <button
                  type="button"
                  onClick={() => setDisplayLimit('all')}
                  className="text-blue-700 hover:underline font-semibold ml-1"
                >
                  Click here to show all {allParsedRecords.length} rows
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-ink-700 bg-ink-900 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-ink-600 text-paper-300 hover:bg-ink-800 transition"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-paper-500 font-mono hidden sm:inline">
              <span className="text-paper-100 font-bold">{selectedCount}</span> rows will be applied
            </span>

            <button
              type="button"
              onClick={handleApply}
              disabled={selectedCount === 0}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold flex items-center space-x-1.5 shadow-md transition"
            >
              <Check className="w-4 h-4" />
              <span>Apply {selectedCount} Selected Rows &amp; Reconcile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
