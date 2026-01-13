import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, FileText, Phone, Archive } from 'lucide-react';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';

interface SummaryData {
  totalResponses: number;
  totalDemographics: number;
  totalCalls: number;
  totalArchived: number;
  avgPetsTotal: number;
  avgTiasTotal: number;
  avgFormality: number;
}

export const DataSummary = () => {
  const [data, setData] = useState<SummaryData | null>(null);
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

  if (isLoading) {
    return (
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
    </div>
  );
};
