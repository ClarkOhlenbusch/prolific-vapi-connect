import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, TrendingUp, Search, X, Route } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ParticipantJourneyModal } from './ParticipantJourneyModal';
import { GUEST_NAVIGATION_EVENTS } from '@/lib/guest-dummy-data';
import { fetchArchivedFilters } from '@/lib/archived-responses';
import { SourceFilterValue } from './GlobalSourceFilter';

interface PageTimeData {
  page_name: string;
  display_name: string;
  order: number;
  avg_time_seconds: number;
  total_visits: number;
  unique_participants: number;
}

interface NavigationEvent {
  page_name: string;
  time_on_page_seconds: number | null;
  prolific_id: string;
  call_id?: string | null;
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

// Helper to detect researcher IDs (Prolific IDs are exactly 24 characters)
const isResearcherId = (prolificId: string): boolean => {
  return prolificId.length !== 24;
};

interface TimeAnalysisProps {
  sourceFilter: SourceFilterValue;
}

export const TimeAnalysis = ({ sourceFilter }: TimeAnalysisProps) => {
  const [data, setData] = useState<PageTimeData[]>([]);
  const [allEvents, setAllEvents] = useState<NavigationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [matchingParticipants, setMatchingParticipants] = useState<string[]>([]);
  const [journeyModal, setJourneyModal] = useState<{ open: boolean; prolificId: string }>({ open: false, prolificId: '' });
  const { isGuestMode } = useResearcherAuth();

  useEffect(() => {
    fetchTimeAnalysis();
  }, [isGuestMode, sourceFilter]);

  const fetchTimeAnalysis = async () => {
    try {
      setLoading(true);
      
      let events: NavigationEvent[];
      
      // Use dummy data for guest mode
      if (isGuestMode) {
        events = GUEST_NAVIGATION_EVENTS;
      } else {
        const [{ data: fetchedEvents, error }, { archivedResponseKeys }] = await Promise.all([
          supabase
            .from('navigation_events')
            .select('page_name, time_on_page_seconds, prolific_id, call_id')
            .not('time_on_page_seconds', 'is', null),
          fetchArchivedFilters(),
        ]);

        if (error) throw error;
        const raw = fetchedEvents || [];
        events = raw.filter(
          (e) => e.call_id == null || !archivedResponseKeys.has(`${e.prolific_id}|${e.call_id}`)
        );
      }

      // Apply source filter
      if (sourceFilter === 'participant') {
        events = events.filter(e => !isResearcherId(e.prolific_id));
      } else if (sourceFilter === 'researcher') {
        events = events.filter(e => isResearcherId(e.prolific_id));
      }

      setAllEvents(events);

      // Calculate averages per page
      const pageStats: { [key: string]: { totalTime: number; visits: number; participants: Set<string> } } = {};
      const allParticipants = new Set<string>();

      events.forEach((event) => {
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

  // Calculate individual participant data
  const individualData = useMemo(() => {
    if (!selectedParticipant) return [];

    const participantEvents = allEvents.filter(e => e.prolific_id === selectedParticipant);
    const pageStats: { [key: string]: { totalTime: number; visits: number } } = {};

    participantEvents.forEach((event) => {
      const page = event.page_name;
      if (!pageStats[page]) {
        pageStats[page] = { totalTime: 0, visits: 0 };
      }
      pageStats[page].totalTime += Number(event.time_on_page_seconds) || 0;
      pageStats[page].visits += 1;
    });

    return Object.entries(pageStats)
      .map(([page_name, stats]) => {
        const config = PAGE_CONFIG[page_name] || { order: 99, displayName: formatPageName(page_name) };
        return {
          page_name,
          display_name: config.displayName,
          order: config.order,
          avg_time_seconds: stats.totalTime,
          total_visits: stats.visits,
          unique_participants: 1
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [selectedParticipant, allEvents]);

  // Search for matching participants
  useEffect(() => {
    if (searchTerm.length < 2) {
      setMatchingParticipants([]);
      return;
    }

    const uniqueParticipants = [...new Set(allEvents.map(e => e.prolific_id))];
    const matches = uniqueParticipants
      .filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 10);
    setMatchingParticipants(matches);
  }, [searchTerm, allEvents]);

  const handleSelectParticipant = (prolificId: string) => {
    setSelectedParticipant(prolificId);
    setSearchTerm(prolificId);
    setMatchingParticipants([]);
  };

  const handleClearSelection = () => {
    setSelectedParticipant(null);
    setSearchTerm('');
    setMatchingParticipants([]);
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

  const displayData = selectedParticipant ? individualData : data;
  const totalAvgTime = displayData.reduce((sum, page) => sum + page.avg_time_seconds, 0);

  // Prepare chart data
  const chartData = displayData.map((page) => ({
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
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Participant
          </CardTitle>
          <CardDescription>
            Search for a specific participant to see their individual time breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Prolific ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              {matchingParticipants.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                  {matchingParticipants.map((p) => (
                    <button
                      key={p}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted font-mono"
                      onClick={() => handleSelectParticipant(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedParticipant && (
              <>
                <Badge variant="secondary" className="font-mono">
                  {selectedParticipant}
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setJourneyModal({ open: true, prolificId: selectedParticipant })}
                >
                  <Route className="h-4 w-4 mr-2" />
                  View Full Journey
                </Button>
              </>
            )}
          </div>
          {selectedParticipant && (
            <p className="text-sm text-muted-foreground mt-2">
              Showing individual time data for this participant
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedParticipant ? 'Total Time' : 'Total Avg. Completion Time'}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(totalAvgTime)}</div>
            <p className="text-xs text-muted-foreground">
              {selectedParticipant ? 'Sum of time on each page' : 'Sum of average time per page'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pages Tracked</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayData.length}</div>
            <p className="text-xs text-muted-foreground">
              {selectedParticipant ? 'Pages visited by participant' : 'Unique pages with time data'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedParticipant ? 'Viewing' : 'Total Participants'}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {selectedParticipant ? '1 participant' : totalParticipants}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedParticipant ? 'Individual view' : 'With navigation data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedParticipant ? 'Time per Page' : 'Time Distribution by Page'}
          </CardTitle>
          <CardDescription>
            {selectedParticipant 
              ? 'Time spent on each page by this participant (in seconds)'
              : 'Visual representation of average time spent on each page (in seconds)'
            }
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
                      const tooltipData = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3">
                          <p className="font-medium">{tooltipData.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedParticipant ? 'Time: ' : 'Avg. time: '}
                            <span className="font-mono">{formatTime(tooltipData.time)}</span>
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
          <CardTitle>
            {selectedParticipant ? 'Time per Page' : 'Average Time per Page'}
          </CardTitle>
          <CardDescription>
            {selectedParticipant 
              ? 'Time spent on each page by this participant'
              : 'Detailed breakdown of time spent on each page during the experiment flow'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Page</TableHead>
                <TableHead className="text-right">
                  {selectedParticipant ? 'Time' : 'Avg. Time'}
                </TableHead>
                <TableHead className="text-right">Visits</TableHead>
                {!selectedParticipant && (
                  <TableHead className="text-right">Unique Participants</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((page) => (
                <TableRow key={page.page_name}>
                  <TableCell className="font-mono text-muted-foreground">
                    {page.order < 99 ? page.order : '-'}
                  </TableCell>
                  <TableCell className="font-medium">{page.display_name}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{formatTime(page.avg_time_seconds)}</span>
                  </TableCell>
                  <TableCell className="text-right">{page.total_visits}</TableCell>
                  {!selectedParticipant && (
                    <TableCell className="text-right">{page.unique_participants}</TableCell>
                  )}
                </TableRow>
              ))}
              {displayData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={selectedParticipant ? 4 : 5} className="text-center text-muted-foreground py-8">
                    No time tracking data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Journey Modal */}
      <ParticipantJourneyModal
        open={journeyModal.open}
        onOpenChange={(open) => setJourneyModal(prev => ({ ...prev, open }))}
        prolificId={journeyModal.prolificId}
        status="Pending"
        condition={null}
      />
    </div>
  );
};
