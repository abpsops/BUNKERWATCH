import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { performReconciliation, calculateSummary } from '../utils/engine';
import type { EnquiryRecord, GpsRecord, StsTrackingRecord } from '../types';
import { SummaryCards } from '../components/SummaryCards';
import { MainReconciliationTable } from '../components/MainReconciliationTable';
import { CompetitorInfoSection } from '../components/CompetitorInfoSection';
import { PeriodAnalysisSection } from '../components/PeriodAnalysisSection';
import { AnalyticalReport } from '../components/analytical-report';
import { UploadSection } from '../components/UploadSection';
import { UnmappedBargesNotice } from '../components/UnmappedBargesNotice';
import { InspectModal } from '../components/InspectModal';
import Reconciliation from '@/pages/Reconciliation/Reconciliation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const enq = (id: string, v: string, q: number, d: string, grade = 'VLSFO'): EnquiryRecord => ({
  id, date: d, vesselName: v, normalizedVessel: v, fuelGrade1: grade, qty1: q, qty2: 0, qty3: 0,
  vlsfoQty: grade === 'VLSFO' ? q : 0, mgoQty: grade === 'MGO' ? q : 0, hsfoQty: 0, totalEnquiryQty: q
});
const enquiries = [enq('1', 'ALPHA', 500, '2026-09-01'), enq('2', 'BETA', 300, '2026-09-02', 'MGO'), enq('3', 'GAMMA', 200, '2026-09-10')];
const gps: GpsRecord[] = [{ id: 'g', vesselName: 'ALPHA', normalizedVessel: 'ALPHA', barge: 'FNSA 10', quantity: 490, vlsfoQty: 490 }];
const tracking: StsTrackingRecord[] = [{ id: 't', vesselName: 'BETA', normalizedVessel: 'BETA', barge: 'KANDY', competitor: '', quantity: 300 }];
const records = performReconciliation(enquiries, gps, tracking, [{ bargeName: 'MT Kandy', competitorName: 'Interocean Energy' }]);
const summary = calculateSummary(records);

async function mount(node: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    );
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

describe('reconciliation views render', () => {
  const noop = () => {};
  it('renders every data view without throwing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const node of [
      <SummaryCards summary={summary} />,
      <MainReconciliationTable records={records} />,
      <CompetitorInfoSection records={records} />,
      <PeriodAnalysisSection records={records} />,
      <AnalyticalReport records={records} summary={summary} onNotify={noop} />,
      <UnmappedBargesNotice trackingRecords={[{ ...tracking[0], barge: 'UNKNOWN BARGE' }]} mappings={[]} />,
      <InspectModal isOpen type="gps" onClose={noop} gpsRecords={gps} trackingRecords={tracking} enquiryRecords={enquiries} />,
      <UploadSection gpsRecords={gps} trackingRecords={tracking} enquiryRecords={enquiries} rawGps={null} rawTracking={null} rawEnquiry={null}
        onUploadGps={noop} onUploadTracking={noop} onUploadEnquiry={noop} onInspect={noop} onConfigureColumns={noop} isParsing={false} />
    ]) {
      const { container, unmount } = await mount(node);
      expect(container.innerHTML.length).toBeGreaterThan(20);
      unmount();
    }
    expect(err.mock.calls.filter(c => String(c[0]).includes('Warning') || c[0] instanceof Error)).toEqual([]);
    err.mockRestore();
  });

  it('renders the Reconciliation page (empty state) inside the app providers', async () => {
    const { container, unmount } = await mount(<Reconciliation />);
    expect(container.textContent).toContain('Market Analyzer');
    expect(container.textContent).toContain('No enquiry data uploaded');
    unmount();
  });

  it('shows the unmapped-barge notice only for barges missing from the fleet', async () => {
    const { container, unmount } = await mount(
      <UnmappedBargesNotice
        trackingRecords={[{ ...tracking[0], barge: 'M/T KANDY' }, { ...tracking[0], id: 't2', barge: 'NEW BARGE' }]}
        mappings={[{ bargeName: 'Kandy', competitorName: 'Interocean Energy' }]}
      />
    );
    expect(container.textContent).toContain('NEW BARGE');
    expect(container.textContent).not.toContain('KANDY');
    unmount();
  });
});
