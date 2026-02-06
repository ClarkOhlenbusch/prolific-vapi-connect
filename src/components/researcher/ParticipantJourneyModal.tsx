import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Circle,
  ArrowLeft,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface NavigationEvent {
  id: string;
  page_name: string;
  event_type: string;
  time_on_page_seconds: number | null;
  created_at: string;
  metadata: any;
}

interface ParticipantJourneyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prolificId: string;
  status?: 'Completed' | 'Pending';
  condition?: string | null;
}

// Page display names matching TimeAnalysis
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

const formatTime = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return 'N/A';
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const formatPageName = (name: string): string => {
  return PAGE_CONFIG[name]?.displayName || name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const ParticipantJourneyModal = ({
  open,
  onOpenChange,
  prolificId,
  status,
  condition,
}: ParticipantJourneyModalProps) => {
  const [events, setEvents] = useState<NavigationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && prolificId) {
      fetchJourneyData();
    }
  }, [open, prolificId]);

  const fetchJourneyData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('navigation_events')
        .select('*')
        .eq('prolific_id', prolificId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching journey data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate total journey time
  const getTotalJourneyTime = (): string => {
    if (events.length === 0) return 'N/A';
    const firstEvent = new Date(events[0].created_at);
    const lastEvent = new Date(events[events.length - 1].created_at);
    const diffMs = lastEvent.getTime() - firstEvent.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 60) {
      return `~${diffMinutes} minutes`;
    }
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `~${hours}h ${minutes}m`;
  };

  // Group events by page for timeline display
  const getTimelineEvents = () => {
    const timeline: {
      pageName: string;
      displayName: string;
      arrivedAt: string;
      timeSpent: number | null;
      hasBackButton: boolean;
      isLast: boolean;
    }[] = [];

    // Process events to create timeline entries
    // page_leave events contain the time_on_page_seconds
    events.forEach((event, index) => {
      if (event.event_type === 'page_leave') {
        timeline.push({
          pageName: event.page_name,
          displayName: formatPageName(event.page_name),
          // Calculate arrival time by subtracting time spent from the created_at
          arrivedAt: event.time_on_page_seconds 
            ? new Date(new Date(event.created_at).getTime() - (event.time_on_page_seconds * 1000)).toISOString()
            : event.created_at,
          timeSpent: event.time_on_page_seconds,
          hasBackButton: false,
          isLast: false,
        });
      } else if (event.event_type === 'back_button_click') {
        // Find the last timeline entry for this page and mark it
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (timeline[i].pageName === event.page_name) {
            timeline[i].hasBackButton = true;
            break;
          }
        }
      }
    });

    // Mark the last entry
    if (timeline.length > 0) {
      timeline[timeline.length - 1].isLast = true;
    }

    return timeline;
  };

  const timelineEvents = getTimelineEvents();

  const handleExport = () => {
    const csvContent = [
      ['Page', 'Arrived At', 'Time Spent', 'Back Button Used'].join(','),
      ...timelineEvents.map(event => [
        event.displayName,
        format(new Date(event.arrivedAt), 'yyyy-MM-dd HH:mm:ss'),
        event.timeSpent ? `${event.timeSpent}s` : 'N/A',
        event.hasBackButton ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journey_${prolificId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Journey Timeline
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-mono">{prolificId}</span>
            {status && (
              <Badge variant={status === 'Completed' ? 'default' : 'secondary'}>
                {status}
              </Badge>
            )}
            {condition && (
              <Badge variant="outline">{condition}</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No navigation data available for this participant.
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="flex gap-4 py-2 border-b">
              <div className="text-sm">
                <span className="text-muted-foreground">Total Journey Time: </span>
                <span className="font-semibold">{getTotalJourneyTime()}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Pages Visited: </span>
                <span className="font-semibold">{timelineEvents.length}</span>
              </div>
            </div>

            {/* Timeline */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="py-4">
                {timelineEvents.map((event, index) => (
                  <div key={index} className="relative pl-8 pb-6 last:pb-0">
                    {/* Timeline line */}
                    {!event.isLast && (
                      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border" />
                    )}
                    
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-0 top-0 rounded-full border-2 bg-background",
                      event.isLast 
                        ? "w-6 h-6 border-primary flex items-center justify-center" 
                        : "w-6 h-6 border-muted-foreground/30"
                    )}>
                      {event.isLast ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium",
                          event.isLast && "text-primary"
                        )}>
                          {event.displayName}
                        </span>
                        {event.hasBackButton && (
                          <Badge variant="destructive" className="font-normal">
                            <ArrowLeft className="h-3 w-3 mr-1" />
                            Back clicked
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div>
                          Arrived: {format(new Date(event.arrivedAt), 'MMM d, yyyy h:mm:ss a')}
                        </div>
                        <div>
                          Time spent: {formatTime(event.timeSpent)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
