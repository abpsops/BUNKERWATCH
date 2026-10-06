import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ReconciledRecord, ReconciliationSummary } from '../types';
import { exportToCsv } from '@/lib/exportCsv';

/**
 * Standard XLSX Export
 */
/** Page background of the app (ink-950), so captured reports match the UI. */
function currentPageBackground(): string {
  return '#EBEFF2';
}

export function exportReconciliationToExcel(records: ReconciledRecord[], summary?: ReconciliationSummary): void {
  const data = records.map(r => ({
    'Date': r.date || '',
    'Vessel': r.vesselName,
    'Total Enquiry Qty (MT)': r.enquiryQty,
    'VLSFO Qty (MT)': r.vlsfoQty,
    'MGO Qty (MT)': r.mgoQty,
    'HSFO Qty (MT)': r.hsfoQty,
    'GPS Qty (MT)': r.gpsQty !== null ? r.gpsQty : '',
    'Barge': r.barge || '',
    'Competitor': r.competitor || '',
    'Tracking Qty (MT)': r.trackingQty !== null ? r.trackingQty : '',
    'Status': r.status,
    'Fuel Details': r.fuelDetails.map(f => `${f.grade}: ${f.qty} MT`).join(', ')
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-fit column widths
  const colWidths = [
    { wch: 12 }, // Date
    { wch: 28 }, // Vessel
    { wch: 20 }, // Total Enquiry Qty
    { wch: 16 }, // VLSFO Qty
    { wch: 16 }, // MGO Qty
    { wch: 16 }, // HSFO Qty
    { wch: 14 }, // GPS Qty
    { wch: 18 }, // Barge
    { wch: 22 }, // Competitor
    { wch: 16 }, // Tracking Qty
    { wch: 22 }, // Status
    { wch: 32 }, // Fuel Details
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reconciliation');

  if (summary) {
    const summaryData = [
      { Metric: 'Total Enquiries', Value: summary.totalEnquiries, Unit: 'Records' },
      { Metric: 'Total Enquiry Quantity', Value: summary.totalEnquiryQty, Unit: 'MT' },
      { Metric: 'Total VLSFO Quantity', Value: summary.totalVlsfoQty, Unit: 'MT' },
      { Metric: 'Total MGO Quantity', Value: summary.totalMgoQty, Unit: 'MT' },
      { Metric: 'GPS Matched Enquiries', Value: summary.gpsMatchedCount, Unit: 'Records' },
      { Metric: 'GPS Matched Quantity', Value: summary.gpsMatchedQty, Unit: 'MT' },
      { Metric: 'GPS Matched VLSFO', Value: summary.gpsMatchedVlsfoQty, Unit: 'MT' },
      { Metric: 'GPS Matched MGO', Value: summary.gpsMatchedMgoQty, Unit: 'MT' },
      { Metric: 'Competitor Matched Enquiries', Value: summary.competitorMatchedCount, Unit: 'Records' },
      { Metric: 'Competitor Matched Quantity', Value: summary.competitorMatchedQty, Unit: 'MT' },
      { Metric: 'Competitor Matched VLSFO', Value: summary.competitorMatchedVlsfoQty, Unit: 'MT' },
      { Metric: 'Competitor Matched MGO', Value: summary.competitorMatchedMgoQty, Unit: 'MT' },
      { Metric: 'Unverified Enquiries', Value: summary.unverifiedCount, Unit: 'Records' },
      { Metric: 'Unverified Quantity', Value: summary.unverifiedQty, Unit: 'MT' },
      { Metric: 'Unverified VLSFO', Value: summary.unverifiedVlsfoQty, Unit: 'MT' },
      { Metric: 'Unverified MGO', Value: summary.unverifiedMgoQty, Unit: 'MT' }
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');
  }

  const filename = `BunkerWatch-Reconciliation-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Standard CSV Export — uses the app's shared CSV writer.
 */
export function exportReconciliationToCSV(records: ReconciledRecord[]): void {
  exportToCsv(
    `BunkerWatch-Reconciliation-${new Date().toISOString().split('T')[0]}.csv`,
    records.map(r => ({
      'Date': r.date || '',
      'Vessel': r.vesselName,
      'Total Enquiry Qty (MT)': r.enquiryQty,
      'VLSFO Qty (MT)': r.vlsfoQty,
      'MGO Qty (MT)': r.mgoQty,
      'HSFO Qty (MT)': r.hsfoQty,
      'GPS Qty (MT)': r.gpsQty !== null ? r.gpsQty : '',
      'Barge': r.barge || '',
      'Competitor': r.competitor || '',
      'Tracking Qty (MT)': r.trackingQty !== null ? r.trackingQty : '',
      'Status': r.status
    }))
  );
}

/**
 * High-Resolution Colored PDF Download of the Graphical Analytical Report
 */
export async function downloadColoredPdfReport(elementId: string, filename?: string): Promise<boolean> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: currentPageBackground(), // match the active theme
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }

    const defaultName = `BunkerWatch-Report-Colored-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename || defaultName);
    return true;
  } catch (err) {
    console.error('Failed to generate colored PDF:', err);
    return false;
  }
}

/**
 * High-Resolution Colored PNG Image Download
 */
export async function downloadColoredPngReport(elementId: string, filename?: string): Promise<boolean> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: currentPageBackground()
    });

    const link = document.createElement('a');
    const defaultName = `BunkerWatch-Report-Colored-${new Date().toISOString().split('T')[0]}.png`;
    link.download = filename || defaultName;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Failed to generate colored PNG:', err);
    return false;
  }
}

/**
 * Colorized Excel/Spreadsheet (.xls) with full background colors, status badges, and styled summary
 * Opens in Microsoft Excel, Apple Numbers, and Google Sheets with 100% full rich cell colors!
 */
export function exportColorizedExcel(records: ReconciledRecord[], summary?: ReconciliationSummary): void {
  const totalQty = summary?.totalEnquiryQty || records.reduce((acc, r) => acc + r.enquiryQty, 0);
  const gpsQty = summary?.gpsMatchedQty || records.filter(r => r.status === 'GPS MATCHED').reduce((acc, r) => acc + r.enquiryQty, 0);
  const compQty = summary?.competitorMatchedQty || records.filter(r => r.status === 'COMPETITOR MATCHED').reduce((acc, r) => acc + r.enquiryQty, 0);
  const unvQty = summary?.unverifiedQty || records.filter(r => r.status === 'UNVERIFIED').reduce((acc, r) => acc + r.enquiryQty, 0);

  const gpsWinRate = totalQty > 0 ? Math.round((gpsQty / totalQty) * 1000) / 10 : 0;
  const compLossRate = totalQty > 0 ? Math.round((compQty / totalQty) * 1000) / 10 : 0;
  const unvRate = totalQty > 0 ? Math.round((unvQty / totalQty) * 1000) / 10 : 0;

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Colored Reconciliation</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .title { font-size: 18pt; font-weight: bold; color: #0A1A2A; }
        .subtitle { font-size: 10pt; color: #64748b; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th { background-color: #0A1A2A; color: #ffffff; font-weight: bold; text-align: left; padding: 10px 8px; border: 1px solid #334155; font-size: 10pt; }
        td { padding: 8px; border: 1px solid #cbd5e1; font-size: 9.5pt; }
        .kpi-table th { background-color: #112B42; color: #f8fafc; }
        .badge-gps { background-color: #d1fae5; color: #065f46; font-weight: bold; border-radius: 4px; padding: 3px 8px; text-align: center; }
        .badge-comp { background-color: #fef3c7; color: #92400e; font-weight: bold; border-radius: 4px; padding: 3px 8px; text-align: center; }
        .badge-unv { background-color: #f1f5f9; color: #475569; font-weight: bold; border-radius: 4px; padding: 3px 8px; text-align: center; }
        .num { text-align: right; font-family: monospace; font-weight: 600; }
        .vlsfo { color: #1d4ed8; font-weight: bold; }
        .mgo { color: #0284c7; font-weight: bold; }
        .gps-val { color: #059669; font-weight: bold; }
        .comp-val { color: #d97706; font-weight: bold; }
        .header-box { padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div class="title">BUNKERWATCH &bull; EXECUTIVE REPORT</div>
        <div class="subtitle">Generated on ${new Date().toLocaleString()} &bull; Enquiry Data vs FLOW/GPS Actual Supply vs STS Tracking</div>
      </div>

      <!-- Colored Executive KPI Summary Table -->
      <table class="kpi-table">
        <thead>
          <tr>
            <th colspan="5" style="background-color: #1e3a8a; font-size: 11pt; text-align: center;">EXECUTIVE RECONCILIATION SUMMARY &bull; COLORED KPIS</th>
          </tr>
          <tr>
            <th style="background-color: #2563eb;">Metric Category</th>
            <th style="background-color: #2563eb;">Total Demand (MT)</th>
            <th style="background-color: #059669;">GPS Matched (Won)</th>
            <th style="background-color: #d97706;">Competitor Captured</th>
            <th style="background-color: #475569;">Unverified Demand</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Total Volume (MT)</strong></td>
            <td class="num" style="background-color: #eff6ff; color: #1e40af;">${totalQty.toLocaleString()} MT</td>
            <td class="num" style="background-color: #ecfdf5; color: #065f46;">${gpsQty.toLocaleString()} MT</td>
            <td class="num" style="background-color: #fffbeb; color: #92400e;">${compQty.toLocaleString()} MT</td>
            <td class="num" style="background-color: #f8fafc; color: #334155;">${unvQty.toLocaleString()} MT</td>
          </tr>
          ${summary ? `
          <tr>
            <td><strong>VLSFO Volume (MT)</strong></td>
            <td class="num" style="color: #2563eb;">${summary.totalVlsfoQty.toLocaleString()} MT</td>
            <td class="num gps-val">${summary.gpsMatchedVlsfoQty.toLocaleString()} MT</td>
            <td class="num comp-val">${summary.competitorMatchedVlsfoQty.toLocaleString()} MT</td>
            <td class="num">${summary.unverifiedVlsfoQty.toLocaleString()} MT</td>
          </tr>
          <tr>
            <td><strong>MGO Volume (MT)</strong></td>
            <td class="num" style="color: #0284c7;">${summary.totalMgoQty.toLocaleString()} MT</td>
            <td class="num gps-val">${summary.gpsMatchedMgoQty.toLocaleString()} MT</td>
            <td class="num comp-val">${summary.competitorMatchedMgoQty.toLocaleString()} MT</td>
            <td class="num">${summary.unverifiedMgoQty.toLocaleString()} MT</td>
          </tr>
          <tr>
            <td><strong>Vessels / Stems Count</strong></td>
            <td class="num">${summary.totalEnquiries} Enquiries</td>
            <td class="num gps-val">${summary.gpsMatchedCount} Won</td>
            <td class="num comp-val">${summary.competitorMatchedCount} Lost</td>
            <td class="num">${summary.unverifiedCount} Open</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <!-- Detailed Colored Reconciliation Table -->
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vessel Name</th>
            <th style="text-align: right; background-color: #1e40af;">Enquiry Demand (MT)</th>
            <th style="text-align: right; background-color: #2563eb;">VLSFO (MT)</th>
            <th style="text-align: right; background-color: #0284c7;">MGO (MT)</th>
            <th style="text-align: right; background-color: #047857;">Actual GPS Qty (MT)</th>
            <th>GPS Barge</th>
            <th style="background-color: #b45309;">Competitor Name</th>
            <th style="text-align: right;">Tracking Qty</th>
            <th style="text-align: center;">Reconciliation Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const r of records) {
    let statusClass = 'badge-unv';
    let statusBg = '#f1f5f9';
    let statusColor = '#475569';

    if (r.status === 'GPS MATCHED') {
      statusClass = 'badge-gps';
      statusBg = '#d1fae5';
      statusColor = '#065f46';
    } else if (r.status === 'COMPETITOR MATCHED') {
      statusClass = 'badge-comp';
      statusBg = '#fef3c7';
      statusColor = '#92400e';
    }

    html += `
      <tr>
        <td>${r.date || '—'}</td>
        <td><strong>${r.vesselName}</strong></td>
        <td class="num" style="background-color: #eff6ff; color: #1e3a8a;">${r.enquiryQty.toLocaleString()}</td>
        <td class="num vlsfo">${r.vlsfoQty > 0 ? r.vlsfoQty.toLocaleString() : '—'}</td>
        <td class="num mgo">${r.mgoQty > 0 ? r.mgoQty.toLocaleString() : '—'}</td>
        <td class="num" style="background-color: #ecfdf5; color: #047857;">${r.gpsQty !== null ? r.gpsQty.toLocaleString() : '—'}</td>
        <td>${r.barge || '—'}</td>
        <td style="${r.competitor ? 'color: #b45309; font-weight: bold;' : ''}">${r.competitor || '—'}</td>
        <td class="num">${r.trackingQty !== null ? r.trackingQty.toLocaleString() : '—'}</td>
        <td style="text-align: center; background-color: ${statusBg}; color: ${statusColor}; font-weight: bold; border-radius: 4px;">
          ${r.status}
        </td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `BunkerWatch-Executive-Report-Colored-${new Date().toISOString().split('T')[0]}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download Standalone Portable Colored HTML Executive Dashboard
 */
export function downloadColoredHtmlReport(records: ReconciledRecord[], summary: ReconciliationSummary): void {
  const totalQty = summary.totalEnquiryQty || 1;
  const gpsWinRate = Math.round((summary.gpsMatchedQty / totalQty) * 1000) / 10;
  const compLossRate = Math.round((summary.competitorMatchedQty / totalQty) * 1000) / 10;
  const unvRate = Math.max(0, Math.round((100 - gpsWinRate - compLossRate) * 10) / 10);

  const vlsfoShare = Math.round((summary.totalVlsfoQty / totalQty) * 100);
  const mgoShare = Math.round((summary.totalMgoQty / totalQty) * 100);

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BunkerWatch Executive Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #EBEFF2; color: #0C1B2A; padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #0A1A2A; border: 1px solid #0A1A2A; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 600; color: #ffffff; }
    .subtitle { font-size: 12px; color: #8FA6BA; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #ffffff; border: 1px solid #D5DDE4; border-radius: 12px; padding: 16px; }
    .card-title { font-size: 12px; color: #3B4B5C; font-weight: 600; margin-bottom: 6px; }
    .card-val { font-size: 24px; font-weight: 700; font-family: monospace; }
    .card-sub { font-size: 12px; color: #5B6C7E; margin-top: 4px; }
    .emerald { color: #16A34A; border-color: #86EFAC; }
    .amber { color: #D97706; border-color: #FCD34D; }
    .blue { color: #2563EB; border-color: #93C5FD; }
    .cyan { color: #0891B2; }
    .slate { color: #5B6C7E; }
    .progress-bar { height: 8px; background: #EDF1F4; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .fill-emerald { height: 100%; background: #16A34A; }
    .fill-amber { height: 100%; background: #D97706; }
    .table-card { background: #ffffff; border: 1px solid #D5DDE4; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #F6F8FA; padding: 12px 10px; text-align: left; color: #5B6C7E; font-weight: 600; border-bottom: 1px solid #D5DDE4; }
    td { padding: 10px; border-bottom: 1px solid #EDF1F4; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; font-family: monospace; }
    .badge-gps { background: #E9F8EE; color: #15803D; border: 1px solid #BBF7D0; }
    .badge-comp { background: #FCF1E1; color: #B45309; border: 1px solid #FDE68A; }
    .badge-unv { background: #EDF1F4; color: #5B6C7E; border: 1px solid #D5DDE4; }
    @media print { body { background: #ffffff; color: #0f172a; } .card, .table-card { border-color: #D5DDE4; background: #ffffff; } th { background: #f1f5f9; color: #334155; } td { border-color: #e2e8f0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">BunkerWatch Executive Report</div>
      <div class="subtitle">Full Color Intelligence Document &bull; Generated: ${new Date().toLocaleString()}</div>
    </div>

    <div class="grid">
      <div class="card blue">
        <div class="card-title">Total Demand</div>
        <div class="card-val" style="color: #2563EB;">${summary.totalEnquiryQty.toLocaleString()} MT</div>
        <div class="card-sub">${summary.totalEnquiries} Enquiries (VLSFO: ${vlsfoShare}% | MGO: ${mgoShare}%)</div>
      </div>

      <div class="card emerald">
        <div class="card-title" style="color: #16A34A;">GPS Captured (Won)</div>
        <div class="card-val" style="color: #16A34A;">${summary.gpsMatchedQty.toLocaleString()} MT</div>
        <div class="card-sub">${summary.gpsMatchedCount} Vessels &bull; <strong style="color: #16A34A;">${gpsWinRate}% Won</strong></div>
        <div class="progress-bar"><div class="fill-emerald" style="width: ${gpsWinRate}%;"></div></div>
      </div>

      <div class="card amber">
        <div class="card-title" style="color: #D97706;">Competitor Taken</div>
        <div class="card-val" style="color: #D97706;">${summary.competitorMatchedQty.toLocaleString()} MT</div>
        <div class="card-sub">${summary.competitorMatchedCount} Vessels &bull; <strong style="color: #D97706;">${compLossRate}% Lost</strong></div>
        <div class="progress-bar"><div class="fill-amber" style="width: ${compLossRate}%;"></div></div>
      </div>

      <div class="card slate">
        <div class="card-title">Unverified Demand</div>
        <div class="card-val" style="color: #3B4B5C;">${summary.unverifiedQty.toLocaleString()} MT</div>
        <div class="card-sub">${summary.unverifiedCount} Open &bull; ${unvRate}% Pending</div>
      </div>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Vessel</th>
            <th style="text-align: right;">Enquiry Qty (MT)</th>
            <th style="text-align: right;">VLSFO (MT)</th>
            <th style="text-align: right;">MGO (MT)</th>
            <th style="text-align: right;">GPS Flow (MT)</th>
            <th>Barge</th>
            <th>Competitor</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td>${r.date || '—'}</td>
              <td><strong>${r.vesselName}</strong></td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; color: #2563EB;">${r.enquiryQty.toLocaleString()}</td>
              <td style="text-align: right; font-family: monospace; color: #3b82f6;">${r.vlsfoQty > 0 ? r.vlsfoQty.toLocaleString() : '—'}</td>
              <td style="text-align: right; font-family: monospace; color: #06b6d4;">${r.mgoQty > 0 ? r.mgoQty.toLocaleString() : '—'}</td>
              <td style="text-align: right; font-family: monospace; color: #16A34A; font-weight: bold;">${r.gpsQty !== null ? r.gpsQty.toLocaleString() : '—'}</td>
              <td>${r.barge || '—'}</td>
              <td style="color: #D97706;">${r.competitor || '—'}</td>
              <td style="text-align: center;">
                <span class="badge ${r.status === 'GPS MATCHED' ? 'badge-gps' : r.status === 'COMPETITOR MATCHED' ? 'badge-comp' : 'badge-unv'}">
                  ${r.status}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([doc], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Bunker-Analytical-Report-Colored-${new Date().toISOString().split('T')[0]}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
