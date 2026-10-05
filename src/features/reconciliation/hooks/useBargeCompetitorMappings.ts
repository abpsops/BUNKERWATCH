import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataProvider } from '@/services/data';
import type { CompetitorMapping } from '../types';

/**
 * Barge -> competitor mappings, sourced from the BunkerWatch fleet (Barges /
 * Track -FKO / BARGES -SL). The fleet is the single source of truth, so the
 * reconciliation never keeps a second, hand-maintained mapping list.
 */
export function useBargeCompetitorMappings() {
  const provider = getDataProvider();
  const { data: barges = [] } = useQuery({ queryKey: ['barges'], queryFn: () => provider.getBarges() });
  const { data: competitors = [] } = useQuery({ queryKey: ['competitors'], queryFn: () => provider.getCompetitors() });

  return useMemo<CompetitorMapping[]>(() => {
    const nameById = new Map(competitors.map(c => [c.id, c.name]));
    return barges
      .map(b => ({ bargeName: b.name, competitorName: nameById.get(b.competitor_id) ?? '' }))
      .filter(m => m.competitorName);
  }, [barges, competitors]);
}
