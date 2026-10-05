import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ReconciledRecord, ReconciliationStatus } from '../types';
import { exportReconciliationToExcel, exportReconciliationToCSV } from '../utils/exportUtils';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Fuel,
  ArrowUpDown,
  CheckSquare,
  Square,
  Download,
  X,
  SlidersHorizontal,
  CheckCircle2,
  UserX,
  HelpCircle
} from 'lucide-react';

interface MainReconciliationTableProps {
  records: ReconciledRecord[];
}

export const MainReconciliationTable: React.FC<MainReconciliationTableProps> = ({ records }) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReconciliationStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'date' | 'vesselName' | 'enquiryQty' | 'vlsfoQty' | 'mgoQty' | 'status'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterSelectedOnly, setFilterSelectedOnly] = useState<boolean>(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (filterSelectedOnly && !selectedIds.has(r.id)) return false;
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchVessel = r.vesselName.toLowerCase().includes(q);
          const matchBarge = r.barge.toLowerCase().includes(q);
          const matchComp = r.competitor.toLowerCase().includes(q);
          if (!matchVessel && !matchBarge && !matchComp) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'date') {
          cmp = (a.date || '').localeCompare(b.date || '');
        } else if (sortField === 'vesselName') {
          cmp = a.vesselName.localeCompare(b.vesselName);
        } else if (sortField === 'enquiryQty') {
          cmp = a.enquiryQty - b.enquiryQty;
        } else if (sortField === 'vlsfoQty') {
          cmp = a.vlsfoQty - b.vlsfoQty;
        } else if (sortField === 'mgoQty') {
          cmp = a.mgoQty - b.mgoQty;
        } else if (sortField === 'status') {
          cmp = a.status.localeCompare(b.status);
        }
        return sortAsc ? cmp : -cmp;
      });
  }, [records, statusFilter, searchQuery, sortField, sortAsc, filterSelectedOnly, selectedIds]);

  const handleSort = (field: 'date' | 'vesselName' | 'enquiryQty' | 'vlsfoQty' | 'mgoQty' | 'status') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const countByStatus = useMemo(() => {
    let gps = 0;
    let comp = 0;
    let unv = 0;
    records.forEach(r => {
      if (r.status === 'GPS MATCHED') gps++;
      else if (r.status === 'COMPETITOR MATCHED') comp++;
      else unv++;
    });
    return { all: records.length, gps, comp, unv };
  }, [records]);

  // Selection handlers
  const isAllFilteredSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.has(r.id));
  const isSomeFilteredSelected = filteredRecords.some(r => selectedIds.has(r.id)) && !isAllFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeFilteredSelected;
    }
  }, [isSomeFilteredSelected]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Deselect currently filtered rows
      const next = new Set(selectedIds);
      filteredRecords.forEach(r => next.delete(r.id));
      setSelectedIds(next);
      if (filterSelectedOnly && next.size === 0) {
        setFilterSelectedOnly(false);
      }
    } else {
      // Select all currently filtered rows
      const next = new Set(selectedIds);
      filteredRecords.forEach(r => next.add(r.id));
      setSelectedIds(next);
    }
  };

  const handleToggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      if (filterSelectedOnly && next.size === 0) {
        setFilterSelectedOnly(false);
      }
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setFilterSelectedOnly(false);
  };

  // Selected records stats
  const selectedRecords = useMemo(() => {
    return records.filter(r => selectedIds.has(r.id));
  }, [records, selectedIds]);

  const selectedStats = useMemo(() => {
    let enquiry = 0;
    let vlsfo = 0;
    let mgo = 0;
    let gps = 0;
    let comp = 0;
    let unv = 0;

    for (const r of selectedRecords) {
      enquiry += r.enquiryQty;
      vlsfo += r.vlsfoQty;
      mgo += r.mgoQty;
      if (r.status === 'GPS MATCHED') gps += r.enquiryQty;
      else if (r.status === 'COMPETITOR MATCHED') comp += r.enquiryQty;
      else unv += r.enquiryQty;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      count: selectedRecords.length,
      enquiry: round(enquiry),
      vlsfo: round(vlsfo),
      mgo: round(mgo),
      gps: round(gps),
      comp: round(comp),
      unv: round(unv)
    };
  }, [selectedRecords]);

  return (
    <div className="glass rounded-xl shadow-sm overflow-hidden mb-6">
      {/* Table Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-ink-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-paper-100">
              Main Reconciliation Table
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/20 font-mono">
              {records.length} Total Enquiries
            </span>
          </div>
          <p className="text-xs text-paper-500 mt-0.5">
            Enquiry vessel matching against Flow/GPS and STS Bunkering reports with VLSFO &amp; MGO separation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Tabs */}
          <div className="inline-flex bg-ink-900 p-1 rounded-lg border border-ink-700 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                statusFilter === 'ALL'
                  ? 'bg-ink-800 text-paper-100 shadow-sm'
                  : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              All ({countByStatus.all})
            </button>
            <button
              onClick={() => setStatusFilter('GPS MATCHED')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                statusFilter === 'GPS MATCHED'
                  ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                  : 'text-paper-500 hover:text-emerald-700'
              }`}
            >
              GPS Matched ({countByStatus.gps})
            </button>
            <button
              onClick={() => setStatusFilter('COMPETITOR MATCHED')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                statusFilter === 'COMPETITOR MATCHED'
                  ? 'bg-amber-100 text-amber-700 shadow-sm'
                  : 'text-paper-500 hover:text-amber-700'
              }`}
            >
              Competitor ({countByStatus.comp})
            </button>
            <button
              onClick={() => setStatusFilter('UNVERIFIED')}
              className={`px-3 py-1 rounded-md transition font-medium ${
                statusFilter === 'UNVERIFIED'
                  ? 'bg-ink-800 text-paper-300 shadow-sm'
                  : 'text-paper-500 hover:text-paper-100'
              }`}
            >
              Unverified ({countByStatus.unv})
            </button>
          </div>

          {/* Quick Select All Button */}
          <button
            onClick={handleToggleSelectAll}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center space-x-1.5 ${
              isAllFilteredSelected
                ? 'bg-blue-600/20 border-blue-500 text-blue-700'
                : 'bg-ink-900 border-ink-700 text-paper-300 hover:bg-ink-800 hover:text-paper-100'
            }`}
            title={isAllFilteredSelected ? 'Deselect visible rows' : 'Select all visible rows'}
          >
            {isAllFilteredSelected ? (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-blue-700" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5 text-paper-500" />
                <span>Select All ({filteredRecords.length})</span>
              </>
            )}
          </button>

          {/* Search box */}
          <div className="relative w-full sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-paper-500" />
            <input
              type="text"
              placeholder="Search vessel / barge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-ink-900 border border-ink-700 text-xs text-paper-100 placeholder-paper-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Selected Rows Action & Summary Banner */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-paper-100">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="font-bold text-paper-100">
                {selectedStats.count} row{selectedStats.count === 1 ? '' : 's'} selected
              </span>
            </div>
            <div className="h-4 w-px bg-blue-100 hidden sm:block" />
            <div className="flex items-center space-x-3 text-paper-300 font-mono text-[11px]">
              <div>
                <span className="text-paper-500 font-sans">Total: </span>
                <span className="font-bold text-paper-100">{selectedStats.enquiry.toLocaleString()} MT</span>
              </div>
              <div>
                <span className="text-paper-500 font-sans">VLSFO: </span>
                <span className="font-bold text-blue-700">{selectedStats.vlsfo.toLocaleString()} MT</span>
              </div>
              <div>
                <span className="text-paper-500 font-sans">MGO: </span>
                <span className="font-bold text-cyan-700">{selectedStats.mgo.toLocaleString()} MT</span>
              </div>
              <div className="hidden lg:inline-flex items-center space-x-1.5 text-emerald-700">
                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                <span>GPS: {selectedStats.gps.toLocaleString()} MT</span>
              </div>
              <div className="hidden lg:inline-flex items-center space-x-1.5 text-amber-700">
                <UserX className="w-3 h-3 text-amber-700" />
                <span>Comp: {selectedStats.comp.toLocaleString()} MT</span>
              </div>
              <div className="hidden lg:inline-flex items-center space-x-1.5 text-paper-500">
                <HelpCircle className="w-3 h-3 text-paper-500" />
                <span>Unv: {selectedStats.unv.toLocaleString()} MT</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setFilterSelectedOnly(!filterSelectedOnly)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center space-x-1 ${
                filterSelectedOnly
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-ink-600 text-paper-300 hover:text-paper-100'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{filterSelectedOnly ? 'Show All Rows' : 'Show Only Selected'}</span>
            </button>
            <button
              onClick={() => exportReconciliationToExcel(selectedRecords)}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition flex items-center space-x-1 shadow-sm"
              title="Export selected rows to Excel"
            >
              <Download className="w-3 h-3" />
              <span>Export Selected</span>
            </button>
            <button
              onClick={handleClearSelection}
              className="p-1 rounded text-paper-500 hover:text-paper-100 hover:bg-ink-800 transition"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table Data */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-900 border-b border-ink-700 text-paper-500 font-semibold text-[11px]">
            <tr>
              {/* Select All Checkbox Column */}
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  ref={selectAllRef}
                  checked={isAllFilteredSelected}
                  onChange={handleToggleSelectAll}
                  aria-label="Select all rows"
                  className="rounded border-ink-600 bg-white text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer accent-blue-600"
                />
              </th>
              <th
                onClick={() => handleSort('date')}
                className="py-3 px-3 cursor-pointer hover:text-paper-100 whitespace-nowrap"
              >
                <div className="flex items-center space-x-1">
                  <span>Date</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort('vesselName')}
                className="py-3 px-3 cursor-pointer hover:text-paper-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Vessel</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort('enquiryQty')}
                className="py-3 px-3 text-right cursor-pointer hover:text-paper-100 whitespace-nowrap"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Total Enquiry (MT)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort('vlsfoQty')}
                className="py-3 px-3 text-right cursor-pointer hover:text-blue-700 text-blue-700 whitespace-nowrap"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>VLSFO (MT)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th
                onClick={() => handleSort('mgoQty')}
                className="py-3 px-3 text-right cursor-pointer hover:text-cyan-700 text-cyan-700 whitespace-nowrap"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>MGO (MT)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
              <th className="py-3 px-3 text-right whitespace-nowrap">GPS Qty (MT)</th>
              <th className="py-3 px-3">Barge</th>
              <th className="py-3 px-3">Competitor</th>
              <th
                onClick={() => handleSort('status')}
                className="py-3 px-3 cursor-pointer hover:text-paper-100"
              >
                <div className="flex items-center space-x-1">
                  <span>Status</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 font-medium">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-paper-500 italic">
                  No reconciliation records found matching criteria.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const isExpanded = expandedId === r.id;
                const isSelected = selectedIds.has(r.id);

                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      className={`hover:bg-ink-800/40 transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50'
                          : r.status === 'GPS MATCHED'
                          ? 'bg-emerald-50'
                          : r.status === 'COMPETITOR MATCHED'
                          ? 'bg-amber-50'
                          : ''
                      }`}
                    >
                      {/* Checkbox column */}
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => handleToggleRow(r.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          aria-label={`Select row for ${r.vesselName}`}
                          className="rounded border-ink-600 bg-white text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer accent-blue-600"
                        />
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-paper-300 font-mono whitespace-nowrap">
                        {r.date || '—'}
                      </td>

                      {/* Vessel */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-paper-100 flex items-center space-x-1.5">
                          <span>{r.vesselName}</span>
                          {r.fuelDetails.length > 0 && (
                            <span className="text-[10px] text-paper-500 bg-ink-800 px-1 rounded flex items-center space-x-0.5 shrink-0">
                              <Fuel className="w-2.5 h-2.5" />
                              <span>{r.fuelDetails.length} fuels</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Total Enquiry Qty */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-paper-100 whitespace-nowrap">
                        {r.enquiryQty.toLocaleString()}
                      </td>

                      {/* VLSFO Qty */}
                      <td className="py-3 px-3 text-right font-mono text-blue-700 font-semibold whitespace-nowrap">
                        {r.vlsfoQty > 0 ? (
                          <span>{r.vlsfoQty.toLocaleString()}</span>
                        ) : (
                          <span className="text-paper-500 font-normal">0</span>
                        )}
                      </td>

                      {/* MGO Qty */}
                      <td className="py-3 px-3 text-right font-mono text-cyan-700 font-semibold whitespace-nowrap">
                        {r.mgoQty > 0 ? (
                          <span>{r.mgoQty.toLocaleString()}</span>
                        ) : (
                          <span className="text-paper-500 font-normal">0</span>
                        )}
                      </td>

                      {/* GPS Qty */}
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {r.status === 'GPS MATCHED' ? (
                          r.gpsQty !== null ? (
                            <div>
                              <div className="flex items-center justify-end space-x-1">
                                <span className="text-emerald-700 font-bold">{r.gpsQty.toLocaleString()}</span>
                                {r.matchDelta !== null && r.matchDelta !== 0 && (
                                  <span className={`text-[10px] ${r.matchDelta > 0 ? 'text-emerald-700' : 'text-paper-500'}`}>
                                    ({r.matchDelta > 0 ? `+${r.matchDelta}` : r.matchDelta})
                                  </span>
                                )}
                              </div>
                              {((r.gpsVlsfoQty !== undefined && r.gpsVlsfoQty !== null) ||
                                (r.gpsMgoQty !== undefined && r.gpsMgoQty !== null)) && (
                                <div className="text-[10px] text-paper-500 font-mono mt-0.5 space-x-1.5 flex items-center justify-end">
                                  {r.gpsVlsfoQty ? <span className="text-blue-700">V:{r.gpsVlsfoQty.toLocaleString()}</span> : null}
                                  {r.gpsMgoQty ? <span className="text-cyan-700">M:{r.gpsMgoQty.toLocaleString()}</span> : null}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-700 italic">Confirmed</span>
                          )
                        ) : (
                          <span className="text-paper-500">—</span>
                        )}
                      </td>

                      {/* Barge */}
                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        {r.status === 'UNVERIFIED' ? (
                          <span className="text-paper-500">—</span>
                        ) : (
                          <span className={r.status === 'GPS MATCHED' ? 'text-emerald-300' : 'text-amber-300'}>
                            {r.barge || '—'}
                          </span>
                        )}
                      </td>

                      {/* Competitor */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {r.status === 'COMPETITOR MATCHED' ? (
                          <span className="text-amber-700 font-semibold">{r.competitor || 'Unknown Competitor'}</span>
                        ) : (
                          <span className="text-paper-500">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {r.status === 'GPS MATCHED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/25">
                            GPS MATCHED
                          </span>
                        )}
                        {r.status === 'COMPETITOR MATCHED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/25">
                            COMPETITOR MATCHED
                          </span>
                        )}
                        {r.status === 'UNVERIFIED' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-ink-800 text-paper-500 border border-ink-600">
                            UNVERIFIED
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Fuel Grades Breakdown Drawer when clicked */}
                    {isExpanded && (
                      <tr className="bg-ink-900 text-xs">
                        <td colSpan={10} className="py-3 px-6 border-y border-ink-700">
                          <div className="flex flex-wrap items-center gap-4 text-paper-300">
                            <span className="font-semibold text-paper-500 text-[10px]">
                              Enquiry Fuel Grade Breakdown:
                            </span>
                            {r.fuelDetails.length > 0 ? (
                              r.fuelDetails.map((f, idx) => (
                                <div key={idx} className="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded border border-ink-700">
                                  <span className={`font-medium ${f.category === 'VLSFO' ? 'text-blue-700' : f.category === 'MGO' ? 'text-cyan-700' : 'text-purple-700'}`}>
                                    {f.grade}:
                                  </span>
                                  <span className="font-bold text-paper-100 font-mono">{f.qty.toLocaleString()} MT</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-paper-500 italic">No individual fuel details</span>
                            )}
                            <div className="ml-auto flex items-center space-x-3 text-paper-500 text-[11px]">
                              <span>VLSFO: <strong className="text-blue-700 font-mono">{r.vlsfoQty.toLocaleString()} MT</strong></span>
                              <span>MGO: <strong className="text-cyan-700 font-mono">{r.mgoQty.toLocaleString()} MT</strong></span>
                              <span>Total: <strong className="text-paper-100 font-mono">{r.enquiryQty.toLocaleString()} MT</strong></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count indicator */}
      <div className="p-3 border-t border-ink-700 bg-ink-900 text-xs text-paper-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span>
            Showing <span className="text-paper-100 font-semibold">{filteredRecords.length}</span> of {records.length} total enquiries
          </span>
          {selectedIds.size > 0 && (
            <span className="text-blue-700 font-medium">
              ({selectedIds.size} selected)
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 text-paper-500 text-[11px]">
          <span>Select all rows using the top-left checkbox</span>
          <span>&bull;</span>
          <span>Click any row to view fuel grade breakdown</span>
        </div>
      </div>
    </div>
  );
};
