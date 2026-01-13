import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, FileText, Phone, Archive, ArrowUpDown } from 'lucide-react';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Badge } from '@/components/ui/badge';

interface SummaryData {
  totalResponses: number;
  totalDemographics: number;
  totalCalls: number;
  totalArchived: number;
  avgPetsTotal: number;
  avgTiasTotal: number;
  avgFormality: number;
}

interface AssistantTypeStats {
  count: number;
  avgPetsTotal: number;
  avgPetsER: number;
  avgPetsUT: number;
  avgTiasTotal: number;
  avgFormality: number;
  avgIntention1: number;
  avgIntention2: number;
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
      avgIntention1: 0,
      avgIntention2: 0,
    };
  }

  const tiasResponses = responses.filter(r => r.tias_total !== null);

  return {
    count: responses.length,
    avgPetsTotal: responses.reduce((sum, r) => sum + (r.pets_total || 0), 0) / responses.length,
    avgPetsER: responses.reduce((sum, r) => sum + (r.pets_er || 0), 0) / responses.length,
    avgPetsUT: responses.reduce((sum, r) => sum + (r.pets_ut || 0), 0) / responses.length,
    avgTiasTotal: tiasResponses.length > 0
      ? tiasResponses.reduce((sum, r) => sum + (r.tias_total || 0), 0) / tiasResponses.length
      : 0,
    avgFormality: responses.reduce((sum, r) => sum + (r.formality || 0), 0) / responses.length,
    avgIntention1: responses.reduce((sum, r) => sum + (r.intention_1 || 0), 0) / responses.length,
    avgIntention2: responses.reduce((sum, r) => sum + (r.intention_2 || 0), 0) / responses.length,
  };
};

export const DataSummary = () => {
  const [data, setData] = useState<SummaryData | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isSuperAdmin } = useResearcherAuth();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        // Fetch counts in parallel
        const [responsesRes, demographicsRes, callsRes, archivedRes] = await Promise.all([
          supabase.from('experiment_responses').select('*', { count: 'exact', head: false }),
          supabase.from('demographics').select('*', { count: 'exact', head: true }),
          supabase.from('participant_calls').select('*', { count: 'exact', head: true }),
          isSuperAdmin 
            ? supabase.from('archived_responses').select('*', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
        ]);

        const responses = responsesRes.data || [];
        
        // Calculate averages
        const avgPetsTotal = responses.length > 0
          ? responses.reduce((sum, r) => sum + (r.pets_total || 0), 0) / responses.length
          : 0;
        
        const tiasResponses = responses.filter(r => r.tias_total !== null);
        const avgTiasTotal = tiasResponses.length > 0
          ? tiasResponses.reduce((sum, r) => sum + (r.tias_total || 0), 0) / tiasResponses.length
          : 0;
        
        const avgFormality = responses.length > 0
          ? responses.reduce((sum, r) => sum + (r.formality || 0), 0) / responses.length
          : 0;

        // Calculate comparison stats by assistant type
        const formalResponses = responses.filter(r => r.assistant_type === 'formal');
        const informalResponses = responses.filter(r => r.assistant_type === 'informal');
        const unknownResponses = responses.filter(r => r.assistant_type === null || r.assistant_type === undefined);

        setComparison({
          formal: calculateStats(formalResponses),
          informal: calculateStats(informalResponses),
          unknown: calculateStats(unknownResponses),
        });

        setData({
          totalResponses: responsesRes.count || 0,
          totalDemographics: demographicsRes.count || 0,
          totalCalls: callsRes.count || 0,
          totalArchived: archivedRes.count || 0,
          avgPetsTotal,
          avgTiasTotal,
          avgFormality,
        });
      } catch (error) {
        console.error('Error fetching summary:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [isSuperAdmin]);

  const formatDiff = (formal: number, informal: number) => {
    const diff = formal - informal;
    if (diff === 0 || (formal === 0 && informal === 0)) return null;
    return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
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
      {/* Count Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalResponses || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demographics</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalDemographics || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalCalls || 0}</div>
          </CardContent>
        </Card>

        {isSuperAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Archived</CardTitle>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.totalArchived || 0}</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Average Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average PETS Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.avgPetsTotal.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">Scale: 10-70</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average TIAS Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.avgTiasTotal.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">Scale: 12-84</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Formality Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.avgFormality.toFixed(2) || '0.00'}</div>
            <p className="text-xs text-muted-foreground">Scale: 1-7</p>
          </CardContent>
        </Card>
      </div>

      {/* Formal vs Informal Comparison */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Formal vs Informal Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {comparison && (comparison.formal.count > 0 || comparison.informal.count > 0) ? (
            <div className="space-y-6">
              {/* Response Counts */}
              <div className="grid grid-cols-3 gap-4">
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
                <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
                  <Badge variant="outline" className="mb-2">Unknown</Badge>
                  <div className="text-2xl font-bold text-muted-foreground">
                    {comparison.unknown.count}
                  </div>
                  <p className="text-xs text-muted-foreground">responses</p>
                </div>
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
                      <td className="p-3 text-sm font-medium">Formality Rating</td>
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

              <p className="text-xs text-muted-foreground text-center">
                Difference shown as Formal - Informal. Blue indicates Formal is higher, Amber indicates Informal is higher.
              </p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No responses with assistant type data available yet.</p>
              <p className="text-sm mt-1">Responses will appear here once participants complete the experiment with assistant type tracking.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
