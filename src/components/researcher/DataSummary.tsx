import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown } from 'lucide-react';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, X } from 'lucide-react';
import { 
  GUEST_PARTICIPANTS, 
  GUEST_SUMMARY_STATS, 
  GUEST_COMPARISON_STATS 
} from '@/lib/guest-dummy-data';
import { fetchArchivedFilters } from '@/lib/archived-responses';
import { SourceFilterValue } from './GlobalSourceFilter';

type AssistantFilter = 'both' | 'formal' | 'informal';

interface DataSummaryProps {
  sourceFilter: SourceFilterValue;
}

interface SummaryData {
  totalResponses: number;
  totalCalls: number;
  totalArchived: number;
  prolificDemographicsCount: number;
  avgPetsTotal: number;
  avgPetsER: number;
  avgPetsUT: number;
  avgTiasTotal: number;
  avgFormality: number;
  avgIntention1: number;
  avgIntention2: number;
  avgGodspeedAnthro: number;
  avgGodspeedLike: number;
  avgGodspeedIntel: number;
}

interface AssistantTypeStats {
  count: number;
  avgPetsTotal: number;
  avgPetsER: number;
  avgPetsUT: number;
  avgTiasTotal: number;
  avgFormality: number;
  avgFScore: number;
  avgIntention1: number;
  avgIntention2: number;
  avgGodspeedAnthro: number;
  avgGodspeedLike: number;
  avgGodspeedIntel: number;
}

interface ComparisonData {
  formal: AssistantTypeStats;
  informal: AssistantTypeStats;
  unknown: AssistantTypeStats;
}

const calculateStats = (responses: any[]): AssistantTypeStats => {
  if (responses.length === 0) {
    return {
      count: 0,
      avgPetsTotal: 0,
      avgPetsER: 0,
      avgPetsUT: 0,
      avgTiasTotal: 0,
      avgFormality: 0,
      avgFScore: 0,
      avgIntention1: 0,
      avgIntention2: 0,
      avgGodspeedAnthro: 0,
      avgGodspeedLike: 0,
      avgGodspeedIntel: 0,
    };
  }

  const tiasResponses = responses.filter(r => r.tias_total !== null);
  const godspeedResponses = responses.filter(r => r.godspeed_anthro_total !== null);
  const fScoreResponses = responses.filter(r => r.ai_formality_score !== null);

  return {
    count: responses.length,
    avgPetsTotal: responses.reduce((sum, r) => sum + (r.pets_total || 0), 0) / responses.length,
    avgPetsER: responses.reduce((sum, r) => sum + (r.pets_er || 0), 0) / responses.length,
    avgPetsUT: responses.reduce((sum, r) => sum + (r.pets_ut || 0), 0) / responses.length,
    avgTiasTotal: tiasResponses.length > 0
      ? tiasResponses.reduce((sum, r) => sum + (r.tias_total || 0), 0) / tiasResponses.length
      : 0,
    avgFormality: responses.reduce((sum, r) => sum + (r.formality || 0), 0) / responses.length,
    avgFScore: fScoreResponses.length > 0
      ? fScoreResponses.reduce((sum, r) => sum + (r.ai_formality_score || 0), 0) / fScoreResponses.length
      : 0,
    avgIntention1: responses.reduce((sum, r) => sum + (r.intention_1 || 0), 0) / responses.length,
    avgIntention2: responses.reduce((sum, r) => sum + (r.intention_2 || 0), 0) / responses.length,
    avgGodspeedAnthro: godspeedResponses.length > 0
      ? godspeedResponses.reduce((sum, r) => sum + (r.godspeed_anthro_total || 0), 0) / godspeedResponses.length
      : 0,
    avgGodspeedLike: godspeedResponses.length > 0
      ? godspeedResponses.reduce((sum, r) => sum + (r.godspeed_like_total || 0), 0) / godspeedResponses.length
      : 0,
    avgGodspeedIntel: godspeedResponses.length > 0
      ? godspeedResponses.reduce((sum, r) => sum + (r.godspeed_intel_total || 0), 0) / godspeedResponses.length
      : 0,
  };
};

// Helper to detect researcher IDs (Prolific IDs are exactly 24 characters)
const isResearcherId = (prolificId: string): boolean => {
  return prolificId.length !== 24;
};

export const DataSummary = ({ sourceFilter }: DataSummaryProps) => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [allResponses, setAllResponses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assistantFilter, setAssistantFilter] = useState<AssistantFilter>('both');
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const { isSuperAdmin, isGuestMode } = useResearcherAuth();

  // Get unique batches from responses
  const extractBatches = (responses: any[]) => {
    const batches = [...new Set(responses.map(r => r.batch_label).filter(Boolean) as string[])];
    return batches.sort();
  };

  useEffect(() => {
    // Use dummy data for guest mode
    if (isGuestMode) {
      const guestResponses = GUEST_PARTICIPANTS.filter(p => p.status === 'Completed').map(p => ({
        prolific_id: p.prolific_id,
        assistant_type: p.assistant_type,
        batch_label: p.batch_label,
        pets_total: p.pets_total,
        pets_er: Math.round((p.pets_total || 0) / 2),
        pets_ut: Math.round((p.pets_total || 0) / 2),
        tias_total: p.tias_total,
        formality: p.formality,
        intention_1: 4 + Math.random() * 2,
        intention_2: 4 + Math.random() * 2,
        godspeed_anthro_total: 2.5 + Math.random() * 1.5,
        godspeed_like_total: 3 + Math.random() * 1.5,
        godspeed_intel_total: 3.5 + Math.random() * 1.5,
        ai_formality_score: p.assistant_type === 'formal' ? 55 + Math.random() * 15 : 40 + Math.random() * 15,
      }));
      
      setAllResponses(guestResponses);
      setAvailableBatches(extractBatches(guestResponses));
      setComparison(GUEST_COMPARISON_STATS);
      setData({
        totalResponses: GUEST_SUMMARY_STATS.totalResponses,
        totalCalls: GUEST_SUMMARY_STATS.totalCalls,
        totalArchived: GUEST_SUMMARY_STATS.totalArchived,
        prolificDemographicsCount: 0,
        avgPetsTotal: GUEST_SUMMARY_STATS.avgPetsTotal,
        avgPetsER: GUEST_SUMMARY_STATS.avgPetsER,
        avgPetsUT: GUEST_SUMMARY_STATS.avgPetsUT,
        avgTiasTotal: GUEST_SUMMARY_STATS.avgTiasTotal,
        avgFormality: GUEST_SUMMARY_STATS.avgFormality,
        avgIntention1: GUEST_SUMMARY_STATS.avgIntention1,
        avgIntention2: GUEST_SUMMARY_STATS.avgIntention2,
        avgGodspeedAnthro: GUEST_SUMMARY_STATS.avgGodspeedAnthro,
        avgGodspeedLike: GUEST_SUMMARY_STATS.avgGodspeedLike,
        avgGodspeedIntel: GUEST_SUMMARY_STATS.avgGodspeedIntel,
      });
      setIsLoading(false);
      return;
    }

    const fetchSummary = async () => {
      try {
        const [responsesRes, callsRes, archivedRes, prolificDemoRes, archivedFilters, batchesRes] = await Promise.all([
          supabase
            .from('experiment_responses' as any)
            .select('*', { count: 'exact', head: false })
            // Only include completed questionnaires.
            .eq('submission_status', 'submitted'),
          supabase.from('participant_calls').select('id'),
          isSuperAdmin 
            ? supabase.from('archived_responses').select('*', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
          supabase.from('prolific_export_demographics').select('*', { count: 'exact', head: true }),
          fetchArchivedFilters(),
          // Prefer authoritative batch list over deriving from response rows (which can be row-limited).
          supabase.from('experiment_batches').select('name').order('created_at', { ascending: false }),
        ]);

        const allResponsesRaw = responsesRes.data || [];
        const callsRaw = callsRes.data || [];
        const responses = allResponsesRaw.filter(
          (r) => !archivedFilters.archivedResponseKeys.has(`${r.prolific_id}|${r.call_id}`)
        );
        const callsFiltered = callsRaw.filter((c) => !archivedFilters.archivedParticipantCallIds.has(c.id));

        setAllResponses(responses);
        const batchNames = (batchesRes.data ?? [])
          .map((r: any) => (r?.name ?? '').toString().trim())
          .filter(Boolean);
        setAvailableBatches([...new Set(batchNames)].sort());

        const formalResponses = responses.filter(r => r.assistant_type === 'formal');
        const informalResponses = responses.filter(r => r.assistant_type === 'informal');
        const unknownResponses = responses.filter(r => r.assistant_type === null || r.assistant_type === undefined);

        setComparison({
          formal: calculateStats(formalResponses),
          informal: calculateStats(informalResponses),
          unknown: calculateStats(unknownResponses),
        });

        const stats = calculateStats(responses);
        setData({
          totalResponses: responses.length,
          totalCalls: callsFiltered.length,
          totalArchived: archivedRes.count || 0,
          prolificDemographicsCount: prolificDemoRes.count ?? 0,
          ...stats,
        });
      } catch (error) {
        console.error('Error fetching summary:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [isSuperAdmin, isGuestMode]);

  // Recalculate stats when filters change (including source filter)
  useEffect(() => {
    if (allResponses.length === 0) return;

    // First filter by source
    let sourceFiltered = allResponses;
    if (sourceFilter === 'participant') {
      sourceFiltered = allResponses.filter(r => !isResearcherId(r.prolific_id || ''));
    } else if (sourceFilter === 'researcher') {
      sourceFiltered = allResponses.filter(r => isResearcherId(r.prolific_id || ''));
    }

    // Then filter by batch (if any selected)
    let batchFiltered = sourceFiltered;
    if (selectedBatches.size > 0) {
      batchFiltered = sourceFiltered.filter(r => r.batch_label && selectedBatches.has(r.batch_label));
    }

    // Then filter by assistant type for the main stats
    let filteredResponses: any[];
    if (assistantFilter === 'formal') {
      filteredResponses = batchFiltered.filter(r => r.assistant_type === 'formal');
    } else if (assistantFilter === 'informal') {
      filteredResponses = batchFiltered.filter(r => r.assistant_type === 'informal');
    } else {
      filteredResponses = batchFiltered;
    }

    // Recalculate comparison based on batch filter
    const formalResponses = batchFiltered.filter(r => r.assistant_type === 'formal');
    const informalResponses = batchFiltered.filter(r => r.assistant_type === 'informal');
    const unknownResponses = batchFiltered.filter(r => r.assistant_type === null || r.assistant_type === undefined);

    setComparison({
      formal: calculateStats(formalResponses),
      informal: calculateStats(informalResponses),
      unknown: calculateStats(unknownResponses),
    });

    const stats = calculateStats(filteredResponses);
    setData(prev => prev ? {
      ...prev,
      totalResponses: filteredResponses.length,
      ...stats,
    } : null);
  }, [assistantFilter, selectedBatches, allResponses, sourceFilter]);

  const toggleBatch = (batch: string) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batch)) {
        next.delete(batch);
      } else {
        next.add(batch);
      }
      return next;
    });
  };

  const clearBatches = () => {
    setSelectedBatches(new Set());
  };

  const formatDiff = (formal: number, informal: number) => {
    const diff = formal - informal;
    if (diff === 0 || (formal === 0 && informal === 0)) return null;
    return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Assistant:</span>
          <ToggleGroup 
            type="single" 
            value={assistantFilter} 
            onValueChange={(value) => value && setAssistantFilter(value as AssistantFilter)}
            className="justify-start"
          >
            <ToggleGroupItem value="both" aria-label="Show both">
              Both
            </ToggleGroupItem>
            <ToggleGroupItem value="formal" aria-label="Show formal only" className="data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700 dark:data-[state=on]:bg-blue-900 dark:data-[state=on]:text-blue-300">
              Formal
            </ToggleGroupItem>
            <ToggleGroupItem value="informal" aria-label="Show informal only" className="data-[state=on]:bg-amber-100 data-[state=on]:text-amber-700 dark:data-[state=on]:bg-amber-900 dark:data-[state=on]:text-amber-300">
              Informal
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Batch:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-between">
                {selectedBatches.size === 0 
                  ? "All batches" 
                  : selectedBatches.size === 1 
                    ? Array.from(selectedBatches)[0]
                    : `${selectedBatches.size} batches`}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-2" align="start">
              <div className="space-y-2">
                {availableBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No batches available</p>
                ) : (
                  <>
                    {selectedBatches.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                        onClick={clearBatches}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear selection
                      </Button>
                    )}
                    {availableBatches.map((batch) => (
                      <label
                        key={batch}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedBatches.has(batch)}
                          onCheckedChange={() => toggleBatch(batch)}
                        />
                        <span className="text-sm">{batch}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Formal vs Informal Comparison - Only show when filter is "both" */}
      {assistantFilter === 'both' && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Formal vs Informal Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const total =
                (comparison?.formal.count ?? 0) +
                (comparison?.informal.count ?? 0) +
                (comparison?.unknown.count ?? 0);
              const hasAny = total > 0;
              const hasKnown = (comparison?.formal.count ?? 0) + (comparison?.informal.count ?? 0) > 0;

              if (!comparison || !hasAny) {
                return (
                  <p className="text-muted-foreground text-center py-8">
                    No completed questionnaires match your current filters yet.
                  </p>
                );
              }

              // If we have responses but none are labeled formal/informal, call that out explicitly.
              if (!hasKnown) {
                return (
                  <p className="text-muted-foreground text-center py-8">
                    Responses exist for this selection, but they are missing assistant type labels (all “unknown”).
                  </p>
                );
              }

              return (
              <div className="space-y-6">
                {/* Response Counts */}
                <div className={`grid gap-4 ${comparison.unknown.count > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 mb-2">
                      Formal
                    </Badge>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {comparison.formal.count}
                    </div>
                    <p className="text-xs text-muted-foreground">responses</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 mb-2">
                      Informal
                    </Badge>
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                      {comparison.informal.count}
                    </div>
                    <p className="text-xs text-muted-foreground">responses</p>
                  </div>
                  {comparison.unknown.count > 0 && (
                    <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
                      <Badge variant="outline" className="mb-2">Unknown</Badge>
                      <div className="text-2xl font-bold text-muted-foreground">
                        {comparison.unknown.count}
                      </div>
                      <p className="text-xs text-muted-foreground">responses</p>
                    </div>
                  )}
                </div>

                {/* Comparison Table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium text-sm">Metric</th>
                        <th className="text-center p-3 font-medium text-sm">
                          <span className="text-blue-600 dark:text-blue-400">Formal</span>
                        </th>
                        <th className="text-center p-3 font-medium text-sm">
                          <span className="text-amber-600 dark:text-amber-400">Informal</span>
                        </th>
                        <th className="text-center p-3 font-medium text-sm">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="p-3 text-sm font-medium">F-Score (AI Formality)</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgFScore.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgFScore.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgFScore, comparison.informal.avgFScore) && (
                            <span className={comparison.formal.avgFScore > comparison.informal.avgFScore ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgFScore, comparison.informal.avgFScore)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Perceived Formality (User Rating)</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgFormality.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgFormality.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgFormality, comparison.informal.avgFormality) && (
                            <span className={comparison.formal.avgFormality > comparison.informal.avgFormality ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgFormality, comparison.informal.avgFormality)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">PETS Total</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgPetsTotal.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgPetsTotal.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgPetsTotal, comparison.informal.avgPetsTotal) && (
                            <span className={comparison.formal.avgPetsTotal > comparison.informal.avgPetsTotal ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgPetsTotal, comparison.informal.avgPetsTotal)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">PETS ER (Emotional Response)</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgPetsER.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgPetsER.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgPetsER, comparison.informal.avgPetsER) && (
                            <span className={comparison.formal.avgPetsER > comparison.informal.avgPetsER ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgPetsER, comparison.informal.avgPetsER)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">PETS UT (User Trust)</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgPetsUT.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgPetsUT.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgPetsUT, comparison.informal.avgPetsUT) && (
                            <span className={comparison.formal.avgPetsUT > comparison.informal.avgPetsUT ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgPetsUT, comparison.informal.avgPetsUT)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">TIAS Total</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgTiasTotal.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgTiasTotal.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgTiasTotal, comparison.informal.avgTiasTotal) && (
                            <span className={comparison.formal.avgTiasTotal > comparison.informal.avgTiasTotal ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgTiasTotal, comparison.informal.avgTiasTotal)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Godspeed Anthropomorphism</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgGodspeedAnthro.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgGodspeedAnthro.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgGodspeedAnthro, comparison.informal.avgGodspeedAnthro) && (
                            <span className={comparison.formal.avgGodspeedAnthro > comparison.informal.avgGodspeedAnthro ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgGodspeedAnthro, comparison.informal.avgGodspeedAnthro)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Godspeed Likeability</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgGodspeedLike.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgGodspeedLike.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgGodspeedLike, comparison.informal.avgGodspeedLike) && (
                            <span className={comparison.formal.avgGodspeedLike > comparison.informal.avgGodspeedLike ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgGodspeedLike, comparison.informal.avgGodspeedLike)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Godspeed Intelligence</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgGodspeedIntel.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgGodspeedIntel.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgGodspeedIntel, comparison.informal.avgGodspeedIntel) && (
                            <span className={comparison.formal.avgGodspeedIntel > comparison.informal.avgGodspeedIntel ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgGodspeedIntel, comparison.informal.avgGodspeedIntel)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Intention 1</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgIntention1.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgIntention1.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgIntention1, comparison.informal.avgIntention1) && (
                            <span className={comparison.formal.avgIntention1 > comparison.informal.avgIntention1 ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgIntention1, comparison.informal.avgIntention1)}
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 text-sm font-medium">Intention 2</td>
                        <td className="p-3 text-center text-sm">{comparison.formal.avgIntention2.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">{comparison.informal.avgIntention2.toFixed(2)}</td>
                        <td className="p-3 text-center text-sm">
                          {formatDiff(comparison.formal.avgIntention2, comparison.informal.avgIntention2) && (
                            <span className={comparison.formal.avgIntention2 > comparison.informal.avgIntention2 ? 'text-blue-600' : 'text-amber-600'}>
                              {formatDiff(comparison.formal.avgIntention2, comparison.informal.avgIntention2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
