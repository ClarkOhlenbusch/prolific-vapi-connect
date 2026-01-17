import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Users, TrendingUp } from 'lucide-react';

interface PageTimeData {
  page_name: string;
  avg_time_seconds: number;
  total_visits: number;
  unique_participants: number;
}

export const TimeAnalysis = () => {
  const [data, setData] = useState<PageTimeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);

  useEffect(() => {
    fetchTimeAnalysis();
  }, []);

  const fetchTimeAnalysis = async () => {
    try {
      setLoading(true);
      
      // Fetch navigation events with time data
      const { data: events, error } = await supabase
        .from('navigation_events')
        .select('page_name, time_on_page_seconds, prolific_id')
        .not('time_on_page_seconds', 'is', null);

      if (error) throw error;

      // Calculate averages per page
      const pageStats: { [key: string]: { totalTime: number; visits: number; participants: Set<string> } } = {};
      const allParticipants = new Set<string>();

      events?.forEach((event) => {
        const page = event.page_name;
        if (!pageStats[page]) {
          pageStats[page] = { totalTime: 0, visits: 0, participants: new Set() };
        }
        pageStats[page].totalTime += Number(event.time_on_page_seconds) || 0;
        pageStats[page].visits += 1;
        pageStats[page].participants.add(event.prolific_id);
        allParticipants.add(event.prolific_id);
      });

      // Convert to array and sort by page flow order
      const pageOrder = [
        'Consent',
        'ProlificId',
        'Demographics',
        'VoiceAssistantFamiliarity',
        'PracticeConversation',
        'VoiceConversation',
        'FormalityQuestionnaire',
        'Questionnaire',
        'TiasQuestionnaire',
        'GodspeedQuestionnaire',
        'IntentionQuestionnaire',
        'FeedbackQuestionnaire',
        'Debriefing',
        'Complete'
      ];

      const formattedData: PageTimeData[] = Object.entries(pageStats)
        .map(([page_name, stats]) => ({
          page_name,
          avg_time_seconds: stats.visits > 0 ? stats.totalTime / stats.visits : 0,
          total_visits: stats.visits,
          unique_participants: stats.participants.size
        }))
        .sort((a, b) => {
          const indexA = pageOrder.indexOf(a.page_name);
          const indexB = pageOrder.indexOf(b.page_name);
          if (indexA === -1 && indexB === -1) return a.page_name.localeCompare(b.page_name);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

      setData(formattedData);
      setTotalParticipants(allParticipants.size);
    } catch (error) {
      console.error('Error fetching time analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const totalAvgTime = data.reduce((sum, page) => sum + page.avg_time_seconds, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Avg. Completion Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(totalAvgTime)}</div>
            <p className="text-xs text-muted-foreground">
              Sum of average time per page
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pages Tracked</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.length}</div>
            <p className="text-xs text-muted-foreground">
              Unique pages with time data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalParticipants}</div>
            <p className="text-xs text-muted-foreground">
              With navigation data
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Table */}
      <Card>
        <CardHeader>
          <CardTitle>Average Time per Page</CardTitle>
          <CardDescription>
            Time spent on each page during the experiment flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Avg. Time</TableHead>
                <TableHead className="text-right">Total Visits</TableHead>
                <TableHead className="text-right">Unique Participants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((page) => (
                <TableRow key={page.page_name}>
                  <TableCell className="font-medium">{page.page_name}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{formatTime(page.avg_time_seconds)}</span>
                  </TableCell>
                  <TableCell className="text-right">{page.total_visits}</TableCell>
                  <TableCell className="text-right">{page.unique_participants}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No time tracking data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
