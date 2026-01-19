import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Users, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PageTimeData {
  page_name: string;
  display_name: string;
  order: number;
  avg_time_seconds: number;
  total_visits: number;
  unique_participants: number;
}

// Page order with display names - keys match database page_name values (lowercase)
const PAGE_CONFIG: { [key: string]: { order: number; displayName: string } } = {
  'consent': { order: 1, displayName: 'Consent' },
  'prolific-id': { order: 2, displayName: 'Prolific ID' },
  'demographics': { order: 3, displayName: 'Demographics' },
  'voice-assistant-familiarity': { order: 4, displayName: 'Voice Assistant Familiarity' },
  'practice-conversation': { order: 5, displayName: 'Warm-Up Conversation' },
  'voice-conversation': { order: 6, displayName: 'AI Conversation' },
  'formality': { order: 7, displayName: 'Formality Perception' },
  'pets': { order: 8, displayName: 'PETS Questionnaire' },
  'tias': { order: 9, displayName: 'TIAS Questionnaire' },
  'godspeed': { order: 10, displayName: 'Godspeed Questionnaire' },
  'tipi': { order: 11, displayName: 'TIPI Questionnaire' },
  'intention': { order: 12, displayName: 'Intention Questionnaire' },
  'feedback': { order: 13, displayName: 'Feedback Questionnaire' },
  'debriefing': { order: 14, displayName: 'Debriefing' },
  'complete': { order: 15, displayName: 'Complete' },
  'no-consent': { order: 16, displayName: 'No Consent' },
  'formality-breakdown': { order: 17, displayName: 'Formality Breakdown' },
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

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

      // Convert to array with display names and order
      const formattedData: PageTimeData[] = Object.entries(pageStats)
        .map(([page_name, stats]) => {
          const config = PAGE_CONFIG[page_name] || { order: 99, displayName: formatPageName(page_name) };
          return {
            page_name,
            display_name: config.displayName,
            order: config.order,
            avg_time_seconds: stats.visits > 0 ? stats.totalTime / stats.visits : 0,
            total_visits: stats.visits,
            unique_participants: stats.participants.size
          };
        })
        .sort((a, b) => a.order - b.order);

      setData(formattedData);
      setTotalParticipants(allParticipants.size);
    } catch (error) {
      console.error('Error fetching time analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPageName = (name: string): string => {
    // Convert camelCase or PascalCase to Title Case with spaces
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
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

  // Prepare chart data
  const chartData = data.map((page) => ({
    name: page.display_name,
    shortName: page.display_name.length > 15 ? page.display_name.substring(0, 12) + '...' : page.display_name,
    time: Math.round(page.avg_time_seconds),
    fullName: page.display_name,
  }));

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

      {/* Visual Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Time Distribution by Page</CardTitle>
          <CardDescription>
            Visual representation of average time spent on each page (in seconds)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="number" 
                  className="text-xs fill-muted-foreground"
                  tickFormatter={(value) => `${value}s`}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  className="text-xs fill-muted-foreground"
                  width={140}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3">
                          <p className="font-medium">{data.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            Avg. time: <span className="font-mono">{formatTime(data.time)}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="time" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CHART_COLORS[index % CHART_COLORS.length]} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Time Table */}
      <Card>
        <CardHeader>
          <CardTitle>Average Time per Page</CardTitle>
          <CardDescription>
            Detailed breakdown of time spent on each page during the experiment flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">Avg. Time</TableHead>
                <TableHead className="text-right">Total Visits</TableHead>
                <TableHead className="text-right">Unique Participants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((page) => (
                <TableRow key={page.page_name}>
                  <TableCell className="font-mono text-muted-foreground">
                    {page.order < 99 ? page.order : '-'}
                  </TableCell>
                  <TableCell className="font-medium">{page.display_name}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{formatTime(page.avg_time_seconds)}</span>
                  </TableCell>
                  <TableCell className="text-right">{page.total_visits}</TableCell>
                  <TableCell className="text-right">{page.unique_participants}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
