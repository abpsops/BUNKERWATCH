import {
  EnquiryRecord,
  GpsRecord,
  StsTrackingRecord,
  ReconciledRecord,
  CompetitorMapping,
  ReconciliationSummary,
  PeriodSummary,
  CompetitorBreakdown,
  FuelDetail
} from '../types';
import { normalizeVesselName } from './normalizer';

interface MatchAssignment {
  status: 'GPS MATCHED' | 'COMPETITOR MATCHED' | 'UNVERIFIED';
  gpsQty: number | null;
  gpsVlsfoQty?: number | null;
  gpsMgoQty?: number | null;
  matchDelta: number | null;
  barge: string;
  competitor: string;
  trackingQty: number | null;
}

/**
 * Reconcile Enquiry Data against FLOW/GPS and STS Tracking reports.
 * Employs NEAREST QUANTITY MATCHING:
 * When a vessel appears multiple times in the enquiry sheet, matches each
 * GPS/Tracking supply to the enquiry entry with the nearest quantity.
 */
export function performReconciliation(
  enquiries: EnquiryRecord[],
  gpsRecords: GpsRecord[],
  trackingRecords: StsTrackingRecord[],
  competitorMappings: CompetitorMapping[] = []
): ReconciledRecord[] {
  // Build lookup map for barge -> competitor. Keys go through the same vessel-name
  // normaliser as the reports, so "MT Kandy", "M/T KANDY" and "Kandy" all resolve alike.
  const bargeToCompMap = new Map<string, string>();
  for (const m of competitorMappings) {
    if (m.bargeName && m.competitorName) {
      bargeToCompMap.set(normalizeVesselName(m.bargeName), m.competitorName.trim());
    }
  }

  // Group GPS records by normalized vessel
  const gpsByVessel = new Map<string, GpsRecord[]>();
  for (const rec of gpsRecords) {
    if (rec.normalizedVessel) {
      const list = gpsByVessel.get(rec.normalizedVessel) || [];
      list.push(rec);
      gpsByVessel.set(rec.normalizedVessel, list);
    }
  }

  // Group STS Tracking records by normalized vessel
  const trackingByVessel = new Map<string, StsTrackingRecord[]>();
  for (const rec of trackingRecords) {
    if (rec.normalizedVessel) {
      const list = trackingByVessel.get(rec.normalizedVessel) || [];
      list.push(rec);
      trackingByVessel.set(rec.normalizedVessel, list);
    }
  }

  // Group Enquiries by normalized vessel to run nearest-quantity assignment per vessel
  const enquiriesByVessel = new Map<string, EnquiryRecord[]>();
  for (const enq of enquiries) {
    const list = enquiriesByVessel.get(enq.normalizedVessel) || [];
    list.push(enq);
    enquiriesByVessel.set(enq.normalizedVessel, list);
  }

  // Map to hold final match result for each enquiry ID
  const assignments = new Map<string, MatchAssignment>();

  for (const [vesselKey, vesselEnqs] of enquiriesByVessel.entries()) {
    const availableGps = [...(gpsByVessel.get(vesselKey) || [])].sort(
      (a, b) => (b.quantity || 0) - (a.quantity || 0)
    );
    const availableTracking = [...(trackingByVessel.get(vesselKey) || [])].sort(
      (a, b) => (b.quantity || 0) - (a.quantity || 0)
    );
    const unassignedEnqs = [...vesselEnqs];

    // -------------------------------------------------------------
    // STEP 1: MATCH GPS RECORDS USING NEAREST QUANTITY MATCHING
    // -------------------------------------------------------------
    for (const gps of availableGps) {
      if (unassignedEnqs.length === 0) break;

      const gpsQty = gps.quantity !== undefined && gps.quantity > 0 ? gps.quantity : null;

      // Find the unassigned enquiry that has the nearest quantity to this GPS supply
      let bestIdx = 0;
      let minDiff = Infinity;

      if (gpsQty !== null) {
        for (let i = 0; i < unassignedEnqs.length; i++) {
          const diff = Math.abs(unassignedEnqs[i].totalEnquiryQty - gpsQty);
          if (diff < minDiff) {
            minDiff = diff;
            bestIdx = i;
          }
        }
      }

      const matchedEnq = unassignedEnqs[bestIdx];
      unassignedEnqs.splice(bestIdx, 1);

      const delta = gpsQty !== null ? Math.round((gpsQty - matchedEnq.totalEnquiryQty) * 1000) / 1000 : null;

      assignments.set(matchedEnq.id, {
        status: 'GPS MATCHED',
        gpsQty,
        gpsVlsfoQty: gps.vlsfoQty ?? null,
        gpsMgoQty: gps.mgoQty ?? null,
        matchDelta: delta,
        barge: gps.barge || '',
        competitor: '',
        trackingQty: null
      });
    }

    // -------------------------------------------------------------
    // STEP 2: MATCH TRACKING RECORDS TO REMAINING ENQUIRIES
    // -------------------------------------------------------------
    for (const tracking of availableTracking) {
      if (unassignedEnqs.length === 0) break;

      const trackQty = tracking.quantity !== undefined && tracking.quantity > 0 ? tracking.quantity : null;

      let bestIdx = 0;
      let minDiff = Infinity;

      if (trackQty !== null) {
        for (let i = 0; i < unassignedEnqs.length; i++) {
          const diff = Math.abs(unassignedEnqs[i].totalEnquiryQty - trackQty);
          if (diff < minDiff) {
            minDiff = diff;
            bestIdx = i;
          }
        }
      }

      const matchedEnq = unassignedEnqs[bestIdx];
      unassignedEnqs.splice(bestIdx, 1);

      let competitorName = tracking.competitor || '';
      if (tracking.barge) {
        const mappedComp = bargeToCompMap.get(normalizeVesselName(tracking.barge));
        if (mappedComp) {
          competitorName = mappedComp;
        }
      }
      if (!competitorName) {
        competitorName = 'Unknown Competitor';
      }

      const delta = trackQty !== null ? Math.round((trackQty - matchedEnq.totalEnquiryQty) * 1000) / 1000 : null;

      assignments.set(matchedEnq.id, {
        status: 'COMPETITOR MATCHED',
        gpsQty: null,
        matchDelta: delta,
        barge: tracking.barge || '',
        competitor: competitorName,
        trackingQty: trackQty
      });
    }

    // -------------------------------------------------------------
    // STEP 3: ANY REMAINING ENQUIRIES BECOME UNVERIFIED
    // -------------------------------------------------------------
    for (const remaining of unassignedEnqs) {
      assignments.set(remaining.id, {
        status: 'UNVERIFIED',
        gpsQty: null,
        matchDelta: null,
        barge: '',
        competitor: '',
        trackingQty: null
      });
    }
  }

  // Construct final ReconciledRecord array preserving exact original enquiry order
  return enquiries.map((enq) => {
    const match = assignments.get(enq.id) || {
      status: 'UNVERIFIED',
      gpsQty: null,
      matchDelta: null,
      barge: '',
      competitor: '',
      trackingQty: null
    };

    const fuelDetails: FuelDetail[] = [];
    if (enq.fuelGrade1 && enq.qty1 > 0) {
      fuelDetails.push({
        grade: enq.fuelGrade1,
        qty: enq.qty1,
        category: enq.vlsfoQty >= enq.qty1 ? 'VLSFO' : enq.mgoQty >= enq.qty1 ? 'MGO' : 'HSFO'
      });
    }
    if (enq.fuelGrade2 && enq.qty2 > 0) {
      fuelDetails.push({
        grade: enq.fuelGrade2,
        qty: enq.qty2,
        category: enq.mgoQty >= enq.qty2 ? 'MGO' : enq.vlsfoQty >= enq.qty2 ? 'VLSFO' : 'HSFO'
      });
    }
    if (enq.fuelGrade3 && enq.qty3 > 0) {
      fuelDetails.push({
        grade: enq.fuelGrade3,
        qty: enq.qty3,
        category: enq.hsfoQty >= enq.qty3 ? 'HSFO' : enq.mgoQty >= enq.qty3 ? 'MGO' : 'VLSFO'
      });
    }

    return {
      id: `rec-${enq.id}`,
      date: enq.date,
      vesselName: enq.vesselName,
      normalizedVessel: enq.normalizedVessel,
      enquiryQty: enq.totalEnquiryQty,
      vlsfoQty: enq.vlsfoQty || 0,
      mgoQty: enq.mgoQty || 0,
      hsfoQty: enq.hsfoQty || 0,
      fuelDetails,
      gpsQty: match.gpsQty,
      gpsVlsfoQty: match.gpsVlsfoQty ?? null,
      gpsMgoQty: match.gpsMgoQty ?? null,
      matchDelta: match.matchDelta,
      barge: match.barge,
      competitor: match.competitor,
      trackingQty: match.trackingQty,
      status: match.status
    };
  });
}

/**
 * Calculate the 8 Core KPI Summary metrics + Separate VLSFO and MGO totals
 */
export function calculateSummary(reconciled: ReconciledRecord[]): ReconciliationSummary {
  let totalEnquiryQty = 0;
  let totalVlsfoQty = 0;
  let totalMgoQty = 0;
  let totalHsfoQty = 0;

  let gpsMatchedCount = 0;
  let gpsMatchedQty = 0;
  let gpsMatchedVlsfoQty = 0;
  let gpsMatchedMgoQty = 0;

  let competitorMatchedCount = 0;
  let competitorMatchedQty = 0;
  let competitorMatchedVlsfoQty = 0;
  let competitorMatchedMgoQty = 0;

  let unverifiedCount = 0;
  let unverifiedQty = 0;
  let unverifiedVlsfoQty = 0;
  let unverifiedMgoQty = 0;

  for (const item of reconciled) {
    totalEnquiryQty += item.enquiryQty;
    totalVlsfoQty += item.vlsfoQty;
    totalMgoQty += item.mgoQty;
    totalHsfoQty += item.hsfoQty;

    if (item.status === 'GPS MATCHED') {
      gpsMatchedCount++;
      gpsMatchedQty += item.enquiryQty;
      gpsMatchedVlsfoQty += item.vlsfoQty;
      gpsMatchedMgoQty += item.mgoQty;
    } else if (item.status === 'COMPETITOR MATCHED') {
      competitorMatchedCount++;
      competitorMatchedQty += item.enquiryQty;
      competitorMatchedVlsfoQty += item.vlsfoQty;
      competitorMatchedMgoQty += item.mgoQty;
    } else {
      unverifiedCount++;
      unverifiedQty += item.enquiryQty;
      unverifiedVlsfoQty += item.vlsfoQty;
      unverifiedMgoQty += item.mgoQty;
    }
  }

  const round = (val: number) => Math.round(val * 100) / 100;

  return {
    totalEnquiries: reconciled.length,
    totalEnquiryQty: round(totalEnquiryQty),
    totalVlsfoQty: round(totalVlsfoQty),
    totalMgoQty: round(totalMgoQty),
    totalHsfoQty: round(totalHsfoQty),

    gpsMatchedCount,
    gpsMatchedQty: round(gpsMatchedQty),
    gpsMatchedVlsfoQty: round(gpsMatchedVlsfoQty),
    gpsMatchedMgoQty: round(gpsMatchedMgoQty),

    competitorMatchedCount,
    competitorMatchedQty: round(competitorMatchedQty),
    competitorMatchedVlsfoQty: round(competitorMatchedVlsfoQty),
    competitorMatchedMgoQty: round(competitorMatchedMgoQty),

    unverifiedCount,
    unverifiedQty: round(unverifiedQty),
    unverifiedVlsfoQty: round(unverifiedVlsfoQty),
    unverifiedMgoQty: round(unverifiedMgoQty)
  };
}

/**
 * Calculate Competitor Breakdown for Competitor Matched records
 */
export function calculateCompetitorBreakdown(reconciled: ReconciledRecord[]): CompetitorBreakdown[] {
  const map = new Map<string, { count: number; enquiryQty: number; trackingQty: number; barges: Set<string> }>();

  for (const r of reconciled) {
    if (r.status === 'COMPETITOR MATCHED') {
      const comp = r.competitor || 'Unknown Competitor';
      const existing = map.get(comp) || { count: 0, enquiryQty: 0, trackingQty: 0, barges: new Set<string>() };
      existing.count++;
      existing.enquiryQty += r.enquiryQty;
      if (r.trackingQty) existing.trackingQty += r.trackingQty;
      if (r.barge) existing.barges.add(r.barge);
      map.set(comp, existing);
    }
  }

  const result: CompetitorBreakdown[] = [];
  for (const [comp, data] of map.entries()) {
    result.push({
      competitor: comp,
      vesselCount: data.count,
      totalEnquiryQty: Math.round(data.enquiryQty * 100) / 100,
      totalTrackingQty: Math.round(data.trackingQty * 100) / 100,
      barges: Array.from(data.barges)
    });
  }

  return result.sort((a, b) => b.totalEnquiryQty - a.totalEnquiryQty);
}

/**
 * Period Grouping: Daily, Weekly, Monthly
 */
export function calculatePeriodSummaries(
  reconciled: ReconciledRecord[],
  mode: 'daily' | 'weekly' | 'monthly'
): PeriodSummary[] {
  const groupMap = new Map<string, {
    label: string;
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
  }>();

  for (const r of reconciled) {
    const { key, label } = getPeriodKeyAndLabel(r.date, mode);

    const current = groupMap.get(key) || {
      label,
      totalEnquiryQty: 0,
      vlsfoQty: 0,
      mgoQty: 0,
      gpsMatchedQty: 0,
      competitorMatchedQty: 0,
      unverifiedQty: 0,
      enquiryCount: 0,
      gpsCount: 0,
      competitorCount: 0,
      unverifiedCount: 0
    };

    current.totalEnquiryQty += r.enquiryQty;
    current.vlsfoQty += r.vlsfoQty;
    current.mgoQty += r.mgoQty;
    current.enquiryCount++;

    if (r.status === 'GPS MATCHED') {
      current.gpsMatchedQty += r.enquiryQty;
      current.gpsCount++;
    } else if (r.status === 'COMPETITOR MATCHED') {
      current.competitorMatchedQty += r.enquiryQty;
      current.competitorCount++;
    } else {
      current.unverifiedQty += r.enquiryQty;
      current.unverifiedCount++;
    }

    groupMap.set(key, current);
  }

  const sortedKeys = Array.from(groupMap.keys()).sort();

  return sortedKeys.map(key => {
    const val = groupMap.get(key)!;
    return {
      periodKey: key,
      periodLabel: val.label,
      totalEnquiryQty: Math.round(val.totalEnquiryQty * 100) / 100,
      vlsfoQty: Math.round(val.vlsfoQty * 100) / 100,
      mgoQty: Math.round(val.mgoQty * 100) / 100,
      gpsMatchedQty: Math.round(val.gpsMatchedQty * 100) / 100,
      competitorMatchedQty: Math.round(val.competitorMatchedQty * 100) / 100,
      unverifiedQty: Math.round(val.unverifiedQty * 100) / 100,
      enquiryCount: val.enquiryCount,
      gpsCount: val.gpsCount,
      competitorCount: val.competitorCount,
      unverifiedCount: val.unverifiedCount
    };
  });
}

function getPeriodKeyAndLabel(dateStr: string, mode: 'daily' | 'weekly' | 'monthly'): { key: string; label: string } {
  if (!dateStr) {
    return { key: '9999-99-99', label: 'Undated' };
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { key: '9999-99-99', label: dateStr || 'Undated' };
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  if (mode === 'daily') {
    return {
      key: `${yyyy}-${mm}-${dd}`,
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };
  }

  if (mode === 'monthly') {
    const monthName = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return {
      key: `${yyyy}-${mm}`,
      label: monthName
    };
  }

  // Weekly (calendar week)
  const tempDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekKey = `${tempDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

  const monday = new Date(d);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const sundayStr = sunday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return {
    key: weekKey,
    label: `W${weekNo} (${mondayStr} - ${sundayStr})`
  };
}
