import { describe, it, expect } from 'vitest';
import { performReconciliation, calculateSummary, calculateCompetitorBreakdown } from '../utils/engine';
import type { EnquiryRecord, GpsRecord, StsTrackingRecord } from '../types';

const enquiry = (id: string, vessel: string, qty: number, date = '2026-09-01'): EnquiryRecord => ({
  id, date, vesselName: vessel, normalizedVessel: vessel.toUpperCase(),
  qty1: qty, qty2: 0, qty3: 0, vlsfoQty: qty, mgoQty: 0, hsfoQty: 0, totalEnquiryQty: qty
});
const gps = (id: string, vessel: string, quantity: number): GpsRecord => ({
  id, vesselName: vessel, normalizedVessel: vessel.toUpperCase(), barge: 'FNSA 10', quantity
});
const tracking = (id: string, vessel: string, barge: string, quantity: number, competitor = ''): StsTrackingRecord => ({
  id, vesselName: vessel, normalizedVessel: vessel.toUpperCase(), barge, competitor, quantity
});

describe('performReconciliation', () => {
  it('classifies GPS, competitor and unverified enquiries', () => {
    const res = performReconciliation(
      [enquiry('1', 'ALPHA', 500), enquiry('2', 'BETA', 300), enquiry('3', 'GAMMA', 200)],
      [gps('g1', 'ALPHA', 480)],
      [tracking('t1', 'BETA', 'MT KANDY', 300)],
      [{ bargeName: 'MT Kandy', competitorName: 'Interocean Energy' }]
    );
    expect(res.map(r => r.status)).toEqual(['GPS MATCHED', 'COMPETITOR MATCHED', 'UNVERIFIED']);
    expect(res[0].matchDelta).toBe(-20);
    expect(res[1].competitor).toBe('Interocean Energy');
  });

  it('matches the nearest quantity when a vessel has several enquiries', () => {
    const res = performReconciliation(
      [enquiry('1', 'ALPHA', 100), enquiry('2', 'ALPHA', 900)],
      [gps('g1', 'ALPHA', 880)],
      [],
      []
    );
    expect(res[0].status).toBe('UNVERIFIED');
    expect(res[1].status).toBe('GPS MATCHED');
  });

  it('resolves the competitor from the fleet even when barge names are formatted differently', () => {
    const res = performReconciliation(
      [enquiry('1', 'BETA', 300)],
      [],
      [tracking('t1', 'BETA', 'M/T SANVI-69', 300)],
      [{ bargeName: 'Sanvi 69', competitorName: 'Lanka IOC' }]
    );
    expect(res[0].competitor).toBe('Lanka IOC');
  });

  it('prefers the fleet over the report, falls back to the report, then to Unknown', () => {
    const base = [enquiry('1', 'BETA', 300)];
    const fleet = [{ bargeName: 'KANDY', competitorName: 'Interocean Energy' }];
    expect(performReconciliation(base, [], [tracking('t', 'BETA', 'KANDY', 300, 'Other Co')], fleet)[0].competitor).toBe('Interocean Energy');
    expect(performReconciliation(base, [], [tracking('t', 'BETA', 'KANDY', 300, 'Other Co')], [])[0].competitor).toBe('Other Co');
    expect(performReconciliation(base, [], [tracking('t', 'BETA', 'KANDY', 300)], [])[0].competitor).toBe('Unknown Competitor');
  });

  it('keeps total enquiry quantity equal to GPS + competitor + unverified', () => {
    const res = performReconciliation(
      [enquiry('1', 'A', 500), enquiry('2', 'B', 300), enquiry('3', 'C', 200)],
      [gps('g1', 'A', 500)],
      [tracking('t1', 'B', 'KANDY', 300)],
      []
    );
    const s = calculateSummary(res);
    expect(s.gpsMatchedQty + s.competitorMatchedQty + s.unverifiedQty).toBe(s.totalEnquiryQty);
    expect(calculateCompetitorBreakdown(res)[0].vesselCount).toBe(1);
  });
});
