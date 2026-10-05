import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { CompetitorMapping, StsTrackingRecord } from '../types';
import { normalizeVesselName } from '../utils/normalizer';

interface UnmappedBargesNoticeProps {
  trackingRecords: StsTrackingRecord[];
  mappings: CompetitorMapping[];
}

/**
 * Lists barges from the uploaded STS Tracking report that are not in the
 * BunkerWatch fleet (and carry no competitor in the file itself), so their
 * volume would be reported under "Unknown Competitor".
 */
export const UnmappedBargesNotice: React.FC<UnmappedBargesNoticeProps> = ({ trackingRecords, mappings }) => {
  const unmapped = useMemo(() => {
    const known = new Set(mappings.map(m => normalizeVesselName(m.bargeName)));
    const seen = new Map<string, string>();
    for (const rec of trackingRecords) {
      if (!rec.barge || rec.competitor) continue;
      const key = normalizeVesselName(rec.barge);
      if (key && !known.has(key) && !seen.has(key)) seen.set(key, rec.barge.trim());
    }
    return Array.from(seen.values());
  }, [trackingRecords, mappings]);

  if (unmapped.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-vivid-amber/40 bg-vivid-amber-tint px-4 py-3 text-xs">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-vivid-amber" />
        <div className="text-paper-300">
          <span className="font-semibold text-paper-100">
            {unmapped.length} barge{unmapped.length === 1 ? '' : 's'} in the STS Tracking report {unmapped.length === 1 ? 'is' : 'are'} not in your fleet
          </span>
          {' '}and will show as “Unknown Competitor”: {unmapped.join(', ')}. Add{' '}
          {unmapped.length === 1 ? 'it' : 'them'} on the{' '}
          <Link to="/barges" className="font-semibold text-vivid-blue hover:underline">Barges</Link> page
          and the report updates automatically.
        </div>
      </div>
    </div>
  );
};
